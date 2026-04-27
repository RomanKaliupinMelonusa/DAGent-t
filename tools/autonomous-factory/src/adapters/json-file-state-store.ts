/**
 * adapters/json-file-state-store.ts — File-based StateStore adapter.
 *
 * Owns all persistence I/O for the pipeline state machine:
 *  - Holds the POSIX file lock around every read→mutate→write cycle
 *  - Reads/writes _STATE.json (and re-renders _TRANS.md on every write)
 *  - Delegates state mutations to pure functions in `domain/transitions.ts`
 *  - Keeps the persisted `cycleCounters` field in sync with reset operations
 *
 * No `.mjs` delegation — this is the canonical implementation.
 */

import type { StateStore } from "../ports/state-store.js";
import type {
  PipelineState,
  PipelineItem,
  FailResult,
  ResetResult,
  InitResult,
  ExecutionRecord,
  InvocationRecord,
  AppendInvocationInput,
  SealInvocationInput,
} from "../types.js";
import {
  completeItem as completeItemRule,
  failItem as failItemRule,
  resetNodes as resetNodesRule,
  salvageForDraft as salvageForDraftRule,
  type TransitionState,
} from "../domain/transitions.js";
import { schedule as scheduleRule } from "../domain/scheduling.js";
import {
  applyAdminCommand,
  bumpCycleCounter,
  type AdminCommand,
} from "../kernel/admin.js";
import { initState as initStateImpl } from "./file-state/init.js";
import { readStateOrThrow, readStateOrNull, writeState } from "./file-state/io.js";
import {
  appendInvocationRecord as appendInvocationRecordImpl,
  sealInvocationRecord as sealInvocationRecordImpl,
  stampInvocationStart as stampInvocationStartImpl,
  attachInvocationInputs as attachInvocationInputsImpl,
  attachInvocationRoutedTo as attachInvocationRoutedToImpl,
} from "./file-state/artifacts.js";
import { withLock } from "./file-state/lock.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Re-find an item or throw with the canonical "valid keys" message. */
function findItemOrThrow(state: PipelineState, itemKey: string): PipelineItem {
  const item = state.items.find((i) => i.key === itemKey);
  if (!item) {
    throw new Error(
      `Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`,
    );
  }
  return item;
}

// Phase 6 — `renderTriageHandoffMarkdown` removed. Triage now writes the
// structured `triage-handoff` JSON artifact directly; the rerouted dev
// agent reads it from `inputs/triage-handoff.json`.


// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class JsonFileStateStore implements StateStore {
  // ── Reads ─────────────────────────────────────────────────────────────────

  async getStatus(slug: string): Promise<PipelineState> {
    if (!slug) throw new Error("getStatus requires slug");
    return readStateOrThrow(slug);
  }

  async readState(slug: string): Promise<PipelineState | null> {
    if (!slug) throw new Error("readState requires slug");
    return readStateOrNull(slug);
  }

  async getNextAvailable(slug: string): Promise<Array<{
    key: string | null;
    label: string;
    agent: string | null;
    status: string;
  }>> {
    if (!slug) throw new Error("getNextAvailable requires slug");
    const state = readStateOrThrow(slug);

    // Delegate to the canonical domain predicate so the admin CLI view
    // stays in lockstep with the kernel's `getNextBatch()`. The adapter
    // deliberately does NOT pass the cycle-aware producer-gate options:
    // admin callers (pipeline:status/next) have no APM context at hand
    // and the CLI is inspection-only. Legacy edge-only readiness here
    // remains a strict subset of — not a divergence from — the loop's
    // gated view.
    const result = scheduleRule(state.items, state.dependencies ?? {});

    if (result.kind === "items") {
      return result.items.map((i) => ({
        key: i.key,
        label: i.label,
        agent: i.agent,
        status: i.status,
      }));
    }
    if (result.kind === "complete") {
      return [{ key: null, label: "Pipeline complete", agent: null, status: "complete" }];
    }
    return [{ key: null, label: "Pipeline blocked", agent: null, status: "blocked" }];
  }

  // ── DAG-shaped mutations (delegate to pure domain) ───────────────────────

  async completeItem(slug: string, itemKey: string): Promise<PipelineState> {
    if (!slug || !itemKey) throw new Error("completeItem requires slug and itemKey");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      findItemOrThrow(state, itemKey); // canonical error message
      const result = completeItemRule(state as unknown as TransitionState, itemKey);
      const next = result.state as unknown as PipelineState;
      writeState(slug, next);
      return next;
    });
  }

  async failItem(
    slug: string,
    itemKey: string,
    message: string,
    maxFailures?: number,
  ): Promise<FailResult> {
    if (!slug || !itemKey) throw new Error("failItem requires slug and itemKey");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      findItemOrThrow(state, itemKey);
      const result = failItemRule(state as unknown as TransitionState, itemKey, message, maxFailures);
      const next = result.state as unknown as PipelineState;
      writeState(slug, next);
      return { state: next, failCount: result.failCount, halted: result.halted };
    });
  }

  async resetNodes(
    slug: string,
    seedKey: string,
    reason: string,
    maxCycles?: number,
    logKey?: string,
  ): Promise<ResetResult> {
    if (!slug || !seedKey) throw new Error("resetNodes requires slug and seedKey");
    const effectiveLogKey = logKey ?? "reset-nodes";
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const result = resetNodesRule(
        state as unknown as TransitionState,
        seedKey,
        reason,
        maxCycles,
        effectiveLogKey,
      );
      const next = result.state as unknown as PipelineState;
      if (!result.halted) bumpCycleCounter(next, effectiveLogKey, result.cycleCount);
      writeState(slug, next);
      return { state: next, cycleCount: result.cycleCount, halted: result.halted };
    });
  }

  async salvageForDraft(slug: string, failedItemKey: string): Promise<PipelineState> {
    if (!slug || !failedItemKey) throw new Error("salvageForDraft requires slug and failedItemKey");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const result = salvageForDraftRule(state as unknown as TransitionState, failedItemKey);
      const next = result.state as unknown as PipelineState;
      writeState(slug, next);
      return next;
    });
  }

  // ── Simple setters (trivial mutations — no domain rule needed) ───────────

  async setDocNote(slug: string, itemKey: string, note: string): Promise<PipelineState> {
    if (!slug || !itemKey || !note) throw new Error("setDocNote requires slug, itemKey, and note");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const item = findItemOrThrow(state, itemKey);
      item.docNote = note;
      writeState(slug, state);
      return state;
    });
  }

  async setNote(slug: string, note: string): Promise<PipelineState> {
    if (!slug || !note) throw new Error("setNote requires slug and note");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      state.implementationNotes = state.implementationNotes
        ? state.implementationNotes + "\n\n" + note
        : note;
      writeState(slug, state);
      return state;
    });
  }

  async setUrl(slug: string, url: string): Promise<PipelineState> {
    if (!slug || !url) throw new Error("setUrl requires slug and url");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      state.deployedUrl = url;
      writeState(slug, state);
      return state;
    });
  }

  async persistDagSnapshot(slug: string, snapshot: PipelineState): Promise<PipelineState> {
    if (!slug || !snapshot) throw new Error("persistDagSnapshot requires slug and snapshot");
    return withLock(slug, () => {
      const disk = readStateOrThrow(slug);
      // Merge DAG-shaped fields from the kernel snapshot over the on-disk
      // state. Per-item side-setter fields (docNote) are preserved from
      // disk so a non-kernel writer that raced ahead isn't clobbered by
      // the kernel's item list (which carries only status + error).
      const diskItemsByKey = new Map(disk.items.map((i) => [i.key, i]));
      const mergedItems = snapshot.items.map((kernelItem) => {
        const diskItem = diskItemsByKey.get(kernelItem.key);
        if (!diskItem) return kernelItem;
        return {
          ...diskItem,
          status: kernelItem.status,
          error: kernelItem.error,
          // Preserve Phase 2 artifact-bus pointer from disk unless the kernel
          // explicitly moved it forward (new dispatch / staged invocation).
          latestInvocationId:
            kernelItem.latestInvocationId ?? diskItem.latestInvocationId,
        };
      });
      // cycleCounters: kernel is the authoritative writer (mutated via
      // applyAdminCommand / applyDagCommand). `backfillCycleCounters` on read
      // is a legacy migration path for state files predating this field.
      const next: PipelineState = {
        ...disk,
        items: mergedItems,
        errorLog: snapshot.errorLog,
        cycleCounters: snapshot.cycleCounters ?? disk.cycleCounters ?? {},
        implementationNotes: snapshot.implementationNotes ?? disk.implementationNotes,
        deployedUrl: snapshot.deployedUrl ?? disk.deployedUrl,
        salvageSurvivors: snapshot.salvageSurvivors ?? disk.salvageSurvivors,
        // Artifact-bus invocation ledger is an append-only side table —
        // always keep the on-disk copy so a concurrent appendInvocationRecord
        // writer isn't clobbered by a DAG snapshot that never loaded it.
        artifacts: disk.artifacts ?? snapshot.artifacts ?? {},
      };
      writeState(slug, next);
      return next;
    });
  }

  async initState(slug: string, workflowName: string, contextJsonPath?: string): Promise<InitResult> {
    return initStateImpl(slug, workflowName, contextJsonPath);
  }

  async writeHaltArtifact(slug: string, content: string): Promise<void> {
    // Best-effort write — halt signal lives in the kernel / telemetry, the
    // file is just an operator-facing pointer. Swallow failures to avoid
    // masking the halt reason itself.
    try {
      const { writeFile, mkdir } = await import("node:fs/promises");
      const { getWorkDir } = await import("./file-state/io.js");
      const { dirname } = await import("node:path");
      const { featurePath } = await import("./feature-paths.js");
      const IN_PROGRESS = getWorkDir();
      const target = featurePath(dirname(IN_PROGRESS), slug, "halt");
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf-8");
    } catch {
      // non-fatal
    }
  }

  // ── Admin operations (Phase 3: prefer `runAdminCommand` in kernel/admin.ts) ─
  // These instance methods remain as convenient adapter-internal shortcuts,
  // but the canonical entry point for CLI admin verbs is now
  // `runAdminCommand(host, slug, cmd)` where `host.withLockedWrite` delegates
  // back to this adapter's lock. All three methods below go through the same
  // pure reducer (`applyAdminCommand`) that `runAdminCommand` calls, so CLI
  // and kernel paths produce byte-identical state by construction.

  /** @internal Prefer `runAdminCommand` in kernel/admin.ts. */
  async resetScripts(slug: string, category: string, maxCycles?: number) {
    if (!slug || !category) throw new Error("resetScripts requires slug and category");
    return this.#runAdmin(slug, { type: "reset-scripts", category, maxCycles });
  }

  /** @internal Prefer `runAdminCommand` in kernel/admin.ts. */
  async resumeAfterElevated(slug: string, maxCycles?: number) {
    if (!slug) throw new Error("resumeAfterElevated requires slug");
    return this.#runAdmin(slug, { type: "resume-after-elevated", maxCycles });
  }

  /**
   * @internal Prefer `runAdminCommand` in kernel/admin.ts.
   * Recover after a failed elevated infra apply: composes failItem +
   * resetNodes inside a single lock-scoped operation via the pure reducer.
   */
  async recoverElevated(
    slug: string,
    errorMessage: string,
    maxFailCount: number = 10,
    maxDevCycles: number = 5,
  ) {
    if (!slug) throw new Error("recoverElevated requires slug");
    return this.#runAdmin(slug, {
      type: "recover-elevated",
      errorMessage,
      maxFailCount,
      maxDevCycles,
    });
  }

  async #runAdmin(slug: string, cmd: AdminCommand): Promise<{ state: PipelineState; cycleCount: number; halted: boolean; failCount?: number }> {
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const result = applyAdminCommand(state, cmd);
      writeState(slug, result.state);
      const base = { state: result.state, cycleCount: result.cycleCount, halted: result.halted };
      return result.kind === "recover-elevated" && result.failCount !== undefined
        ? { ...base, failCount: result.failCount }
        : base;
    });
  }

  /**
   * Execute `fn` under the state-store lock: receive the current state,
   * produce the next state plus an arbitrary result value. Used by
   * `runAdminCommand` in kernel/admin.ts so the CLI can drive admin
   * transitions through the same atomic path the adapter uses internally.
   */
  async withLockedWrite<T>(
    slug: string,
    fn: (state: PipelineState) => { next: PipelineState; result: T },
  ): Promise<T> {
    if (!slug) throw new Error("withLockedWrite requires slug");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const { next, result } = fn(state);
      writeState(slug, next);
      return result;
    });
  }

  /** Append an execution record to the persisted execution log. */
  async persistExecutionRecord(slug: string, record: ExecutionRecord): Promise<PipelineState> {
    if (!slug || !record) throw new Error("persistExecutionRecord requires slug and record");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      if (!state.executionLog) state.executionLog = [];
      state.executionLog.push(record);
      writeState(slug, state);
      return state;
    });
  }

  // ── Artifact Bus — invocation ledger (Phase 2) ────────────────────────────

  async appendInvocationRecord(
    slug: string,
    input: AppendInvocationInput,
  ): Promise<InvocationRecord> {
    if (!slug) throw new Error("appendInvocationRecord requires slug");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const rec = appendInvocationRecordImpl(state, slug, input);
      writeState(slug, state);
      return rec;
    });
  }

  async stampInvocationStart(
    slug: string,
    invocationId: string,
    startedAt: string,
  ): Promise<InvocationRecord> {
    if (!slug) throw new Error("stampInvocationStart requires slug");
    if (!invocationId) throw new Error("stampInvocationStart requires invocationId");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const rec = stampInvocationStartImpl(state, invocationId, startedAt);
      writeState(slug, state);
      return rec;
    });
  }

  async sealInvocation(
    slug: string,
    input: SealInvocationInput,
  ): Promise<InvocationRecord> {
    if (!slug) throw new Error("sealInvocation requires slug");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const rec = sealInvocationRecordImpl(state, slug, input);
      writeState(slug, state);
      return rec;
    });
  }

  async attachInvocationInputs(
    slug: string,
    invocationId: string,
    inputs: InvocationRecord["inputs"],
  ): Promise<InvocationRecord> {
    if (!slug) throw new Error("attachInvocationInputs requires slug");
    if (!invocationId) throw new Error("attachInvocationInputs requires invocationId");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const rec = attachInvocationInputsImpl(state, slug, invocationId, inputs);
      writeState(slug, state);
      return rec;
    });
  }

  async attachInvocationRoutedTo(
    slug: string,
    invocationId: string,
    routedTo: NonNullable<InvocationRecord["routedTo"]>,
  ): Promise<InvocationRecord> {
    if (!slug) throw new Error("attachInvocationRoutedTo requires slug");
    if (!invocationId) throw new Error("attachInvocationRoutedTo requires invocationId");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const rec = attachInvocationRoutedToImpl(state, slug, invocationId, routedTo);
      writeState(slug, state);
      return rec;
    });
  }

  async getInvocationRecord(
    slug: string,
    invocationId: string,
  ): Promise<InvocationRecord | null> {
    if (!slug) throw new Error("getInvocationRecord requires slug");
    const state = readStateOrNull(slug);
    if (!state?.artifacts) return null;
    return state.artifacts[invocationId] ?? null;
  }

  async listInvocationRecords(
    slug: string,
    nodeKey: string,
  ): Promise<InvocationRecord[]> {
    if (!slug) throw new Error("listInvocationRecords requires slug");
    const state = readStateOrNull(slug);
    if (!state?.artifacts) return [];
    return Object.values(state.artifacts)
      .filter((r) => r.nodeKey === nodeKey)
      .sort((a, b) => a.invocationId.localeCompare(b.invocationId));
  }
}
