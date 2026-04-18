/**
 * kernel/types.ts — Core kernel types for the Command-Sourced Pipeline Kernel.
 *
 * Replaces the mutable PipelineRunState from app-types.ts with an
 * immutable snapshot model. The kernel owns the only mutable copy;
 * consumers receive frozen snapshots.
 *
 * Pure types only — zero executable code.
 */

import type { PreviousSummaryTotals } from "../app-types.js";
import type { ItemSummary } from "../types.js";
import type { HandlerOutputBag } from "../app-types.js";

// ---------------------------------------------------------------------------
// RunState — replaces mutable PipelineRunState
// ---------------------------------------------------------------------------

/**
 * All mutable state that persists across pipeline iterations.
 * The kernel owns the single mutable instance. External consumers
 * only receive `Readonly<RunState>` snapshots.
 */
export interface RunState {
  /** Collected summaries across the whole pipeline run. */
  pipelineSummaries: ItemSummary[];
  /** Track attempt number per item key across retries. */
  attemptCounts: Record<string, number>;
  /** Track git commit SHA before each dev step for reliable change detection. */
  preStepRefs: Record<string, string>;
  /** Telemetry from a prior session for monotonic metric accumulation. */
  baseTelemetry: PreviousSummaryTotals | null;
  /** Accumulated handler output from all preceding items (keyed by item key). */
  handlerOutputs: Record<string, HandlerOutputBag>;
  /** Per-item flag: whether force_run_if_changed dirs had changes. */
  forceRunChangesDetected: Record<string, boolean>;
}

// ---------------------------------------------------------------------------
// CommandResult — what the kernel returns after processing a command
// ---------------------------------------------------------------------------

/**
 * Result of processing a single Command. Contains the updated run state
 * snapshot and any side effects to execute.
 */
export interface CommandResult {
  /** Whether the command was applied successfully. */
  ok: boolean;
  /** If processing should halt the pipeline. */
  halt?: boolean;
  /** Human-readable message (for logging/diagnostics). */
  message?: string;
}

// ---------------------------------------------------------------------------
// Factory for fresh RunState
// ---------------------------------------------------------------------------

export function createRunState(baseTelemetry: PreviousSummaryTotals | null = null): RunState {
  return {
    pipelineSummaries: [],
    attemptCounts: {},
    preStepRefs: {},
    baseTelemetry,
    handlerOutputs: {},
    forceRunChangesDetected: {},
  };
}
