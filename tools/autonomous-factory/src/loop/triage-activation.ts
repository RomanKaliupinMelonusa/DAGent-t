/**
 * loop/triage-activation.ts — Pure resolution of triage activations from a batch.
 *
 * When an item fails, its workflow node may declare `on_failure.triage` (an
 * explicit triage target) and `on_failure.routes` (the domain-to-node map the
 * triage classifier will consult). This module walks the commands produced by
 * a batch and emits a `TriageActivation` for every failed item that has a
 * configured triage target.
 *
 * Triage nodes are otherwise filtered out of normal scheduling
 * (see `pipeline-loop.ts` Step 2) — activations are the only way they
 * get dispatched. Wiring the kernel's `fail-item` command to produce
 * activations here closes the `on_failure.triage` contract end-to-end.
 *
 * Pure function — no I/O, no state mutation.
 */

import type { Command } from "../kernel/commands.js";
import type { PipelineState, ItemSummary } from "../types.js";
import type { RunState } from "../kernel/types.js";
import type { TriageActivation } from "../app-types.js";
import type { RoutableWorkflow } from "../domain/failure-routing.js";
import {
  resolveFailureTarget,
  resolveFailureRoutes,
} from "../domain/failure-routing.js";
import { computeStructuredSignature } from "../triage/playwright-report.js";

/**
 * Derive triage activations from batch commands + post-batch DAG state.
 *
 * For each `fail-item` command whose failing item is now in `failed` status
 * and whose workflow node has a configured triage target, emit one
 * TriageActivation carrying the failure context (error, signature, routes,
 * last summary) that the triage handler needs to classify.
 *
 * Callers may pass only the newly-failed items (de-duplicated). Activations
 * are returned in command order; duplicates for the same failing key are
 * collapsed (last-wins on message).
 */
export function resolveTriageActivations(
  commands: readonly Command[],
  dagState: Readonly<PipelineState>,
  runState: Readonly<RunState>,
  workflow: RoutableWorkflow | undefined,
  computeSignature: (msg: string) => string,
): TriageActivation[] {
  if (!workflow) return [];

  const byFailingKey = new Map<string, TriageActivation>();

  for (const cmd of commands) {
    if (cmd.type !== "fail-item") continue;
    const failingKey = cmd.itemKey;

    // Only activate triage when the scheduler sees the item as terminally
    // failed this cycle — otherwise let the retry path run its course.
    const item = dagState.items.find((i) => i.key === failingKey);
    if (item?.status !== "failed") continue;

    const triageNodeKey = resolveFailureTarget(workflow, failingKey);
    if (!triageNodeKey) continue;

    const failureRoutes = resolveFailureRoutes(workflow, failingKey);
    const rawError = cmd.message || "Unknown failure";
    const failingNodeSummary = findLastSummary(runState.pipelineSummaries, failingKey);

    // When the failing handler emitted a parsed structured-failure shape
    // (e.g. local-exec parsed Playwright JSON), forward it so the triage
    // handler can prefer it over the raw error string.
    const bag = runState.handlerOutputs[failingKey];
    const structuredFailure =
      bag && typeof bag === "object" && "structuredFailure" in bag
        ? (bag as { structuredFailure?: unknown }).structuredFailure
        : undefined;

    // Prefer a structured signature (stable across builds) over hashing the
    // raw error prose. This mirrors the kernel-side override in
    // `result-translator.ts` so the activation's `errorSignature` matches
    // what's recorded in `errorLog`.
    const structuredSig = structuredFailure ? computeStructuredSignature(structuredFailure) : null;
    const errorSignature = structuredSig ?? computeSignature(rawError);

    byFailingKey.set(failingKey, {
      triageNodeKey,
      failingKey,
      rawError,
      errorSignature,
      failureRoutes,
      failingNodeSummary,
      ...(structuredFailure !== undefined ? { structuredFailure } : {}),
    });
  }

  return [...byFailingKey.values()];
}

function findLastSummary(
  summaries: readonly ItemSummary[],
  key: string,
): ItemSummary {
  for (let i = summaries.length - 1; i >= 0; i--) {
    if (summaries[i].key === key) return summaries[i];
  }
  // Return an empty-ish summary so the triage handler still has a shape.
  return { key } as ItemSummary;
}
