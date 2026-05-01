/**
 * activities/triage-body-reroute.ts — reroute-command builder + prior
 * debug-recommendation lookup, extracted from `triage-body.ts` in
 * Phase 4.3c. No behavior change — pure file split.
 *
 * Exports:
 *   - LoadedDebugRecommendation: type
 *   - loadDebugRecommendation(): walk the persisted invocation ledger
 *     for the most recent completed-and-sealed invocation whose agent
 *     emitted a structured `nextFailureHint` via `report_outcome`.
 *   - RerouteBuildResult: type
 *   - buildRerouteCommands(): assemble reset-nodes → stage-invocation →
 *     reindex commands for a successful triage reroute, plus the
 *     structured `TriageHandoff` payload for the outer
 *     `attachTriageHandoffArtifact` wrapper to serialise.
 */

import type { NodeBudgetPolicy } from "../app-types.js";
import type { NodeContext, DagCommand } from "../contracts/node-context.js";
import type { TriageRecord, TriageResult, TriageHandoff } from "../types.js";
import { RESET_OPS } from "../types.js";
import { newInvocationId } from "./support/invocation-id.js";
import { buildTriageHandoff, formatDomainTag } from "../triage/handoff-builder.js";
import { extractPriorAttempts } from "../triage/historian.js";
import { getWorkflowNode } from "../session/dag-utils.js";
import { getUpstream } from "../domain/dag-graph.js";
import type { BaselineProfile } from "../ports/baseline-loader.js";

// ---------------------------------------------------------------------------
// Prior debug-cycle structured-hint lookup
// ---------------------------------------------------------------------------

/**
 * Resolved hint surfaced to the LLM router and the dev-agent handoff.
 * Shape matches `TriageHandoff.priorDebugRecommendation` so the outer
 * caller can pass it through unmodified.
 */
export interface LoadedDebugRecommendation {
  readonly cycleIndex: number;
  readonly recommendation: { domain: string; note: string };
}

/**
 * Walk the persisted invocation ledger for the most recent
 * completed-and-sealed invocation whose agent emitted a structured
 * `nextFailureHint` via `report_outcome`. Producer-agnostic — any
 * debug-class agent that records a hint is eligible.
 *
 * Filters out hints whose `domain` is not in `allowedDomains` so the
 * recommendation cannot bias the LLM toward an unroutable verdict.
 *
 * Picks the lex-greatest `finishedAt` (ISO timestamps are
 * lex-sortable), tiebreak by lex-greatest `invocationId` — same
 * selector as `FileArtifactBus.findLatestArtifact`.
 *
 * Pure (apart from the in-memory `artifacts` walk). Returns `null` when
 * nothing eligible is found.
 */
export function loadDebugRecommendation(
  artifacts:
    | Record<string, {
        nodeKey: string;
        cycleIndex: number;
        outcome?: string;
        sealed?: boolean;
        finishedAt?: string;
        invocationId: string;
        nextFailureHint?: { domain: string; target_node: string; summary: string };
      }>
    | undefined,
  allowedDomains: readonly string[],
): LoadedDebugRecommendation | null {
  if (!artifacts) return null;
  if (allowedDomains.length === 0) return null;

  let best: { rec: NonNullable<typeof artifacts>[string] } | null = null;
  for (const rec of Object.values(artifacts)) {
    if (rec.sealed !== true) continue;
    if (rec.outcome !== "completed") continue;
    if (!rec.finishedAt) continue;
    const hint = rec.nextFailureHint;
    if (!hint) continue;
    if (!allowedDomains.includes(hint.domain)) continue;
    if (
      !best
      || (rec.finishedAt > (best.rec.finishedAt ?? ""))
      || (rec.finishedAt === best.rec.finishedAt && rec.invocationId > best.rec.invocationId)
    ) {
      best = { rec };
    }
  }
  if (!best) return null;

  const hint = best.rec.nextFailureHint!;
  return {
    cycleIndex: best.rec.cycleIndex,
    recommendation: { domain: hint.domain, note: hint.summary },
  };
}

// ---------------------------------------------------------------------------
// Reroute command builder
// ---------------------------------------------------------------------------

/**
 * Result of `buildRerouteCommands` — the kernel commands to push, plus
 * the structured `TriageHandoff` payload built along the way so the
 * caller can stash it on `handlerOutput.triageHandoff` for the outer
 * `attachTriageHandoffArtifact` wrapper to serialise.
 */
export interface RerouteBuildResult {
  readonly commands: DagCommand[];
  readonly handoff?: TriageHandoff;
  /** Pre-allocated invocationId of the staged downstream record. Returned
   *  so the outer execute wrapper can stamp it on `handlerOutput.routedTo`
   *  and use it for the `triage.routed` event. */
  readonly routedToInvocationId?: string;
}

/**
 * Build DagCommands for a successful reroute (reset target + downstream).
 * Assembles: reset-nodes → stage-invocation → reindex. Also builds the
 * structured `TriageHandoff` payload and returns it so the caller can
 * propagate it to `handlerOutput.triageHandoff` — the outer execute
 * wrapper serialises it to the on-disk `triage-handoff` artifact.
 */
