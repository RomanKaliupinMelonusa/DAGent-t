/**
 * src/workflow/signal-wiring.ts — One-shot installation of all
 * signal/query/update handlers for `pipelineWorkflow`.
 *
 * Centralises the legacy in-line `setHandler(...)` block from
 * `pipeline.workflow.ts` so the workflow body can call
 * `installHandlers(...)` once before its first await. Synchronous by
 * contract — Temporal buffers signals delivered before handler
 * registration only when registration happens in the same task as
 * workflow start. Adding an `await` here would lose pre-start signals.
 *
 * Workflow scope: only Temporal SDK + workflow-local helpers imported.
 */

import { setHandler } from "@temporalio/workflow";
import { getNowMs } from "./clock.js";
import { formatIsoFromMs } from "./iso-time.js";
import type { DagState } from "./dag-state.js";
import {
  holdPipelineSignal,
  resumePipelineSignal,
  cancelPipelineSignal,
} from "./signals.js";
import {
  stateQuery,
  progressQuery,
  nextBatchQuery,
  summaryQuery,
  type StateSnapshot,
  type ProgressSnapshot,
  type NextBatchItem,
  type SummarySnapshot,
} from "./queries.js";
import {
  resetScriptsUpdate,
  resumeAfterElevatedUpdate,
  recoverElevatedUpdate,
} from "./updates.js";
import type { PipelineInput } from "./pipeline-types.js";

// ---------------------------------------------------------------------------
// Query projections — derived from DagState.snapshot() each call.
// ---------------------------------------------------------------------------

export function projectState(
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
): StateSnapshot {
  const snap = dag.snapshot();
  return {
    feature: input.slug,
    workflowName: input.workflowName,
    started: startedIso,
    items: snap.state.items.map((i) => ({
      key: i.key,
      label: i.label,
      agent: i.agent ?? null,
      status: i.status,
    })),
    errorLog: snap.state.errorLog.map((e) => ({
      itemKey: e.itemKey,
      message: e.message,
      timestamp: e.timestamp,
    })),
    held: snap.held,
    cancelled: snap.cancelled,
    cancelReason: snap.cancelReason,
  };
}

export function projectProgress(dag: DagState): ProgressSnapshot {
  const snap = dag.snapshot();
  let done = 0,
    pending = 0,
    inProgress = 0,
    failed = 0,
    na = 0,
    dormant = 0;
  for (const item of snap.state.items) {
    switch (item.status) {
      case "done":
        done++;
        break;
      case "pending":
        pending++;
        break;
      case "failed":
        failed++;
        break;
      case "na":
        na++;
        break;
      case "dormant":
        dormant++;
        break;
      default:
        // "in-progress" or any future status — surfaces in pending bucket
        // for the dashboard so totals always sum to `total`.
        inProgress++;
        break;
    }
  }
  return {
    total: snap.state.items.length,
    done,
    pending,
    inProgress,
    failed,
    na,
    dormant,
    held: snap.held,
    cancelled: snap.cancelled,
  };
}

export function projectNextBatch(dag: DagState): readonly NextBatchItem[] {
  const ready = dag.getReady();
  if (ready.kind !== "items") return [];
  return ready.items.map((i) => ({
    key: i.key,
    label: i.label,
    agent: i.agent ?? null,
  }));
}

export function projectSummary(
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
): SummarySnapshot {
  const snap = dag.snapshot();
  const totals = projectProgress(dag);
  let status: SummarySnapshot["status"] = "running";
  if (snap.cancelled) status = "cancelled";
  else if (snap.held) status = "held";
  else if (totals.failed > 0 && totals.pending === 0 && totals.inProgress === 0)
    status = "halted";
  else if (totals.done + totals.na + totals.dormant === totals.total)
    status = "complete";
  return {
    slug: input.slug,
    workflowName: input.workflowName,
    started: startedIso,
    status,
    batchNumber: snap.batchNumber,
    totals,
    pendingApprovals: snap.approvals.filter((a) => a.decision === null).length,
    lastError:
      snap.state.errorLog.length > 0
        ? snap.state.errorLog[snap.state.errorLog.length - 1]!.message
        : null,
  };
}

// ---------------------------------------------------------------------------
// installHandlers — synchronous one-shot registration.
// ---------------------------------------------------------------------------

/**
 * Install the full set of pipeline-workflow signal, query, and update
 * handlers in one call. MUST be invoked before any `await` in the
 * workflow body — Temporal only buffers signals delivered prior to
 * handler registration when registration happens in the workflow's
 * first task.
 *
 * The function takes `DagState` by reference; signal handlers mutate it
 * directly (`markHeld` / `markResumed` / `markCancelled`). Update
 * handlers stamp `nowIso` from the deterministic workflow clock.
 */
export function installHandlers(
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
): void {
  setHandler(holdPipelineSignal, () => {
    dag.markHeld();
  });
  setHandler(resumePipelineSignal, () => {
    dag.markResumed();
  });
  setHandler(cancelPipelineSignal, (reason: string) => {
    dag.markCancelled(reason);
  });

  setHandler(stateQuery, () => projectState(dag, input, startedIso));
  setHandler(progressQuery, () => projectProgress(dag));
  setHandler(nextBatchQuery, () => projectNextBatch(dag));
  setHandler(summaryQuery, () => projectSummary(dag, input, startedIso));

  // Admin updates — mutate-and-return primitives that replace the legacy
  // `npm run pipeline:reset-scripts/resume/recover-elevated` CLI verbs.
  setHandler(resetScriptsUpdate, (args) => {
    const nowIso = formatIsoFromMs(getNowMs());
    return dag.applyResetScripts(args.category, nowIso, args.maxCycles);
  });
  setHandler(resumeAfterElevatedUpdate, (args) => {
    const nowIso = formatIsoFromMs(getNowMs());
    return dag.applyResumeAfterElevated(nowIso, args.maxCycles);
  });
  setHandler(recoverElevatedUpdate, (args) => {
    const nowIso = formatIsoFromMs(getNowMs());
    return dag.applyRecoverElevated(
      args.errorMessage,
      nowIso,
      args.maxFailCount,
      args.maxDevCycles,
    );
  });
}
