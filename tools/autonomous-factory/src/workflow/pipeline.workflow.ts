/**
 * src/workflow/pipeline.workflow.ts — Pipeline workflow body.
 *
 * Top-level loop. Concerns are split into sibling modules:
 * `signal-wiring`, `batch-dispatcher`, `continue-as-new-controller`,
 * `triage-driver`, plus shared helpers in `activity-input`,
 * `invocation-id`, `pipeline-types`. Determinism scope (enforced by
 * ESLint): Temporal SDK + workflow-scoped helpers only.
 */

import {
  condition,
  patched,
  CancelledFailure,
  isCancellation,
} from "@temporalio/workflow";
import { DagState } from "./dag-state.js";
import { installApprovalRegistry } from "./approval-pattern.js";
import { formatIsoFromMs } from "./iso-time.js";
import { archiveActivity } from "./activity-proxies.js";
import { installHandlers, projectState } from "./signal-wiring.js";
import { dispatchBatch } from "./batch-dispatcher.js";
import { maybeContinueAsNew } from "./continue-as-new-controller.js";
import { runTriageCascade } from "./triage-driver.js";
import type { RoutableWorkflow } from "./domain/index.js";
import type {
  PipelineInput,
  PipelineFinalStatus,
  PipelineResult,
} from "./pipeline-types.js";

// Re-exports preserve the pre-decomposition public API surface.
export type {
  PipelineNodeSpec,
  PipelineInput,
  PipelineFinalStatus,
  PipelineResult,
} from "./pipeline-types.js";
export { applyTriageCommand } from "./triage-driver.js";

/**
 * Detect whether any item's attempt counter has exceeded the absolute
 * per-node retry ceiling. Pure. `attempts > ceiling` (strictly greater)
 * so ceiling=5 permits 1..5 and trips on attempt 6. See
 * /memories/repo/dagent-runaway-retry-postmortem.md.
 */
export function detectAbsoluteCeilingBreach(
  attemptCounts: ReadonlyMap<string, number>,
  ceiling: number,
): { itemKey: string; attempts: number } | null {
  for (const [itemKey, attempts] of attemptCounts) {
    if (attempts > ceiling) {
      return { itemKey, attempts };
    }
  }
  return null;
}

