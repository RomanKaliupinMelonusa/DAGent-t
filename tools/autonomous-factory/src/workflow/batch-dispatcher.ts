/**
 * src/workflow/batch-dispatcher.ts — Per-batch dispatch fan-out.
 *
 * Owns: build per-item dispatch promises (activity vs. `awaitApproval`),
 * `Promise.all` them, then fold each outcome back into `DagState`
 * serially (so reducer transitions stay deterministic — parallelism is
 * in activity execution only). Returns a `BatchOutcome` the workflow
 * body forwards to the triage cascade and halt-discipline checks.
 *
 * Workflow scope: only Temporal SDK + workflow-local helpers imported.
 */

import { workflowInfo } from "@temporalio/workflow";
import { getNowMs } from "./clock.js";
import { formatIsoFromMs } from "./iso-time.js";
import type { DagState } from "./dag-state.js";
import { dispatchNodeActivity, resolveHandlerKind } from "./dispatch-node.js";
import { makeInvocationId } from "./invocation-id.js";
import { buildActivityInput } from "./activity-input.js";
import type { NodeActivityResult } from "../activities/types.js";
import type { PipelineInput } from "./pipeline-types.js";

/**
 * Per-promise outcome flowing through `Promise.all`. Discriminated on
 * `kind`: `activity` carries the full `NodeActivityResult` plus the
 * dispatch metadata needed for `recordInvocation`; `approval` only
 * carries the gate's accept/reject decision.
 */
type DispatchOutcome = {
  kind: "activity";
  itemKey: string;
  executionId: string;
  attempt: number;
  result: NodeActivityResult;
};

/** Items the dispatcher needs from a `DagState.getReady()` `items` payload. */
export interface ReadyItem {
  readonly key: string;
}

/** Outputs the workflow body folds into the next loop step. */
export interface BatchOutcome {
  /**
   * Items that transitioned to `failed` this batch. The triage cascade
   * filters on this list so it only fires for failures surfaced in the
   * current iteration.
   */
  readonly newlyFailed: ReadonlyArray<{
    itemKey: string;
    result: NodeActivityResult;
  }>;
  /**
   * The deterministic ISO timestamp used for every reducer call this
   * batch (`applyComplete` / `applyFail` / `recordInvocation`). Returned
   * so the workflow body can pass the same value to `runTriageCascade`,
   * keeping the cascade's `errorLog` entries time-aligned with the
   * batch they triage.
   */
  readonly nowIso: string;
}

export interface DispatchBatchInputs {
  readonly dag: DagState;
  readonly readyItems: ReadonlyArray<ReadyItem>;
  readonly input: PipelineInput;
  readonly startedIso: string;
  readonly attemptCounts: Map<string, number>;
}

/**
 * Dispatch all ready items in parallel, then fold the outcomes into
 * `DagState` serially. The workflow body is responsible for everything
 * around this call — hold gate, batch counter, terminal-kind detection,
 * triage cascade, halt-discipline checks.
 */
export async function dispatchBatch(
  inputs: DispatchBatchInputs,
): Promise<BatchOutcome> {
  const { dag, readyItems, input, startedIso, attemptCounts } = inputs;

  const dispatchPromises: Array<Promise<DispatchOutcome>> = [];
  for (const item of readyItems) {
    const node = input.nodes[item.key];
    const handlerKind = resolveHandlerKind(node);

    const attempt = (attemptCounts.get(item.key) ?? 0) + 1;
    attemptCounts.set(item.key, attempt);
    const executionId = makeInvocationId(
      workflowInfo().workflowId,
      item.key,
      attempt,
    );
    const activityInput = buildActivityInput(
      item.key,
      attempt,
      dag,
      input,
      startedIso,
      executionId,
    );
    dispatchPromises.push(
      dispatchNodeActivity(handlerKind, activityInput).then(
        (result) =>
          ({
            kind: "activity",
            itemKey: item.key,
            executionId,
            attempt,
            result,
          }) as const,
      ),
    );
  }

  const outcomes = await Promise.all(dispatchPromises);

  // Apply results serially for deterministic reducer ordering.
  const nowIso = formatIsoFromMs(getNowMs());
  const newlyFailed: Array<{
    itemKey: string;
    result: NodeActivityResult;
  }> = [];

  for (const out of outcomes) {
    const r = out.result;
    if (r.outcome === "completed") {
      dag.applyComplete(out.itemKey);
    } else {
      dag.applyFail(
        out.itemKey,
        r.errorMessage ?? "unspecified failure",
        nowIso,
      );
      newlyFailed.push({ itemKey: out.itemKey, result: r });
    }
    // Cause-A fix — record the invocation in the ledger so consumer
    // nodes can resolve `consumes_artifacts` references via
    // `pipelineState.artifacts`. Triage and materializeUpstream both
    // filter on `outcome === "completed"`; we record failures too so
    // the ledger is a faithful audit trail.
    dag.recordInvocation({
      invocationId: out.executionId,
      nodeKey: out.itemKey,
      attempt: out.attempt,
      trigger: "initial",
      outcome: r.outcome,
      outputs: r.producedArtifacts ?? [],
      finishedAt: nowIso,
    });
  }

  return { newlyFailed, nowIso };
}
