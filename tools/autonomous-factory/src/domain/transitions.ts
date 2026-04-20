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
  /** Sticky salvage marker — see PipelineItem.salvaged in src/types.ts. */
  salvaged?: boolean;
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
  /** True when halt was triggered by `haltOnIdenticalThreshold` (feature-scoped)
   *  rather than by `maxFailures` or the per-item `haltOnIdentical`. */
  haltedByThreshold?: boolean;
  /** When `haltedByThreshold`, the number of errorLog entries sharing the
   *  failing signature (inclusive of the new failure). */
  thresholdMatchCount?: number;
  /** The computed error signature of the new failure entry. */
  errorSignature?: string | null;
}

export interface FailItemOptions {
  /** Maximum total failures for this item before halting (default 10). */
  readonly maxFailures?: number;
  /**
   * When true, halt the pipeline on attempt 2 if the most recent prior
   * errorLog entry for this item has an identical errorSignature.
   * Honours `circuit_breaker.halt_on_identical` from workflows.yml.
   */
  readonly haltOnIdentical?: boolean;
  /**
   * Feature-scoped halt: if N or more `errorLog` entries (across ALL item
   * keys in the run) share the same `errorSignature` as the incoming
   * failure, halt immediately. Honours workflow-level
   * `halt_on_identical.threshold` from workflows.yml. When unset, no
   * threshold check is performed. Counts entries inclusive of the new
   * failure.
   */
  readonly haltOnIdenticalThreshold?: number;
  /**
   * Item keys exempted from the `haltOnIdenticalThreshold` check.
   * Typically deploy/poll/environment nodes whose transient failures are
   * expected to repeat without being a symptom of the dev agent being stuck.
   */
  readonly haltOnIdenticalExcludedKeys?: readonly string[];
  /**
   * Pre-computed signature supplied by the caller. When set, `failItem`
   * uses this verbatim and skips `signatureFn(message)`. Handlers that
   * can produce a structurally-stable fingerprint (e.g. from a parsed
   * Playwright `StructuredFailure`) use this to prevent rotating tokens
   * in the raw message from defeating `halt_on_identical`.
   */
  readonly overrideSignature?: string;
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
  maxFailuresOrOptions: number | FailItemOptions = 10,
  signatureFn: (msg: string) => string = computeErrorSignature,
): FailResult {
  const opts: FailItemOptions = typeof maxFailuresOrOptions === "number"
    ? { maxFailures: maxFailuresOrOptions }
    : maxFailuresOrOptions;
  const maxFailures = opts.maxFailures ?? 10;
  const haltOnIdentical = opts.haltOnIdentical ?? false;
  const haltThreshold = opts.haltOnIdenticalThreshold;
  const haltExcludedKeys = opts.haltOnIdenticalExcludedKeys ?? [];

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

  const newSignature = message ? signatureFn(message) : null;
  // When the caller supplies a structurally-stable signature (e.g. derived
  // from a parsed `StructuredFailure`), use it verbatim. This bypasses the
  // volatile-pattern regex path for handlers that can produce a better hash.
  const effectiveSignature = opts.overrideSignature ?? newSignature;
  const newEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    itemKey,
    message: message || "Unknown failure",
    errorSignature: effectiveSignature,
  };

  // Halt-on-identical (legacy, per-item): if the most recent prior entry for
  // this item has a matching signature, short-circuit the budget and halt.
  let identicalHalt = false;
  if (haltOnIdentical && effectiveSignature) {
    const priorForItem = [...state.errorLog].reverse().find((e) => e.itemKey === itemKey);
    if (priorForItem && priorForItem.errorSignature === effectiveSignature) {
      identicalHalt = true;
    }
  }

  const newErrorLog = [...state.errorLog, newEntry];
  const failCount = newErrorLog.filter((e) => e.itemKey === itemKey).length;

  // Halt-on-identical-threshold (feature-scoped): count how many entries in
  // the full errorLog (across all item keys) share this signature. When the
  // count reaches the threshold and the failing key is not excluded, halt.
  // This catches the "same error rotating through different nodes" loop that
  // per-item checks miss.
  let thresholdHalt = false;
  let thresholdMatchCount = 0;
  if (
    haltThreshold !== undefined &&
    haltThreshold > 0 &&
    effectiveSignature &&
    !haltExcludedKeys.includes(itemKey)
  ) {
    thresholdMatchCount = newErrorLog.filter((e) => e.errorSignature === effectiveSignature).length;
    if (thresholdMatchCount >= haltThreshold) {
      thresholdHalt = true;
    }
  }

  return {
    state: { ...state, items: newItems, errorLog: newErrorLog },
    failCount,
    halted: identicalHalt || thresholdHalt || failCount >= maxFailures,
    ...(thresholdHalt
      ? { haltedByThreshold: true as const, thresholdMatchCount }
      : {}),
    errorSignature: effectiveSignature,
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
  /** Set when the reset was refused because the seed item is salvaged (sticky).
   *  The reducer does not mutate state in this case; callers should treat it
   *  as a no-op and escalate (typically to `blocked`). */
  rejectedReason?: "salvaged";
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
  signatureFn: (msg: string) => string = computeErrorSignature,
): ResetResult {
  const cycleCount = state.errorLog.filter((e) => e.itemKey === logKey).length;
  if (cycleCount >= maxCycles) {
    return { state, cycleCount, halted: true, resetKeys: [] };
  }

  // Sticky salvage: once an item has been gracefully degraded, refuse to
  // resurrect it via later triage reroutes. The caller (triage handler) is
  // expected to treat this as "route exhausted" and escalate.
  const seedItem = state.items.find((i) => i.key === seedKey);
  if (seedItem?.salvaged) {
    return {
      state,
      cycleCount,
      halted: false,
      resetKeys: [],
      rejectedReason: "salvaged",
    };
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
    errorSignature: reason ? signatureFn(reason) : null,
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
      // Sticky salvage marker — subsequent `resetNodes` calls targeting this
      // key will be rejected by the reducer (see ResetResult.rejectedReason).
      return { ...i, status: "na" as const, salvaged: true };
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

// ---------------------------------------------------------------------------
// Reset scripts (in-category script-node reset for re-push cycles)
// ---------------------------------------------------------------------------

export interface ResetScriptsResult {
  state: TransitionState;
  cycleCount: number;
  halted: boolean;
  resetKeys: string[];
}

/**
 * Reset all `script`-type nodes in the given category back to pending.
 * Used by the deploy-manager to retry a deploy step (and any cascading
 * barriers) without disturbing dev/test items upstream.
 *
 * Cycle counting is sourced from `state.errorLog` for parity with
 * `resetNodes`; the adapter is responsible for keeping `cycleCounters`
 * in sync if it persists that field.
 */
export function resetScripts(
  state: TransitionState,
  category: string,
  maxCycles: number = 10,
): ResetScriptsResult {
  const logKey = `reset-scripts:${category}`;
  const cycleCount = state.errorLog.filter((e) => e.itemKey === logKey).length;
  if (cycleCount >= maxCycles) {
    return { state, cycleCount, halted: true, resetKeys: [] };
  }

  const resetKeys = new Set(
    state.items
      .filter(
        (i) =>
          state.nodeTypes[i.key] === "script" &&
          state.nodeCategories[i.key] === category,
      )
      .map((i) => i.key),
  );
  cascadeBarriers(state.dependencies, state.nodeTypes, resetKeys);

  const newItems = state.items.map((i) => {
    if (!resetKeys.has(i.key) || i.status === "na") return i;
    return { ...i, status: "pending" as const, error: null };
  });

  const newEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    itemKey: logKey,
    message: `Script re-push cycle for category "${category}" (cycle ${cycleCount + 1}/${maxCycles}). Reset items: ${[...resetKeys].join(", ")}`,
  };

  return {
    state: { ...state, items: newItems, errorLog: [...state.errorLog, newEntry] },
    cycleCount: cycleCount + 1,
    halted: false,
    resetKeys: [...resetKeys],
  };
}

// ---------------------------------------------------------------------------
// Resume after elevated infra apply
// ---------------------------------------------------------------------------

export interface ResumeElevatedResult {
  state: TransitionState;
  cycleCount: number;
  halted: boolean;
  resetCount: number;
}

/**
 * Resume the pipeline after a successful elevated infrastructure apply.
 * Undoes salvage-driven N/A markings (except `naByType` items) and resets
 * deploy-script nodes to pending so standard CI re-verifies the full stack.
 *
 * Sets `elevatedApply: true` on the returned state so downstream agents
 * know to expect an out-of-band TF apply.
 */
export function resumeAfterElevated(
  state: TransitionState,
  maxCycles: number = 5,
): ResumeElevatedResult {
  const logKey = "resume-elevated";
  const cycleCount = state.errorLog.filter((e) => e.itemKey === logKey).length;
  if (cycleCount >= maxCycles) {
    return { state, cycleCount, halted: true, resetCount: 0 };
  }

  const naByType = new Set(state.naByType);
  const forceResetKeys = new Set(
    state.items
      .filter(
        (i) =>
          state.nodeTypes[i.key] === "script" &&
          state.nodeCategories[i.key] === "deploy",
      )
      .map((i) => i.key),
  );

  let resetCount = 0;
  const newItems = state.items.map((i) => {
    if (forceResetKeys.has(i.key) && i.status !== "na") {
      resetCount++;
      return { ...i, status: "pending" as const, error: null };
    }
    if (i.status === "na" && !naByType.has(i.key)) {
      resetCount++;
      return { ...i, status: "pending" as const, error: null };
    }
    return i;
  });

  const newEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    itemKey: logKey,
    message: `Elevated apply resume cycle ${cycleCount + 1}/${maxCycles}. Reset ${resetCount} items to pending for standard CI re-verification.`,
  };

  return {
    state: {
      ...state,
      items: newItems,
      errorLog: [...state.errorLog, newEntry],
      elevatedApply: true,
    } as TransitionState,
    cycleCount: cycleCount + 1,
    halted: false,
    resetCount,
  };
}

// ---------------------------------------------------------------------------
// Helpers used by `recoverElevated` (composed in the adapter)
// ---------------------------------------------------------------------------

/**
 * Locate the infra CI poll node (script + deploy + key contains "infra").
 * Returns the last match (innermost in topo order), or `null` if none.
 */
export function findInfraPollKey(state: TransitionState): string | null {
  const matches = state.items.filter(
    (i) =>
      state.nodeCategories[i.key] === "deploy" &&
      state.nodeTypes[i.key] === "script" &&
      i.key.includes("infra"),
  );
  return matches.length > 0 ? matches[matches.length - 1]!.key : null;
}

/**
 * Locate the infra dev entry node (category "dev" with no upstream deps).
 * Returns `null` if none — caller must handle that as a hard error.
 */
export function findInfraDevKey(state: TransitionState): string | null {
  const match = state.items.find(
    (i) =>
      state.nodeCategories[i.key] === "dev" &&
      (state.dependencies[i.key]?.length ?? 0) === 0,
  );
  return match?.key ?? null;
}
