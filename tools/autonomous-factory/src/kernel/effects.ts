/**
 * kernel/effects.ts — Side-effect descriptors for the pipeline kernel.
 *
 * The kernel is pure: it processes commands and returns effects.
 * The effect executor (impure) translates effects into I/O operations.
 *
 * Pure types only — zero executable code.
 */

import type { PipelineState, ExecutionRecord, TriageRecord, PendingContextPayload } from "../types.js";

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
  | WriteHaltArtifactEffect
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
  /** Prompt context string to inject into the item's next attempt.
   *  May be a plain string (legacy) or a structured `PendingContextPayload`
   *  carrying a narrative plus a typed triage handoff. The adapter is
   *  responsible for rendering the payload to a single markdown string. */
  readonly context: string | PendingContextPayload;
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

/**
 * Write a human-readable halt-escalation artifact to `in-progress/<slug>_HALT.md`.
 * Emitted when the kernel halts a pipeline due to `halt_on_identical.threshold`
 * — i.e. the same error signature has recurred N times within the run. The
 * artifact is a resume-pointer for humans; it does not drive any subsequent
 * kernel behaviour.
 */
export interface WriteHaltArtifactEffect {
  readonly type: "write-halt-artifact";
  readonly slug: string;
  readonly failingItemKey: string;
  readonly errorSignature: string;
  readonly thresholdMatchCount: number;
  readonly threshold: number;
  /** Last N failure messages that share the signature (newest first is fine
   *  — the adapter owns formatting). */
  readonly sampleFailures: ReadonlyArray<{ itemKey: string; timestamp: string; message: string }>;
}
