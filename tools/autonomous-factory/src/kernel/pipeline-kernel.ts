/**
 * kernel/pipeline-kernel.ts — Command-Sourced Pipeline Kernel.
 *
 * The sole owner of pipeline state. All mutations flow through typed
 * Commands processed by the `process()` method. External consumers
 * receive frozen snapshots via `dagSnapshot()` / `runSnapshot()`.
 *
 * The kernel is synchronous and pure (no I/O). Side effects are described
 * as Effect objects returned alongside CommandResults — the caller
 * (effect executor) handles I/O.
 */

import type { PipelineState } from "../types.js";
import type { SchedulerResult, AvailableItem } from "../app-types.js";
import type { Command } from "./commands.js";
import type { Effect } from "./effects.js";
import type { CommandResult, RunState, createRunState } from "./types.js";
import type { KernelRules } from "./rules.js";
import type { TransitionState } from "../domain/transitions.js";
import { formatStallError, type StalledItem } from "../domain/stall-detection.js";

// ---------------------------------------------------------------------------
// ProcessResult — command result + effects
// ---------------------------------------------------------------------------

export interface ProcessResult {
  /** Command processing result. */
  result: CommandResult;
  /** Side effects to execute (persist state, emit telemetry, etc.). */
  effects: Effect[];
}

// ---------------------------------------------------------------------------
// PipelineKernel
// ---------------------------------------------------------------------------

/**
 * Phase 2.2 — thrown by `PipelineKernel.process()` when a nested (re-entrant)
 * call is detected. The kernel is the sole state writer; any code path that
 * appears to recurse into `process()` indicates an effect is being consumed
 * inline instead of returned to the caller.
 */
export class KernelReentryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KernelReentryError";
  }
}

export class PipelineKernel {
  private dagState: PipelineState;
  private runState: RunState;
  private readonly rules: KernelRules;
  private readonly slug: string;
  /** Phase 2.2 — single-writer re-entrance guard. Flips to `true` for the
   *  duration of `process()`; a nested call throws `KernelReentryError`
   *  instead of silently corrupting state. */
  #inFlight = false;

  constructor(
    slug: string,
    initialDagState: PipelineState,
    initialRunState: RunState,
    rules: KernelRules,
  ) {
    this.slug = slug;
    this.dagState = structuredClone(initialDagState);
    this.runState = structuredClone(initialRunState);
    this.rules = rules;
  }

  // ─── Snapshots (frozen reads) ───────────────────────────────────────

  /** Frozen copy of the DAG state. */
  dagSnapshot(): Readonly<PipelineState> {
    return structuredClone(this.dagState);
  }

  /** Frozen copy of the run state. */
  runSnapshot(): Readonly<RunState> {
    return structuredClone(this.runState);
  }

  // ─── Scheduling ─────────────────────────────────────────────────────

  /** Get the next batch of dispatchable items from the DAG. */
  getNextBatch(): SchedulerResult {
    const result = this.rules.schedule(
      this.dagState.items,
      this.dagState.dependencies,
    );

    if (result.kind === "items") {
      const items: AvailableItem[] = result.items.map((i) => ({
        key: i.key,
        label: i.label,
        agent: i.agent,
        status: i.status,
      }));
      return { kind: "items", items };
    }

    return result;
  }

  // ─── Stall detection (DAG-level wait timeout) ───────────────────────

