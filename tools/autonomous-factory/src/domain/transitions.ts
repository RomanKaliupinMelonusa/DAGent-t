/**
 * domain/transitions.ts — Pure state transition reducers.
 *
 * Each function takes the current pipeline state and returns a new state
 * with the transition applied. No I/O, no file locking, no side effects.
 * The persistence layer (adapter) handles file I/O and locking.
 */

import { getDownstream, cascadeBarriers } from "./dag-graph.js";
import { computeErrorSignature } from "./error-signature.js";

// ---------------------------------------------------------------------------
// Minimal state shape (no dependency on the full PipelineState type)
// ---------------------------------------------------------------------------

export interface TransitionItem {
  key: string;
  label: string;
  agent: string | null;
  status: "pending" | "done" | "failed" | "na" | "dormant";
  error: string | null;
  docNote?: string | null;
  handoffArtifact?: string | null;
  pendingContext?: string | null;
}

export interface ErrorLogEntry {
  timestamp: string;
  itemKey: string;
  message: string;
  errorSignature?: string | null;
}

export interface TransitionState {
  items: TransitionItem[];
  errorLog: ErrorLogEntry[];
  dependencies: Record<string, string[]>;
  nodeTypes: Record<string, string>;
  nodeCategories: Record<string, string>;
  naByType: string[];
  salvageSurvivors: string[];
  dormantByActivation?: string[];
  [key: string]: unknown; // allow pass-through of other fields
}

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

export interface CompleteResult {
  state: TransitionState;
}

/**
 * Mark a pipeline item as completed.
 * Idempotent: N/A items are silently skipped; already-done items are no-ops.
 */
export function completeItem(
  state: TransitionState,
  itemKey: string,
): CompleteResult {
  const item = state.items.find((i) => i.key === itemKey);
  if (!item) {
    throw new Error(
      `Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`,
    );
  }
  if (item.status === "na" || item.status === "done") {
    return { state };
  }
  const newItems = state.items.map((i) =>
    i.key === itemKey ? { ...i, status: "done" as const, error: null } : i,
  );
  return { state: { ...state, items: newItems } };
}

// ---------------------------------------------------------------------------
// Fail
// ---------------------------------------------------------------------------

export interface FailResult {
  state: TransitionState;
  failCount: number;
  halted: boolean;
}

/**
 * Record a failure for a pipeline item.
 * Returns the updated state, the cumulative fail count, and whether the
 * maximum failure budget is exhausted.
 */
export function failItem(
  state: TransitionState,
  itemKey: string,
  message: string,
  maxFailures: number = 10,
): FailResult {
  const item = state.items.find((i) => i.key === itemKey);
  if (!item) {
    throw new Error(
      `Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`,
    );
  }

  const newItems = state.items.map((i) =>
    i.key === itemKey
      ? { ...i, status: "failed" as const, error: message || "Unknown failure" }
      : i,
  );

  const newEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    itemKey,
    message: message || "Unknown failure",
    errorSignature: message ? computeErrorSignature(message) : null,
  };
  const newErrorLog = [...state.errorLog, newEntry];
  const failCount = newErrorLog.filter((e) => e.itemKey === itemKey).length;

  return {
    state: { ...state, items: newItems, errorLog: newErrorLog },
    failCount,
    halted: failCount >= maxFailures,
  };
}

// ---------------------------------------------------------------------------
// Reset nodes (DAG-cascading reset)
// ---------------------------------------------------------------------------

export interface ResetResult {
  state: TransitionState;
  cycleCount: number;
  halted: boolean;
  resetKeys: string[];
}

/**
 * Reset a seed node + all transitive downstream dependents to pending.
 * Barrier nodes in the cascade are included automatically.
 * Dormant nodes stay dormant unless they are the explicit seed.
 */
export function resetNodes(
  state: TransitionState,
  seedKey: string,
  reason: string,
  maxCycles: number = 5,
  logKey: string = "reset-nodes",
): ResetResult {
  const cycleCount = state.errorLog.filter((e) => e.itemKey === logKey).length;
  if (cycleCount >= maxCycles) {
    return { state, cycleCount, halted: true, resetKeys: [] };
  }

  const keysToReset = new Set(getDownstream(state.dependencies, [seedKey]));
  cascadeBarriers(state.dependencies, state.nodeTypes, keysToReset);

  const newItems = state.items.map((i) => {
    if (!keysToReset.has(i.key) || i.status === "na") return i;
    // Dormant nodes only activate if they are the explicit seed
    if (i.status === "dormant" && i.key !== seedKey) return i;
    return { ...i, status: "pending" as const, error: null };
  });

  const newEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    itemKey: logKey,
    message: `Reset cycle ${cycleCount + 1}/${maxCycles}: ${reason}. Reset items: ${[...keysToReset].join(", ")}`,
    errorSignature: reason ? computeErrorSignature(reason) : null,
  };

  return {
    state: { ...state, items: newItems, errorLog: [...state.errorLog, newEntry] },
    cycleCount: cycleCount + 1,
    halted: false,
    resetKeys: [...keysToReset],
  };
}

// ---------------------------------------------------------------------------
// Salvage for draft PR
// ---------------------------------------------------------------------------

export interface SalvageResult {
  state: TransitionState;
  skippedKeys: string[];
}

/**
 * Graceful degradation — skip downstream nodes and jump to finalization
 * for a Draft PR. Returns the list of keys that were marked N/A.
 */
export function salvageForDraft(
  state: TransitionState,
  failedItemKey: string,
): SalvageResult {
  // Idempotency guard
  if (state.errorLog.some((e) => e.itemKey === "salvage-draft")) {
    return { state, skippedKeys: [] };
  }

  const skipKeys = new Set(getDownstream(state.dependencies, [failedItemKey]));
  const forcePendingKeys = new Set(
    state.salvageSurvivors.length > 0
      ? state.salvageSurvivors
      : state.items
          .filter((i) => state.nodeCategories[i.key] === "finalize")
          .map((i) => i.key),
  );

  const skippedKeys: string[] = [];
  const newItems = state.items.map((i) => {
    if (forcePendingKeys.has(i.key)) {
      return { ...i, status: "pending" as const, error: null };
    }
    if (i.status === "dormant") return i;
    if ((skipKeys.has(i.key) || i.key === failedItemKey) && i.status !== "done") {
      skippedKeys.push(i.key);
      return { ...i, status: "na" as const };
    }
    return i;
  });

  const newEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    itemKey: "salvage-draft",
    message: `Graceful degradation: ${failedItemKey} triggered salvage, skipped ${skippedKeys.join(", ")} for Draft PR.`,
  };

  return {
    state: { ...state, items: newItems, errorLog: [...state.errorLog, newEntry] },
    skippedKeys,
  };
}
