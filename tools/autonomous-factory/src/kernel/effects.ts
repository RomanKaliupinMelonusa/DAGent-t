/**
 * kernel/effects.ts — Side-effect descriptors for the pipeline kernel.
 *
 * The kernel is pure: it processes commands and returns effects.
 * The effect executor (impure) translates effects into I/O operations.
 *
 * Pure types only — zero executable code.
 */

import type {
  PipelineState,
  ExecutionRecord,
  AppendInvocationInput,
  SealInvocationInput,
} from "../types.js";

// ---------------------------------------------------------------------------
// Effect union
// ---------------------------------------------------------------------------

export type Effect =
  | PersistStateEffect
  | PersistExecutionRecordEffect
  | ReindexEffect
  | TelemetryEventEffect
  | WriteHaltArtifactEffect
  | AppendInvocationRecordEffect
  | SealInvocationEffect
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

/**
 * Append a fresh `InvocationRecord` to `state.artifacts` at dispatch time.
 * Part of the Artifact Bus (Phase 1 remainder). Idempotent only w.r.t.
 * duplicate invocationIds — the adapter rejects repeats with a clear error.
 * The handler loop emits this once per dispatch, before the handler runs.
 */
export interface AppendInvocationRecordEffect {
  readonly type: "append-invocation-record";
  readonly slug: string;
  readonly input: AppendInvocationInput;
}

/**
 * Seal an existing invocation: set outcome, finishedAt, merge outputs, and
 * lock the invocation directory against further `ArtifactBus.write` calls.
 * Part of the Artifact Bus (Phase 1 remainder). Idempotent — sealing a
 * sealed record is a no-op. The handler loop emits this when a handler
 * terminates (completed, failed, or error).
 */
export interface SealInvocationEffect {
  readonly type: "seal-invocation";
  readonly slug: string;
  readonly input: SealInvocationInput;
}
