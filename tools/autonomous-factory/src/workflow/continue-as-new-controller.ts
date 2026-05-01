/**
 * src/workflow/continue-as-new-controller.ts — History-cap rollover.
 *
 * Owns the continueAsNew gate previously inlined at the top of the
 * pipelineWorkflow loop:
 *   - Read `workflowInfo().historyLength` once.
 *   - Compare against the threshold (default 8000; override via
 *     `input.continueAsNewHistoryThreshold` for tests).
 *   - Skip rollover when an approval is pending — handlers can't be
 *     re-bound mid-flight without losing buffered signals; we wait for
 *     the gate to resolve in this incarnation.
 *   - Snapshot DagState + per-item attempt counts; invoke
 *     `continueAsNew` against the same workflow type.
 *
 * `continueAsNew` never returns (throws `ContinueAsNew` internally), so
 * `maybeContinueAsNew` returns `Promise<void>` only when the gate did
 * NOT fire.
 *
 * Workflow scope: only Temporal SDK + workflow-local helpers imported.
 */

import { continueAsNew, workflowInfo } from "@temporalio/workflow";
import type { DagState } from "./dag-state.js";
import type { PipelineInput } from "./pipeline-types.js";

/** Default Temporal soft cap is ~10K events; we trigger well below at
 *  8K to give a margin for in-flight activities to finish without
 *  crossing the hard cap. */
export const DEFAULT_HISTORY_THRESHOLD = 8000;

export interface MaybeContinueAsNewInputs {
  readonly dag: DagState;
  readonly attemptCounts: ReadonlyMap<string, number>;
  readonly input: PipelineInput;
}

/**
 * Trigger continueAsNew when the cap is reached and no approval is
 * pending. Returns normally when the gate did NOT fire — when it did,
 * `continueAsNew` throws `ContinueAsNew` and execution does not resume.
 *
 * Continues-as-new the SAME workflow type (no workflow argument). The
 * generic only carries input typing.
 */
export async function maybeContinueAsNew(
  inputs: MaybeContinueAsNewInputs,
): Promise<void> {
  const { dag, attemptCounts, input } = inputs;
  const threshold = input.continueAsNewHistoryThreshold ?? DEFAULT_HISTORY_THRESHOLD;

  if (workflowInfo().historyLength < threshold) return;
  if (dag.hasPendingApproval()) return;

  const continueInput: PipelineInput = {
    ...input,
    priorSnapshot: dag.snapshot(),
    priorAttemptCounts: Object.fromEntries(attemptCounts),
  };
  // continueAsNew never returns; throws ContinueAsNew internally.
  await continueAsNew<(input: PipelineInput) => Promise<unknown>>(continueInput);
}
