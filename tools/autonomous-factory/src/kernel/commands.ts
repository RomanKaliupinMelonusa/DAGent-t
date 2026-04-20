/**
 * kernel/commands.ts — Command discriminated union for the pipeline kernel.
 *
 * Every state mutation flows through a Command processed by the kernel.
 * Extends the existing DagCommand vocabulary (handler → kernel) with
 * kernel-internal commands (loop → kernel).
 *
 * Pure types only — zero executable code.
 */

import type { ItemSummary, TriageRecord, ExecutionRecord } from "../types.js";
import type { DagCommand } from "../dag-commands.js";
import type { HandlerOutputBag } from "../app-types.js";

// ---------------------------------------------------------------------------
// Command union
// ---------------------------------------------------------------------------

/**
 * Full command vocabulary for the pipeline kernel.
 *
 * Commands from two sources:
 * - **Handler commands** (DagCommand): produced by handlers, translated by dispatch
 * - **Kernel commands**: produced by the loop/dispatch layer
 */
export type Command =
  // State transitions (from dispatch layer)
  | CompleteItemCommand
  | FailItemCommand
  // Run-state mutations (from dispatch/loop)
  | RecordAttemptCommand
  | RecordSummaryCommand
  | RecordHandlerOutputCommand
  | RecordPreStepRefCommand
  | RecordForceRunCommand
  | RecordExecutionCommand
  // Delegated handler commands (from handler DagCommand[])
  | DagCommandWrapper
  ;

// ---------------------------------------------------------------------------
// State transition commands
// ---------------------------------------------------------------------------

export interface CompleteItemCommand {
  readonly type: "complete-item";
  readonly itemKey: string;
}

export interface FailItemCommand {
  readonly type: "fail-item";
  readonly itemKey: string;
  readonly message: string;
  readonly maxFailures?: number;
  /**
   * When true and the previous errorLog entry for this item has the same
   * errorSignature as the incoming failure, halt the pipeline on attempt 2
   * regardless of `maxFailures`. Honours `circuit_breaker.halt_on_identical`
   * from workflows.yml, resolved by the dispatcher via `NodeBudgetPolicy`.
   */
  readonly haltOnIdentical?: boolean;
  /**
   * Feature-scoped halt threshold: when N or more errorLog entries share the
   * same signature, halt immediately. Honours workflow-level
   * `halt_on_identical.threshold`. Resolved by the dispatcher from the
   * compiled APM context; undefined ⇒ check disabled.
   */
  readonly haltOnIdenticalThreshold?: number;
  /** Item keys excluded from the threshold check. */
  readonly haltOnIdenticalExcludedKeys?: readonly string[];
  /**
   * Pre-computed error signature. When set, `failItem` uses this verbatim
   * and skips the default string-hashing path. Supplied by handlers that
   * can derive a structurally-stable fingerprint (e.g. Playwright
   * `StructuredFailure` → `computeStructuredSignature`), so rotating
   * prose tokens in the raw message cannot defeat `halt_on_identical`.
   */
  readonly errorSignature?: string;
}

// ---------------------------------------------------------------------------
// Run-state commands
// ---------------------------------------------------------------------------

export interface RecordAttemptCommand {
  readonly type: "record-attempt";
  readonly itemKey: string;
}

export interface RecordSummaryCommand {
  readonly type: "record-summary";
  readonly summary: ItemSummary;
}

export interface RecordHandlerOutputCommand {
  readonly type: "record-handler-output";
  readonly itemKey: string;
  readonly output: HandlerOutputBag;
}

export interface RecordPreStepRefCommand {
  readonly type: "record-pre-step-ref";
  readonly itemKey: string;
  readonly sha: string;
}

export interface RecordForceRunCommand {
  readonly type: "record-force-run";
  readonly itemKey: string;
  readonly changesDetected: boolean;
}

export interface RecordExecutionCommand {
  readonly type: "record-execution";
  readonly record: ExecutionRecord;
}

// ---------------------------------------------------------------------------
// DagCommand wrapper — bridges handler commands into the kernel
// ---------------------------------------------------------------------------

/**
 * Wraps a handler-emitted DagCommand for kernel processing.
 * The kernel delegates to the appropriate handler (reset-nodes, salvage-draft, etc.)
 */
export interface DagCommandWrapper {
  readonly type: "dag-command";
  readonly inner: DagCommand;
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

/** Wrap a handler's DagCommand[] into kernel Commands. */
export function wrapDagCommands(dagCommands: readonly DagCommand[]): DagCommandWrapper[] {
  return dagCommands.map((inner) => ({ type: "dag-command" as const, inner }));
}