export async function buildRerouteCommands(
  ctx: NodeContext,
  routeToKey: string,
  triageRecord: TriageRecord,
  triageResult: TriageResult,
  maxReroutes: number,
  routeToPolicy: NodeBudgetPolicy,
  failingNodeKey: string,
  rawError: string,
  /** Baseline-filtered structured failure — same payload the classifier saw.
   *  Projected into the dev-agent handoff so console/network/uncaught signals
   *  travel alongside the Playwright assertion excerpt. */
  structuredFailure: unknown,
  /** Loaded baseline profile (may be null). Passed through to
   *  `composeTriageContext` so the raw-mode narrative can subtract
   *  pre-feature platform noise from the inlined failure output. */
  baseline: BaselineProfile | null,
  /** Per-channel counts of baseline-filtered signals from the
   *  `filterNoise` invocation that produced `structuredFailure`. Rendered
   *  as a provenance footer in the dev-agent handoff so the agent can
   *  confirm the filter ran. Zero / omitted when no filtering happened. */
  baselineDropCounts?: { console: number; network: number; uncaught: number },
  /** Prior debug-cycle recommendation parsed from the most recent
   *  `storefront-debug` `debug-notes.md`. Threaded into
   *  `buildTriageHandoff` so the rerouted dev agent sees the diagnosis
   *  inline. The same recommendation has already biased the LLM router
   *  upstream of this call. Absent when no eligible debug-notes exist
   *  or no recognised heading was present. */
  priorDebugRecommendation?: LoadedDebugRecommendation | null,
): Promise<RerouteBuildResult> {
  const { slug } = ctx;
  void routeToPolicy; // reserved for future per-target throttle wiring
  const commands: DagCommand[] = [];
  let handoff: TriageHandoff | undefined;
  let routedToInvocationId: string | undefined;

  // 1. Reset target node + all downstream dependents
  //    (the structured handoff is serialised to the `triage-handoff`
  //    artifact by the outer execute wrapper using the `handoff` value
  //    returned from this function — no persistence command needed.)
  const taggedReason = `${formatDomainTag(triageResult.domain)} [source:${triageResult.source}] ${triageResult.reason}`;

  // 0. Bypass the failing node when it is a transitive structural ancestor
  //    of the reroute target. Without this, the scheduler keeps the route
  //    target gated behind the still-failed parent and the reroute
  //    live-locks. The kernel flips the failing item from `failed` → `na`
  //    with a `bypassedFor: { routeTarget }` marker; the seal hook
  //    consumes the marker on successful completion of the route target
  //    to emit `reset-nodes` (logKey `reset-after-fix`) which re-validates
  //    the gate against the fix.
  //
  //    Skip when failing == route target (`$SELF` reroute) or when the
  //    failing node is downstream of the route target (the upstream node's
  //    `reset-nodes` cascade already handles re-running the failing one).
  if (failingNodeKey !== routeToKey) {
    const ancestors = getUpstream(ctx.pipelineState.dependencies, [routeToKey]);
    if (ancestors.includes(failingNodeKey)) {
      commands.push({
        type: "bypass-node",
        nodeKey: failingNodeKey,
        routeTarget: routeToKey,
        reason: taggedReason,
      });
    }
  }

  commands.push({
    type: "reset-nodes",
    seedKey: routeToKey,
    reason: taggedReason,
    logKey: RESET_OPS.RESET_FOR_REROUTE,
    maxCycles: maxReroutes,
  });

  // 2. Stage an unsealed `InvocationRecord` for the routed-to node.
  //    Phase 6 — the staged record carries trigger + parent lineage only.
  //    Re-entrance context flows through the `triage-handoff` JSON
  //    artifact (declared via `consumes_reroute`); Phase 3's
  //    `materializeInputsMiddleware` copies it into `<inv>/inputs/`
  //    before the dev agent runs. No prose `pendingContext` is built or
  //    persisted anymore.
  // Pre-allocate the staged invocationId outside the try so we can carry
  // it on `RerouteBuildResult.routedToInvocationId` even if the handoff
  // assembly fails (the reset-nodes + reindex path still went through).
  const stagedInvocationId = newInvocationId();
  try {
    const pipeStateForCtx = await ctx.stateReader.getStatus(slug);
    // Build the structured handoff so the outer `attachTriageHandoffArtifact`
    // wrapper can write `outputs/triage-handoff.json` for this triage
    // invocation. The `priorAttemptCount` reflects feature-level effort
    // (executionLog entries for the failing node + reset-for-reroute
    // cycles) so the rendered "Prior attempts" line tells the truth.
    const execAttempts = (pipeStateForCtx.executionLog ?? [])
      .filter((r: { nodeKey: string }) => r.nodeKey === failingNodeKey).length;
    const cycleAttempts = extractPriorAttempts(pipeStateForCtx.errorLog ?? []).length;
    const priorAttemptCount = execAttempts + cycleAttempts;
    handoff = buildTriageHandoff({
      failingNodeKey,
      rawError,
      triageRecord,
      triageResult,
      priorAttemptCount,
      pipelineSummaries: ctx.pipelineSummaries,
      errorLog: pipeStateForCtx.errorLog ?? [],
      structuredFailure,
      routeToKey,
      baselineDropCounts,
      baseline,
      slug,
      triageInvocationId: ctx.executionId,
      ...(priorDebugRecommendation
        ? {
            priorDebugRecommendation: {
              domain: priorDebugRecommendation.recommendation.domain,
              note: priorDebugRecommendation.recommendation.note,
              cycleIndex: priorDebugRecommendation.cycleIndex,
            },
          }
        : {}),
    });
    commands.push({
      type: "stage-invocation",
      itemKey: routeToKey,
      invocationId: stagedInvocationId,
      parentInvocationId: ctx.executionId,
      trigger: "triage-reroute",
      producedBy: `${ctx.itemKey}#${ctx.executionId}`,
    });
    routedToInvocationId = stagedInvocationId;
  } catch { /* non-fatal — reroute still happens via reset-nodes alone */ }

  // 3. Re-index semantic graph if target category needs it
  const targetCat = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, routeToKey)?.category;
  if (targetCat) {
    commands.push({ type: "reindex", categories: [targetCat] });
  }

  return { commands, handoff, ...(routedToInvocationId ? { routedToInvocationId } : {}) };
}
