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

import type { PipelineState, InvocationRecord } from "../types.js";
import type { SchedulerResult, AvailableItem } from "../app-types.js";
import type { Command } from "./commands.js";
import type { Effect, TelemetryEventEffect } from "./effects.js";
import type { CommandResult, RunState, createRunState } from "./types.js";
import type { KernelRules } from "./rules.js";
import type { TransitionState } from "../domain/transitions.js";
import { formatStallError, type StalledItem } from "../domain/stall-detection.js";
import {
  isProducerCycleReady,
  type ConsumesEdge,
  type ProducerCycleSummary,
  type SchedulableItem,
} from "../domain/scheduling.js";

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
  /**
   * Per-consumer upstream artifact edges, projected from the workflow's
   * `consumes_artifacts` declarations at kernel construction. Drives the
   * cycle-aware producer-readiness gate inside `getNextBatch()`. Absent
   * for legacy callers (admin CLI, tests) — in which case the scheduler
   * falls back to its structural-edge-only behaviour.
   */
  private readonly consumesByNode: ReadonlyMap<string, ReadonlyArray<ConsumesEdge>> | undefined;

  constructor(
    slug: string,
    initialDagState: PipelineState,
    initialRunState: RunState,
    rules: KernelRules,
    consumesByNode?: ReadonlyMap<string, ReadonlyArray<ConsumesEdge>>,
  ) {
    this.slug = slug;
    this.dagState = structuredClone(initialDagState);
    this.runState = structuredClone(initialRunState);
    this.rules = rules;
    this.consumesByNode = consumesByNode;
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
    // Project `state.artifacts` into a latest-cycle-by-producer map
    // exactly once per tick. Cheap — O(n) over invocation records — and
    // kept local to this call so the kernel never caches stale data.
    const latestProducerOutcome = buildLatestProducerOutcome(this.dagState);
    const gateOpts = this.consumesByNode
      ? { consumesByNode: this.consumesByNode, latestProducerOutcome }
      : undefined;

    const result = this.rules.schedule(
      this.dagState.items,
      this.dagState.dependencies,
      gateOpts,
    );

    // Compute telemetry effects for consumers that passed structural
    // dependencies but were held back by the cycle-aware gate. Addresses
    // the "implicit causal graph" observability gap from the post-mortem
    // — operators see the wait in `pipeline.jsonl` and _TRANS.md.
    const gateEffects = gateOpts
      ? collectGateTelemetry(this.slug, this.dagState, gateOpts)
      : [];

    if (result.kind === "items") {
      const items: AvailableItem[] = result.items.map((i) => ({
        key: i.key,
        label: i.label,
        agent: i.agent,
        status: i.status,
      }));
      return gateEffects.length > 0
        ? { kind: "items", items, gateEffects }
        : { kind: "items", items };
    }

    return gateEffects.length > 0 ? { ...result, gateEffects } : result;
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
    this.dagState = applyRegisterInvocation(this.dagState, input);
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
    this.dagState = applySealInvocation(this.dagState, input);
    effects.push({
      type: "seal-invocation",
      slug: this.slug,
      input,
    });
    return { result: { ok: true }, effects };
  }

  /**
   * External-write sync: used by code paths that mutate the `state.artifacts`
   * ledger via the `StateStore` directly (the batch ledger hooks in
   * `loop/dispatch/invocation-ledger-hooks.ts`) rather than through Commands.
   * Mirrors the final record into the kernel's in-memory snapshot so
   * downstream `dagSnapshot()` readers — notably the input-materialization
   * middleware — see freshly sealed outputs without a disk reload.
   *
   * The method is idempotent and accepts any `InvocationRecord` shape: it
   * upserts by `invocationId`, preferring the provided record as the
   * authoritative version. No effects are emitted — the disk write that
   * preceded this call is the persistence.
   */
  ingestInvocationRecord(record: import("../types.js").InvocationRecord): void {
    if (this.#inFlight) {
      throw new KernelReentryError(
        `PipelineKernel.ingestInvocationRecord() must not be called from ` +
          `inside a kernel command handler.`,
      );
    }
    const artifacts = { ...(this.dagState.artifacts ?? {}) };
    artifacts[record.invocationId] = record;
    const items = this.dagState.items.map((it) =>
      it.key === record.nodeKey
        ? { ...it, latestInvocationId: record.invocationId }
        : it,
    );
    this.dagState = { ...this.dagState, artifacts, items } as PipelineState;
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
        const { state, skippedKeys, demotedKeys } = this.rules.salvage(asTransition, inner.failedItemKey);
        this.dagState = {
          ...this.dagState,
          items: state.items,
          errorLog: state.errorLog,
          ...(state.naBySalvage !== undefined ? { naBySalvage: state.naBySalvage } : {}),
        } as PipelineState;
        effects.push({
          type: "telemetry-event",
          category: "state.salvage",
          itemKey: inner.failedItemKey,
          context: { skippedKeys, demotedKeys },
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
        this.dagState = applyStageInvocation(this.dagState, inner);
        // The reducer just computed `triggeredBy` from the parent record;
        // mirror it on the persisted append so the on-disk ledger entry
        // matches the in-memory copy.
        const stagedRecord = this.dagState.artifacts?.[inner.invocationId];
        effects.push({
          type: "append-invocation-record",
          slug: this.slug,
          input: {
            invocationId: inner.invocationId,
            nodeKey: inner.itemKey,
            trigger: inner.trigger,
            ...(inner.parentInvocationId ? { parentInvocationId: inner.parentInvocationId } : {}),
            ...(inner.producedBy ? { producedBy: inner.producedBy } : {}),
            ...(stagedRecord?.triggeredBy ? { triggeredBy: stagedRecord.triggeredBy } : {}),
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

      case "note-triage-blocked": {
        // A4 — append a sentinel errorLog entry so the triage handler can
        // count repeat $BLOCKED outcomes per failing item across the run.
        // Pure log append; no item mutation, no scheduler-visible effect.
        // The literal `"triage-blocked"` MUST stay in sync with
        // `RESET_OPS.TRIAGE_BLOCKED` in src/types.ts (the handler reads it
        // via that constant). Avoiding a value-import here to keep the
        // kernel free of runtime coupling to the shared types module.
        const newEntry = {
          timestamp: new Date().toISOString(),
          itemKey: "triage-blocked",
          message: `[failing:${inner.failedItemKey}] [domain:${inner.domain}] ${inner.reason}`,
          ...(inner.errorSignature !== undefined && inner.errorSignature !== null
            ? { errorSignature: inner.errorSignature }
            : {}),
        };
        this.dagState = {
          ...this.dagState,
          errorLog: [...this.dagState.errorLog, newEntry],
        } as PipelineState;
        effects.push({
          type: "telemetry-event",
          category: "triage.blocked",
          itemKey: inner.failedItemKey,
          context: {
            domain: inner.domain,
            reason: inner.reason,
            ...(inner.errorSignature ? { errorSignature: inner.errorSignature } : {}),
          },
        });
        return { result: { ok: true }, effects };
      }

      default: {
        const _exhaustive: never = inner;
        return { result: { ok: false, message: `Unknown DagCommand: ${(inner as { type: string }).type}` }, effects };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Artifact ledger reducers — keep `dagState.artifacts` in sync with the
// persisted `_STATE.json` so `dagSnapshot()` consumers (notably the
// input-materialization middleware and context-builder) see invocation
// records without a disk reload. All three helpers are pure: they take the
// current state and return a new state with the artifacts map + affected
// item's `latestInvocationId` pointer updated functionally.
//
// These mirror the write behaviour of `adapters/file-state/artifacts.ts`
// (`appendInvocationRecord`, `stampInvocationStart`, `sealInvocationRecord`).
// The adapter remains the on-disk writer; these reducers are the in-memory
// counterpart.
// ---------------------------------------------------------------------------

function applyRegisterInvocation(
  state: PipelineState,
  input: import("../types.js").AppendInvocationInput,
): PipelineState {
  const artifacts = { ...(state.artifacts ?? {}) };
  const existing = artifacts[input.invocationId];
  if (existing && existing.sealed) {
    // Sealed record is immutable — register is a no-op.
    return state;
  }
  if (existing) {
    // Upsert: merge startedAt and any newly-known metadata. Preserve
    // pre-existing inputs/outputs/parent/producedBy that the caller may
    // not have re-supplied.
    artifacts[input.invocationId] = {
      ...existing,
      ...(input.trigger ? { trigger: input.trigger } : {}),
      ...(input.parentInvocationId
        ? { parentInvocationId: input.parentInvocationId }
        : {}),
      ...(input.producedBy ? { producedBy: input.producedBy } : {}),
      ...(input.triggeredBy ? { triggeredBy: input.triggeredBy } : {}),
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      ...(input.inputs ? { inputs: input.inputs } : {}),
    };
  } else {
    const cycleIndex =
      input.cycleIndex ??
      Object.values(artifacts).filter((r) => r.nodeKey === input.nodeKey)
        .length + 1;
    artifacts[input.invocationId] = {
      invocationId: input.invocationId,
      nodeKey: input.nodeKey,
      cycleIndex,
      trigger: input.trigger,
      ...(input.parentInvocationId
        ? { parentInvocationId: input.parentInvocationId }
        : {}),
      ...(input.producedBy ? { producedBy: input.producedBy } : {}),
      ...(input.triggeredBy ? { triggeredBy: input.triggeredBy } : {}),
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      inputs: input.inputs ?? [],
      outputs: [],
    };
  }
  const items = state.items.map((it) =>
    it.key === input.nodeKey
      ? { ...it, latestInvocationId: input.invocationId }
      : it,
  );
  return { ...state, artifacts, items } as PipelineState;
}

function applySealInvocation(
  state: PipelineState,
  input: import("../types.js").SealInvocationInput,
): PipelineState {
  const artifacts = { ...(state.artifacts ?? {}) };
  const existing = artifacts[input.invocationId];
  if (!existing) {
    // Unknown invocation — nothing to mutate in-memory. The effect executor
    // will still call the StateStore, which owns its own idempotency.
    return state;
  }
  if (existing.sealed) {
    // Idempotent — already sealed.
    return state;
  }
  const mergedOutputs = [
    ...(existing.outputs ?? []),
    ...(input.outputs ?? []),
  ];
  artifacts[input.invocationId] = {
    ...existing,
    outcome: input.outcome,
    finishedAt: input.finishedAt ?? new Date().toISOString(),
    outputs: mergedOutputs,
    sealed: true,
    ...(input.routedTo ? { routedTo: input.routedTo } : {}),
    ...(input.nextFailureHint ? { nextFailureHint: input.nextFailureHint } : {}),
  };
  return { ...state, artifacts } as PipelineState;
}

function applyStageInvocation(
  state: PipelineState,
  inner: Extract<
    import("../handlers/types.js").DagCommand,
    { type: "stage-invocation" }
  >,
): PipelineState {
  const artifacts = { ...(state.artifacts ?? {}) };
  if (!artifacts[inner.invocationId]) {
    const cycleIndex =
      Object.values(artifacts).filter((r) => r.nodeKey === inner.itemKey)
        .length + 1;
    // Derive `triggeredBy` from the parent invocation referenced by the
    // staged record's `parentInvocationId`. This makes the staged record
    // self-describe its cause uniformly with non-staged dispatches that
    // get `triggeredBy` stamped at append time by the dispatch hook.
    const parent = inner.parentInvocationId
      ? artifacts[inner.parentInvocationId]
      : undefined;
    const triggeredBy = parent
      ? {
          nodeKey: parent.nodeKey,
          invocationId: parent.invocationId,
          reason: inner.trigger,
        }
      : undefined;
    artifacts[inner.invocationId] = {
      invocationId: inner.invocationId,
      nodeKey: inner.itemKey,
      cycleIndex,
      trigger: inner.trigger,
      ...(inner.parentInvocationId
        ? { parentInvocationId: inner.parentInvocationId }
        : {}),
      ...(inner.producedBy ? { producedBy: inner.producedBy } : {}),
      ...(triggeredBy ? { triggeredBy } : {}),
      inputs: [],
      outputs: [],
    };
  }
  const items = state.items.map((it) =>
    it.key === inner.itemKey
      ? { ...it, latestInvocationId: inner.invocationId }
      : it,
  );
  return { ...state, artifacts, items } as PipelineState;
}

// ---------------------------------------------------------------------------
// Cycle-aware producer-readiness gate — helpers
// ---------------------------------------------------------------------------

/**
 * Build a `latestProducerOutcome` map from the current invocation ledger.
 * Group records by `nodeKey`, pick the record with the highest `cycleIndex`
 * (tiebreak by lexicographic `invocationId`). The result feeds the domain
 * scheduler's producer-cycle gate.
 */
function buildLatestProducerOutcome(
  state: PipelineState,
): Map<string, ProducerCycleSummary> {
  const out = new Map<string, ProducerCycleSummary>();
  const records = state.artifacts ? Object.values(state.artifacts) : [];
  const latestByNode = new Map<string, InvocationRecord>();
  for (const rec of records) {
    const prior = latestByNode.get(rec.nodeKey);
    if (!prior) {
      latestByNode.set(rec.nodeKey, rec);
      continue;
    }
    if (
      rec.cycleIndex > prior.cycleIndex ||
      (rec.cycleIndex === prior.cycleIndex && rec.invocationId > prior.invocationId)
    ) {
      latestByNode.set(rec.nodeKey, rec);
    }
  }
  for (const [nodeKey, rec] of latestByNode) {
    out.set(nodeKey, {
      cycleIndex: rec.cycleIndex,
      ...(rec.outcome ? { outcome: rec.outcome } : {}),
    });
  }
  return out;
}

/**
 * Emit a `dispatch.gated_on_producer_cycle` telemetry effect for every
 * consumer that passed structural dependencies but is held back by the
 * cycle-aware producer gate. One effect per gated consumer per tick;
 * includes the producer nodeKey, its latest cycleIndex, and that
 * invocation's outcome (or `null` when in-flight).
 */
function collectGateTelemetry(
  slug: string,
  state: PipelineState,
  gateOpts: {
    consumesByNode: ReadonlyMap<string, ReadonlyArray<ConsumesEdge>>;
    latestProducerOutcome: ReadonlyMap<string, ProducerCycleSummary>;
  },
): TelemetryEventEffect[] {
  const effects: TelemetryEventEffect[] = [];
  const statusMap = new Map<string, SchedulableItem["status"]>();
  for (const it of state.items) statusMap.set(it.key, it.status);

  for (const item of state.items) {
    if (item.status !== "pending" && item.status !== "failed") continue;

    // Only consumers whose structural deps pass can be "gated only by the
    // producer-cycle predicate" — otherwise the wait is a plain DAG wait,
    // already visible via item.status.
    const deps = state.dependencies?.[item.key] ?? [];
    const depsResolved = deps.every((depKey) => {
      const depStatus = statusMap.get(depKey);
      return depStatus === "done" || depStatus === "na";
    });
    if (!depsResolved) continue;

    const { ready, gatedOn } = isProducerCycleReady(item.key, statusMap, gateOpts);
    if (ready || gatedOn.length === 0) continue;

    effects.push({
      type: "telemetry-event",
      category: "dispatch.gated_on_producer_cycle",
      itemKey: item.key,
      context: {
        slug,
        gated_on: gatedOn.map((g) => ({
          from: g.from,
          latest_cycle_index: g.latestCycleIndex,
          outcome: g.outcome,
        })),
      },
    });
  }
  return effects;
}
