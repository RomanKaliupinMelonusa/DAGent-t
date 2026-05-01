/**
 * src/workflow/triage-driver.ts — Workflow-scope triage cascade orchestration.
 *
 * Owns:
 *   - `applyTriageCommand(cmd, dag, nowIso) → haltReason | null` —
 *     fold a single `DagCommand` returned by the triage activity into
 *     `DagState`. Returns a non-empty halt reason when the command
 *     halted the run (cycle-budget exhausted on `reset-nodes`).
 *   - `runTriageCascade(newlyFailed, …) → haltReason | null` — for
 *     every newly-failed item with a configured triage target,
 *     dispatch the triage activity in parallel; apply returned
 *     commands serially.
 *
 * `resolveTriageDispatch` (the pure decision function) stays in
 * `triage-cascade.ts`. This module is the side-effecting orchestrator
 * sitting on top of it.
 *
 * Workflow scope: only Temporal SDK + workflow-local helpers imported.
 */

import { workflowInfo } from "@temporalio/workflow";
import type { DagState } from "./dag-state.js";
import { triageActivity } from "./activity-proxies.js";
import { resolveTriageDispatch, type TriageDispatch } from "./triage-cascade.js";
import { makeInvocationId } from "./invocation-id.js";
import { buildTriageActivityInput } from "./activity-input.js";
import type { NodeActivityResult } from "../activities/types.js";
import type { PipelineInput } from "./pipeline-types.js";
import type { RoutableWorkflow } from "./domain/index.js";
import type { DagCommand } from "../dag-commands.js";

/**
 * Apply a single `DagCommand` to the workflow's `DagState`. Returns a
 * non-empty halt reason when the command halted the run (cycle budget
 * exhausted on `reset-nodes`); otherwise null.
 *
 * Workflow-scope subset:
 *   - `reset-nodes`     → `dag.applyResetNodes` (full halt semantics)
 *   - `salvage-draft`   → `dag.applySalvage`
 *   - `bypass-node`     → `dag.applyBypass`
 *   - `stage-invocation` → no-op (workflow body manages invocation IDs
 *                         via `attemptCounts` + `executionId`).
 *   - `reindex`         → no-op (would require a non-deterministic
 *                         indexer activity; deferred).
 *   - `note-triage-blocked` → no-op (advisory).
 *
 * Exported so unit tests can exercise the cycle-budget halt-reason
 * emission without booting a workflow runtime. The function is pure
 * aside from the in-place `DagState` mutation and is safe to call
 * outside workflow context.
 */
export function applyTriageCommand(
  cmd: DagCommand,
  dag: DagState,
  nowIso: string,
): string | null {
  switch (cmd.type) {
    case "reset-nodes": {
      const result = dag.applyResetNodes(
        cmd.seedKey,
        cmd.reason,
        nowIso,
        cmd.maxCycles,
        cmd.logKey,
      );
      if (result.halted) {
        return `triage-halt: reset-nodes cycle budget exhausted for '${cmd.seedKey}' (logKey=${cmd.logKey ?? "reset-nodes"})`;
      }
      return null;
    }
    case "salvage-draft": {
      dag.applySalvage(cmd.failedItemKey, nowIso);
      return null;
    }
    case "bypass-node": {
      dag.applyBypass(cmd.nodeKey, cmd.routeTarget, cmd.reason, nowIso);
      return null;
    }
    case "stage-invocation":
    case "reindex":
    case "note-triage-blocked":
      // Advisory in workflow scope — see function docstring.
      return null;
    default: {
      // Exhaustiveness — TypeScript flags any new DagCommand variant.
      const _exhaustive: never = cmd;
      void _exhaustive;
      return null;
    }
  }
}

/**
 * Run the triage cascade for a batch of newly-failed items. Each
 * failure with a configured triage target gets its own triage activity
 * dispatch (parallel — Promise.all), and the returned commands are
 * applied serially to `dag` so reducer transitions stay deterministic.
 *
 * Returns a non-empty halt reason when a command halted the run, else null.
 */
export async function runTriageCascade(
  newlyFailed: ReadonlyArray<{ itemKey: string; result: NodeActivityResult }>,
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
  attemptCounts: Map<string, number>,
  nowIso: string,
  routableWorkflow: RoutableWorkflow,
): Promise<string | null> {
  const dispatches: TriageDispatch[] = [];
  for (const f of newlyFailed) {
    const d = resolveTriageDispatch({
      failingKey: f.itemKey,
      result: f.result,
      workflow: routableWorkflow,
    });
    if (d) dispatches.push(d);
  }
  if (dispatches.length === 0) return null;

  const triagePromises = dispatches.map(async (dispatch) => {
    const attempt = (attemptCounts.get(dispatch.triageNodeKey) ?? 0) + 1;
    attemptCounts.set(dispatch.triageNodeKey, attempt);
    const executionId = makeInvocationId(
      workflowInfo().workflowId,
      dispatch.triageNodeKey,
      attempt,
    );
    const activityInput = buildTriageActivityInput(
      dispatch,
      attempt,
      dag,
      input,
      startedIso,
      executionId,
    );
    const result = await triageActivity(activityInput);
    return { dispatch, result, attempt, executionId };
  });
  const triageResults = await Promise.all(triagePromises);

  // Apply commands serially for deterministic reducer ordering.
  for (const { dispatch, result, attempt, executionId } of triageResults) {
    // Mark the triage node itself complete or failed in the DAG. The
    // commands the triage handler emits (reset/salvage/bypass) operate
    // on the *failing* node and its dependents — the triage node only
    // needs to be sealed in DAG state so future batches can re-run it
    // for new failures.
    if (result.outcome === "completed") {
      // Triage nodes are only schedulable via cascade activation, so
      // calling applyComplete on a not-pending item would be a reducer
      // error. Guard via the snapshot; the legacy contract is that
      // triage nodes stay in `pending` and re-fire each time a fresh
      // failure hits them.
    } else {
      // A triage activity that itself fails leaves a paper trail in the
      // errorLog; the legacy kernel surfaces this via the standard
      // failed-item path. We do the same here.
      dag.applyFail(
        dispatch.triageNodeKey,
        result.errorMessage ?? "triage failed",
        nowIso,
      );
    }

    // Cause-A fix — register the triage invocation in the ledger so
    // downstream `consumes_reroute` (`kind: triage-handoff`) edges can
    // resolve via `pipelineState.artifacts` instead of falling through
    // to `MissingRequiredInputError`.
    dag.recordInvocation({
      invocationId: executionId,
      nodeKey: dispatch.triageNodeKey,
      attempt,
      trigger: "initial",
      outcome: result.outcome,
      outputs: result.producedArtifacts ?? [],
      finishedAt: nowIso,
    });

    const commands = (result.commands ?? []) as ReadonlyArray<DagCommand>;
    for (const cmd of commands) {
      const halt = applyTriageCommand(cmd, dag, nowIso);
      if (halt) return halt;
    }
  }
  return null;
}