  /**
   * Compute `FailItemCommand`s for any pending items whose wait for upstream
   * deps has exceeded their `ready_within_hours` budget.
   *
   * `pendingSinceMs` is derived per-key as the latest of:
   *   - pipeline start time, and
   *   - the most recent reset-op log entry whose message references the key.
   *
   * The returned commands should be processed by the caller; stall failures
   * then flow through the standard `on_failure.triage` path like any other
   * failure.
   */
  collectStallCommands(
    nowMs: number,
    readyWithinHoursByKey: ReadonlyMap<string, number>,
  ): Command[] {
    if (readyWithinHoursByKey.size === 0) return [];

    const startedMs = Date.parse(this.dagState.started);
    const pipelineStartMs = Number.isFinite(startedMs) ? startedMs : nowMs;
    const pendingSinceMsByKey = new Map<string, number>();

    for (const item of this.dagState.items) {
      if (item.status !== "pending") continue;
      // Latest reset-op entry mentioning this key re-sets the pending clock.
      let pendingSince = pipelineStartMs;
      for (const entry of this.dagState.errorLog) {
        if (!entry.itemKey.startsWith("reset-")) continue;
        if (!entry.message.includes(item.key)) continue;
        const ts = Date.parse(entry.timestamp);
        if (Number.isFinite(ts) && ts > pendingSince) pendingSince = ts;
      }
      pendingSinceMsByKey.set(item.key, pendingSince);
    }

    const stalled = this.rules.detectStalls(
      this.dagState.items,
      nowMs,
      pendingSinceMsByKey,
      readyWithinHoursByKey,
    );

    return stalled.map((s: StalledItem): Command => ({
      type: "fail-item",
      itemKey: s.key,
      message: formatStallError(s),
    }));
  }

  // ─── Command processing ─────────────────────────────────────────────

  /** Process a command and return the result + effects. */
  process(cmd: Command): ProcessResult {
    if (this.#inFlight) {
      throw new KernelReentryError(
        `PipelineKernel.process() is not re-entrant. ` +
          `A nested call was made while processing command "${cmd.type}". ` +
          `Effects must be consumed by the caller — never recursively fed ` +
          `back into the kernel inside a command handler.`,
      );
    }
    this.#inFlight = true;
    try {
      return this.#processInner(cmd);
    } finally {
      this.#inFlight = false;
    }
  }

  #processInner(cmd: Command): ProcessResult {
    const effects: Effect[] = [];