export async function pipelineWorkflow(
  input: PipelineInput,
): Promise<PipelineResult> {
  const startedIso = formatIsoFromMs(input.startedMs);

  // Rehydrate from a prior snapshot when continued-as-new (Session 5 P2);
  // otherwise build fresh from compiled nodes.
  const dag = input.priorSnapshot
    ? DagState.fromSnapshot(input.priorSnapshot)
    : DagState.fromInit({
        feature: input.slug,
        workflowName: input.workflowName,
        started: startedIso,
        nodes: input.nodes as unknown as Parameters<
          typeof DagState.fromInit
        >[0]["nodes"],
      });

  const routableWorkflow: RoutableWorkflow = {
    nodes: input.nodes,
    ...(input.default_triage ? { default_triage: input.default_triage } : {}),
    ...(input.default_routes
      ? { default_routes: { ...input.default_routes } }
      : {}),
  };

  // Install signal + query + update handlers FIRST (before any await).
  // Both calls must be synchronous — Temporal only buffers signals
  // delivered prior to handler registration when registration happens
  // in the workflow's first task.
  const approvalRegistry = installApprovalRegistry();
  installHandlers(dag, input, startedIso);

  // Per-item attempt counter — survives continue-as-new via
  // `priorAttemptCounts` so attempt numbers stay monotonic.
  const attemptCounts = new Map<string, number>(
    input.priorAttemptCounts ? Object.entries(input.priorAttemptCounts) : [],
  );

  // Safety valve (same magnitude as legacy `policy.max_iterations`) and
  // absolute per-node retry ceiling (independent of per-node circuit
  // breakers — P1 hardening, postmortem in repo memory).
  const maxIterations = 500;
  const absoluteAttemptCeiling = input.absoluteAttemptCeiling ?? 5;

  let finalStatus: PipelineFinalStatus = "halted";
  let finalReason = "unspecified";

  try {
    for (let i = 0; i < maxIterations; i++) {
      // (a0) continue-as-new gate (skipped while an approval is pending
      //      so handlers can stay bound).
      await maybeContinueAsNew({ dag, attemptCounts, input });

      // (a) Hold gate — cancellation alongside so a cancel during hold
      //     unblocks the loop. (b) Cancellation halt.
      await condition(() => !dag.isHeld() || dag.isCancelled());
      if (dag.isCancelled()) {
        finalStatus = "cancelled";
        finalReason = dag.getCancelReason() ?? "cancelled";
        break;
      }

      // (c) Bump batch counter; (d) schedule next batch.
      dag.bumpBatch();
      const ready = dag.getReady();
      if (ready.kind === "complete") {
        finalStatus = "complete";
        finalReason = "all-items-terminal";
        // Salvage post-condition: a run that demoted nodes via
        // `salvageForDraft` AND produced zero `done` dev-category nodes
        // ran around a wedge instead of through dev work — reclassify
        // as `failed`. Wrapped with `patched()` so histories that
        // already terminated as `complete` keep doing so on replay.
        if (patched("salvage-postcondition")) {
          const snap = dag.snapshot();
          const salvagedKeys = snap.state.items
            .filter((i) => i.salvaged === true)
            .map((i) => i.key);
          if (salvagedKeys.length > 0) {
            const cats = snap.state.nodeCategories;
            const devDone = snap.state.items.filter(
              (i) => cats[i.key] === "dev" && i.status === "done",
            );
            if (devDone.length === 0) {
              finalStatus = "failed";
              finalReason =
                `salvage-without-dev: ${salvagedKeys.length} node(s) demoted via salvage ` +
                `and zero dev-category nodes completed (salvaged=${salvagedKeys.join(",")})`;
            }
          }
        }
        break;
      }
      if (ready.kind === "blocked") {
        finalStatus = "blocked";
        finalReason = "no-ready-items";
        break;
      }

      // (e/f) Dispatch ready items in parallel and fold results back.
      const { newlyFailed, approvalRejection, nowIso } = await dispatchBatch({
        dag, readyItems: ready.items, input, startedIso, approvalRegistry, attemptCounts,
      });

      // (g) Triage cascade for newly-failed items. Halts when a
      //     reset/salvage exhausts its cycle budget.
      if (newlyFailed.length > 0) {
        const cascadeHalt = await runTriageCascade(
          newlyFailed,
          dag,
          input,
          startedIso,
          attemptCounts,
          nowIso,
          routableWorkflow,
        );
        if (cascadeHalt) {
          finalStatus = "halted";
          finalReason = cascadeHalt;
          break;
        }
      }

      // (g2) Absolute retry ceiling — runs AFTER cascade so an in-flight
      //      triage reroute still applies for this batch.
      if (patched("absolute-retry-ceiling")) {
        const breach = detectAbsoluteCeilingBreach(
          attemptCounts,
          absoluteAttemptCeiling,
        );
        if (breach) {
          finalStatus = "halted";
          finalReason =
            `absolute-retry-ceiling: node '${breach.itemKey}' ` +
            `reached attempt ${breach.attempts} ` +
            `(ceiling=${absoluteAttemptCeiling}).`;
          break;
        }
      }

      // Approval rejections halt by default (most stringent).
      if (approvalRejection) {
        finalStatus = "approval-rejected";
        finalReason = `Gate '${approvalRejection.itemKey}' rejected: ${approvalRejection.reason}`;
        break;
      }
    }

    // Loop fall-through (max iterations exhausted).
    if (finalStatus === "halted" && finalReason === "unspecified") {
      finalReason = `max-iterations (${maxIterations}) exhausted`;
    }

    // Final archive on natural completion only. Cancelled / rejected /
    // blocked runs leave the workspace untouched for operator inspection.
    if (finalStatus === "complete") {
      try {
        await archiveActivity({
          slug: input.slug,
          appRoot: input.appRoot,
          repoRoot: input.repoRoot,
          baseBranch: input.baseBranch,
        });
      } catch (err) {
        finalReason = `complete-but-archive-failed: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    }
  } catch (err) {
    if (isCancellation(err)) {
      // Native Temporal cancellation (handle.cancel()) — distinct from
      // the structured cancelPipelineSignal path.
      if (!dag.isCancelled()) dag.markCancelled("temporal-cancellation");
      finalStatus = "cancelled";
      finalReason = dag.getCancelReason() ?? "temporal-cancellation";
      throw err instanceof CancelledFailure
        ? err
        : new CancelledFailure(finalReason);
    }
    throw err;
  }

  return {
    status: finalStatus,
    reason: finalReason,
    batchNumber: dag.getBatchNumber(),
    finalSnapshot: projectState(dag, input, startedIso),
  };
}
