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
  TriageRecord,
  ExecutionRecord,
} from "../types.js";
import {
  completeItem as completeItemRule,
  failItem as failItemRule,
  resetNodes as resetNodesRule,
  resetScripts as resetScriptsRule,
  resumeAfterElevated as resumeElevatedRule,
  salvageForDraft as salvageForDraftRule,
  findInfraPollKey,
  findInfraDevKey,
  type TransitionState,
} from "../domain/transitions.js";
import { initState as initStateImpl } from "./file-state/init.js";
import { readStateOrThrow, readStateOrNull, writeState } from "./file-state/io.js";
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

/**
 * Persist a `cycleCounters[logKey] = count` update on the state object.
 * Domain reset functions only mutate `errorLog`; the persisted file format
 * also carries the typed counters, so we sync them here.
 */
function bumpCycleCounter(
  state: PipelineState & { cycleCounters?: Record<string, number> },
  logKey: string,
  count: number,
): void {
  if (!state.cycleCounters) state.cycleCounters = {};
  state.cycleCounters[logKey] = count;
}

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

    const statusMap = new Map(state.items.map((i) => [i.key, i.status]));
    const available: Array<{ key: string; label: string; agent: string | null; status: string }> = [];

    for (const item of state.items) {
      if (item.status !== "pending" && item.status !== "failed") continue;
      const deps = state.dependencies?.[item.key] ?? [];
      const depsResolved = deps.every((depKey) => {
        const depStatus = statusMap.get(depKey);
        return depStatus === "done" || depStatus === "na";
      });
      if (depsResolved) {
        available.push({
          key: item.key,
          label: item.label,
          agent: item.agent,
          status: item.status,
        });
      }
    }

    if (available.length === 0) {
      const allDone = state.items.every(
        (i) => i.status === "done" || i.status === "na" || i.status === "dormant",
      );
      if (allDone) {
        return [{ key: null, label: "Pipeline complete", agent: null, status: "complete" }];
      }
      return [{ key: null, label: "Pipeline blocked", agent: null, status: "blocked" }];
    }
    return available;
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

  async setHandoffArtifact(slug: string, itemKey: string, artifactJson: string): Promise<PipelineState> {
    if (!slug || !itemKey || !artifactJson) {
      throw new Error("setHandoffArtifact requires slug, itemKey, and artifactJson");
    }
    try {
      JSON.parse(artifactJson);
    } catch {
      throw new Error(
        `setHandoffArtifact: artifactJson must be valid JSON. Got: ${artifactJson.slice(0, 200)}`,
      );
    }
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const item = findItemOrThrow(state, itemKey);
      item.handoffArtifact = artifactJson;
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

  async setPendingContext(slug: string, itemKey: string, context: string): Promise<PipelineState> {
    if (!slug || !itemKey) throw new Error("setPendingContext requires slug and itemKey");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const item = findItemOrThrow(state, itemKey);
      item.pendingContext = context;
      writeState(slug, state);
      return state;
    });
  }

  async setLastTriageRecord(slug: string, record: TriageRecord): Promise<PipelineState> {
    if (!slug || !record) throw new Error("setLastTriageRecord requires slug and record");
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      state.lastTriageRecord = record;
      writeState(slug, state);
      return state;
    });
  }

  async initState(slug: string, workflowName: string, contextJsonPath?: string): Promise<InitResult> {
    return initStateImpl(slug, workflowName, contextJsonPath);
  }

  // ── Operations not yet on the StateStore port (used by CLI router) ───────
  // These are exposed as instance methods so the slim CLI in pipeline-state.mjs
  // can call into the adapter without knowing about its internals.

  async resetScripts(slug: string, category: string, maxCycles?: number) {
    if (!slug || !category) throw new Error("resetScripts requires slug and category");
    const logKey = `reset-scripts:${category}`;
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const result = resetScriptsRule(state as unknown as TransitionState, category, maxCycles);
      const next = result.state as unknown as PipelineState;
      if (!result.halted) bumpCycleCounter(next, logKey, result.cycleCount);
      writeState(slug, next);
      return { state: next, cycleCount: result.cycleCount, halted: result.halted };
    });
  }

  async resumeAfterElevated(slug: string, maxCycles?: number) {
    if (!slug) throw new Error("resumeAfterElevated requires slug");
    const logKey = "resume-elevated";
    return withLock(slug, () => {
      const state = readStateOrThrow(slug);
      const result = resumeElevatedRule(state as unknown as TransitionState, maxCycles);
      const next = result.state as unknown as PipelineState;
      if (!result.halted) bumpCycleCounter(next, logKey, result.cycleCount);
      writeState(slug, next);
      return { state: next, cycleCount: result.cycleCount, halted: result.halted };
    });
  }

  /**
   * Recover after a failed elevated infra apply: record the failure on the
   * infra CI poll node, then cascade-reset from the infra dev entry point.
   * Composes failItem + resetNodes inside a single lock-scoped operation.
   */
  async recoverElevated(
    slug: string,
    errorMessage: string,
    maxFailCount: number = 10,
    maxDevCycles: number = 5,
  ) {
    if (!slug) throw new Error("recoverElevated requires slug");
    return withLock(slug, () => {
      let state = readStateOrThrow(slug) as unknown as TransitionState;

      // Step 1: record the failure on the infra CI poll node (if any).
      const infraPollKey = findInfraPollKey(state);
      if (infraPollKey) {
        const failed = failItemRule(
          state,
          infraPollKey,
          `Elevated apply failed: ${errorMessage}`,
          maxFailCount,
        );
        state = failed.state;
        if (failed.halted) {
          const next = state as unknown as PipelineState;
          writeState(slug, next);
          return { state: next, failCount: failed.failCount, halted: true };
        }
      }

      // Step 2: cascade-reset from the infra dev entry node.
      const infraDevKey = findInfraDevKey(state);
      if (!infraDevKey) {
        const next = state as unknown as PipelineState;
        writeState(slug, next);
        throw new Error("Cannot recover elevated state: no infrastructure dev node found in DAG.");
      }

      const reason = `Elevated infra apply failed — agent will diagnose and fix TF code. Error: ${errorMessage.slice(0, 200)}`;
      const reset = resetNodesRule(state, infraDevKey, reason, maxDevCycles, "reset-for-dev");
      const next = reset.state as unknown as PipelineState;
      if (!reset.halted) bumpCycleCounter(next, "reset-for-dev", reset.cycleCount);
      writeState(slug, next);
      return { state: next, cycleCount: reset.cycleCount, halted: reset.halted };
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
}