    switch (cmd.type) {
      case "complete-item":
        return this.processComplete(cmd.itemKey, effects);
      case "fail-item":
        return this.processFail(
          cmd.itemKey,
          cmd.message,
          cmd.maxFailures,
          effects,
          cmd.haltOnIdentical,
          cmd.haltOnIdenticalThreshold,
          cmd.haltOnIdenticalExcludedKeys,
          cmd.errorSignature,
        );
      case "record-attempt":
        return this.processRecordAttempt(cmd.itemKey, effects);
      case "record-summary":
        return this.processRecordSummary(cmd.summary, effects);
      case "record-handler-output":
        return this.processRecordHandlerOutput(cmd.itemKey, cmd.output, effects);
      case "record-pre-step-ref":
        return this.processRecordPreStepRef(cmd.itemKey, cmd.sha, effects);
      case "record-force-run":
        return this.processRecordForceRun(cmd.itemKey, cmd.changesDetected, effects);
      case "record-execution":
        return this.processRecordExecution(cmd.record, effects);
      case "register-invocation":
        return this.processRegisterInvocation(cmd.input, effects);
      case "seal-invocation":
        return this.processSealInvocation(cmd.input, effects);
      case "dag-command":
        return this.processDagCommand(cmd.inner, effects);
      default: {
        const _exhaustive: never = cmd;
        return { result: { ok: false, message: `Unknown command: ${(cmd as { type: string }).type}` }, effects };
      }
    }
  }

  // ─── Individual command processors ──────────────────────────────────

  private processComplete(itemKey: string, effects: Effect[]): ProcessResult {
    const asTransition = this.dagState as unknown as TransitionState;
    const { state } = this.rules.complete(asTransition, itemKey);
    this.dagState = { ...this.dagState, items: state.items } as PipelineState;
    effects.push({
      type: "telemetry-event",
      category: "state.complete",
      itemKey,
    });
    return { result: { ok: true }, effects };
  }

  private processFail(
    itemKey: string,
    message: string,
    maxFailures: number | undefined,
    effects: Effect[],
    haltOnIdentical?: boolean,
    haltOnIdenticalThreshold?: number,
    haltOnIdenticalExcludedKeys?: readonly string[],
    overrideSignature?: string,
  ): ProcessResult {
    const asTransition = this.dagState as unknown as TransitionState;
    const { state, failCount, halted, haltedByThreshold, thresholdMatchCount, errorSignature } = this.rules.fail(
      asTransition,
      itemKey,
      message,
      {
        maxFailures,
        haltOnIdentical,
        haltOnIdenticalThreshold,
        haltOnIdenticalExcludedKeys,
        overrideSignature,
      },
    );
    this.dagState = {
      ...this.dagState,
      items: state.items,
      errorLog: state.errorLog,
    } as PipelineState;
    effects.push({
      type: "telemetry-event",
      category: "state.fail",
      itemKey,
      context: { failCount, halted, haltedByThreshold },
    });
    // Feature-scoped threshold halt — emit a halt-artifact effect so the
    // adapter can write <slug>_HALT.md with the N identical failures.
    if (haltedByThreshold && errorSignature && haltOnIdenticalThreshold) {
      const samples = state.errorLog
        .filter((e) => e.errorSignature === errorSignature)
        .map((e) => ({ itemKey: e.itemKey, timestamp: e.timestamp, message: e.message }));
      effects.push({
        type: "write-halt-artifact",
        slug: this.slug,
        failingItemKey: itemKey,
        errorSignature,
        thresholdMatchCount: thresholdMatchCount ?? samples.length,
        threshold: haltOnIdenticalThreshold,
        sampleFailures: samples,
      });
    }
    return {
      result: {
        ok: true,
        halt: halted,
        message: halted
          ? (haltedByThreshold
              ? `Halt-on-identical threshold reached (${thresholdMatchCount}/${haltOnIdenticalThreshold}) for signature ${errorSignature} — most recent failure on "${itemKey}"`
              : `Max failures (${failCount}) reached for ${itemKey}`)
          : undefined,
      },
      effects,
    };
  }

  private processRecordAttempt(itemKey: string, effects: Effect[]): ProcessResult {
    const current = this.runState.attemptCounts[itemKey] ?? 0;
    this.runState = {
      ...this.runState,
      attemptCounts: {
        ...this.runState.attemptCounts,
        [itemKey]: current + 1,
      },
    };
    return { result: { ok: true }, effects };
  }

  private processRecordSummary(summary: import("../types.js").ItemSummary, effects: Effect[]): ProcessResult {
    this.runState = {
      ...this.runState,
      pipelineSummaries: [...this.runState.pipelineSummaries, summary],
    };
    return { result: { ok: true }, effects };
  }

  private processRecordHandlerOutput(
    itemKey: string,
    output: import("../app-types.js").HandlerOutputBag,
    effects: Effect[],
  ): ProcessResult {
    this.runState = {
      ...this.runState,
      handlerOutputs: {
        ...this.runState.handlerOutputs,
        [itemKey]: { ...(this.runState.handlerOutputs[itemKey] ?? {}), ...output },
      },
    };
    return { result: { ok: true }, effects };
  }

  private processRecordPreStepRef(itemKey: string, sha: string, effects: Effect[]): ProcessResult {
    this.runState = {
      ...this.runState,
      preStepRefs: { ...this.runState.preStepRefs, [itemKey]: sha },
    };
    return { result: { ok: true }, effects };
  }

  private processRecordForceRun(itemKey: string, changesDetected: boolean, effects: Effect[]): ProcessResult {
    this.runState = {
      ...this.runState,
      forceRunChangesDetected: {
        ...this.runState.forceRunChangesDetected,
        [itemKey]: changesDetected,
      },
    };
    return { result: { ok: true }, effects };
  }

  private processRecordExecution(record: import("../types.js").ExecutionRecord, effects: Effect[]): ProcessResult {
    effects.push({
      type: "persist-execution-record",
      slug: this.slug,
      record,
    });
    return { result: { ok: true }, effects };
  }

  private processRegisterInvocation(
    input: import("../types.js").AppendInvocationInput,
    effects: Effect[],
  ): ProcessResult {
    effects.push({
      type: "append-invocation-record",
      slug: this.slug,
      input,
    });
    return { result: { ok: true }, effects };
  }

  private processSealInvocation(
    input: import("../types.js").SealInvocationInput,
    effects: Effect[],
  ): ProcessResult {
    effects.push({
      type: "seal-invocation",
      slug: this.slug,
      input,
    });
    return { result: { ok: true }, effects };
  }

  private processDagCommand(
    inner: import("../handlers/types.js").DagCommand,
    effects: Effect[],
  ): ProcessResult {
    switch (inner.type) {
      case "reset-nodes": {
        const asTransition = this.dagState as unknown as TransitionState;
        const { state, cycleCount, halted, rejectedReason } = this.rules.reset(
          asTransition,
          inner.seedKey,
          inner.reason,
          inner.maxCycles,
          inner.logKey,
        );
        this.dagState = {
          ...this.dagState,
          items: state.items,
          errorLog: state.errorLog,
        } as PipelineState;
        effects.push({
          type: "telemetry-event",
          category: "state.reset",
          itemKey: inner.seedKey,
          context: {
            seedKey: inner.seedKey,
            cycleCount,
            halted,
            reason: inner.reason,
            ...(rejectedReason ? { rejectedReason } : {}),
          },
        });
        if (rejectedReason === "salvaged") {
          return {
            result: {
              ok: false,
              halt: false,
              message: `Reset of "${inner.seedKey}" rejected: item is salvaged (sticky)`,
            },
            effects,
          };
        }
        return {
          result: { ok: true, halt: halted, message: halted ? `Cycle budget exhausted at ${cycleCount}` : undefined },
          effects,
        };
      }

      case "salvage-draft": {
        const asTransition = this.dagState as unknown as TransitionState;
        const { state, skippedKeys } = this.rules.salvage(asTransition, inner.failedItemKey);
        this.dagState = {
          ...this.dagState,
          items: state.items,
          errorLog: state.errorLog,
        } as PipelineState;
        effects.push({
          type: "telemetry-event",
          category: "state.salvage",
          itemKey: inner.failedItemKey,
          context: { skippedKeys },
        });
        return { result: { ok: true }, effects };
      }

      case "stage-invocation": {
        // Reserve an unsealed `InvocationRecord` for the target node's next
        // dispatch. Replaces the old `set-pending-context` flow: instead of
        // decorating `PipelineItem.pendingContext` (Phase 6 — removed), we
        // add a record to
        // `state.artifacts` that the dispatch hook will stamp `startedAt`
        // on (rather than appending a fresh sibling). The dispatcher
        // adopts the staged record by reading `item.latestInvocationId`.
        // Phase 6 — re-entrance prose no longer rides on the staged record;
        // re-entrance context flows through the `triage-handoff` JSON
        // artifact (declared via `consumes_reroute`) which Phase 3's
        // `materializeInputsMiddleware` copies into `<inv>/inputs/`
        // before the dev agent runs.
        const stagedItems = this.dagState.items.map((it) =>
          it.key === inner.itemKey
            ? { ...it, latestInvocationId: inner.invocationId }
            : it,
        );
        this.dagState = { ...this.dagState, items: stagedItems } as PipelineState;
        effects.push({
          type: "append-invocation-record",
          slug: this.slug,
          input: {
            invocationId: inner.invocationId,
            nodeKey: inner.itemKey,
            trigger: inner.trigger,
            ...(inner.parentInvocationId ? { parentInvocationId: inner.parentInvocationId } : {}),
            ...(inner.producedBy ? { producedBy: inner.producedBy } : {}),
            // No `startedAt` — the staged record has no run time yet; the
            // dispatch hook stamps it when the handler begins.
          },
        });
        return { result: { ok: true }, effects };
      }

      case "reindex":
        effects.push({
          type: "reindex",
          categories: inner.categories,
        });
        return { result: { ok: true }, effects };

      default: {
        const _exhaustive: never = inner;
        return { result: { ok: false, message: `Unknown DagCommand: ${(inner as { type: string }).type}` }, effects };
      }
    }
  }
}
