/**
 * kernel/effects.ts — Side-effect descriptors for the pipeline kernel.
 *
 * The kernel is pure: it processes commands and returns effects.
 * The effect executor (impure) translates effects into I/O operations.
 *
 * Pure types only — zero executable code.
 */

import type { PipelineState, ExecutionRecord, TriageRecord } from "../types.js";

// ---------------------------------------------------------------------------
// Effect union
// ---------------------------------------------------------------------------

export type Effect =
  | PersistStateEffect
  | PersistExecutionRecordEffect
  | PersistPendingContextEffect
  | PersistTriageRecordEffect
  | ReindexEffect
  | TelemetryEventEffect
  ;

/** Persist the full pipeline state to the state store. */
export interface PersistStateEffect {
  readonly type: "persist-state";
  readonly slug: string;
  readonly state: Readonly<PipelineState>;
}

/** Persist an execution record to the state store. */
export interface PersistExecutionRecordEffect {
  readonly type: "persist-execution-record";
  readonly slug: string;
  readonly record: ExecutionRecord;
}

/** Emit a telemetry event. */
export interface TelemetryEventEffect {
  readonly type: "telemetry-event";
  readonly category: string;
  readonly itemKey: string | null;
  readonly context?: Record<string, unknown>;
}

/** Persist pending context (retry/revert context) for a pipeline item. */
export interface PersistPendingContextEffect {
  readonly type: "persist-pending-context";
  readonly slug: string;
  readonly itemKey: string;
  /** Prompt context string to inject into the item's next attempt. */
  readonly context: string;
}

/** Persist a triage record for a pipeline item. */
export interface PersistTriageRecordEffect {
  readonly type: "persist-triage-record";
  readonly slug: string;
  /** Full triage classification record. */
  readonly record: TriageRecord;
}

/** Request a roam-code re-index of the codebase. */
export interface ReindexEffect {
  readonly type: "reindex";
  /** Only reindex if the target node's category is in this list. */
  readonly categories?: string[];
}
