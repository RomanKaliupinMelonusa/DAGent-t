/**
 * handlers/triage.ts — Triage node handler for failure classification.
 *
 * A first-class DAG node handler that classifies pipeline failures using the
 * 2-layer triage engine (RAG + LLM). Dispatched by the kernel via `on_failure`
 * edges or through standard DAG scheduling (Phase 4+).
 *
 * The handler is a PURE CLASSIFIER — it returns declarative DagCommands for
 * the kernel's command executor to process. It never calls state-mutation
 * APIs directly (resetNodes, salvageForDraft, etc.).
 *
 * Read-only state access (getStatus) is permitted for observation:
 *   - Reading errorLog for cycle count estimation
 *   - Reading executionLog for attempt count derivation
 *
 * Handler output contract (`handlerOutput`):
 *   - routeToKey: string | null  — DAG node to reset (null = graceful degradation)
 *   - domain: string             — classified fault domain
 *   - reason: string             — human-readable reason
 *   - source: "rag" | "llm" | "fallback" — which classification layer matched
 *   - triageRecord: TriageRecord — full record (persisted via set-triage-record command)
 *   - guardResult: string        — pre-triage guard outcome ("passed" | guard name)
 */

import type { NodeBudgetPolicy } from "../app-types.js";
import type { NodeHandler, NodeContext, NodeResult, DagCommand } from "./types.js";
import type { CompiledTriageProfile } from "../apm/types.js";
import type { TriageRecord, TriageResult } from "../types.js";
import { RESET_OPS } from "../types.js";
import { evaluateTriage } from "../triage/index.js";
import { computeErrorSignature } from "../triage/error-fingerprint.js";
import { getWorkflowNode, resolveNodeBudgetPolicy } from "../session/dag-utils.js";
import { buildTriageRejectionContext, composeTriageContext } from "../triage/context-builder.js";
import { computeEffectiveDevAttempts } from "../triage/context-builder.js";

// ---------------------------------------------------------------------------
// Triage handler output — typed contract for kernel consumption
// ---------------------------------------------------------------------------

export interface TriageHandlerOutput {
  /** DAG node key to reset, or null to signal graceful degradation (blocked). */
  routeToKey: string | null;
  /** Classified fault domain. */
  domain: string;
  /** Human-readable classification reason. */
  reason: string;
  /** Which classification layer produced the result. */
  source: "rag" | "llm" | "fallback";
  /** Full triage record for kernel to persist via setLastTriageRecord(). */
  triageRecord: TriageRecord;
  /** Pre-triage guard outcome — "passed" if guards did not intercept. */
  guardResult: TriageRecord["guard_result"];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the compiled triage profile for a triage node. */
function resolveProfile(ctx: NodeContext): CompiledTriageProfile | undefined {
  const node = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, ctx.itemKey);
  const profileName = node?.triage_profile;
  if (!profileName) return undefined;
  return ctx.apmContext.triage_profiles?.[`${ctx.pipelineState.workflowName}.${profileName}`];
}

/**
 * Build DagCommands for graceful degradation (salvage to Draft PR).
 * Replaces the old `executeSalvage()` helper that called state APIs directly.
 */
function buildSalvageCommands(
  failingKey: string,
  errorMsg: string,
  triageRecord: TriageRecord,
): DagCommand[] {
  return [
    { type: "set-triage-record", record: triageRecord },
    { type: "salvage-draft", failedItemKey: failingKey, reason: errorMsg },
  ];
}

/**
 * Build DagCommands for a successful reroute (reset target + downstream).
 * Assembles: set-triage-record → reset-nodes → set-pending-context → reindex.
 */
async function buildRerouteCommands(
  ctx: NodeContext,
  routeToKey: string,
  triageRecord: TriageRecord,
  triageResult: TriageResult,
  maxReroutes: number,
  routeToPolicy: NodeBudgetPolicy,
): Promise<DagCommand[]> {
  const { slug } = ctx;
  const commands: DagCommand[] = [];

  // 1. Persist triage record first (so it's available during reset)
  commands.push({ type: "set-triage-record", record: triageRecord });

  // 2. Reset target node + all downstream dependents
  const taggedReason = `[domain:${triageResult.domain}] [source:${triageResult.source}] ${triageResult.reason}`;
  commands.push({
    type: "reset-nodes",
    seedKey: routeToKey,
    reason: taggedReason,
    logKey: RESET_OPS.RESET_FOR_REROUTE,
    maxCycles: maxReroutes,
  });

  // 3. Build and inject pendingContext for the target node
  try {
    const pipeStateForCtx = await ctx.stateReader.getStatus(slug);
    const targetExecLog = (pipeStateForCtx.executionLog ?? [])
      .filter((r: { nodeKey: string }) => r.nodeKey === routeToKey);
    const targetAttempt = targetExecLog.length > 0
      ? Math.max(...targetExecLog.map((r: { attempt: number }) => r.attempt)) + 1
      : 1;
    const targetEffective = await computeEffectiveDevAttempts(
      routeToKey, targetAttempt, slug, routeToPolicy.allowsRevertBypass,
    );
    const lastSummary = [...ctx.pipelineSummaries].reverse().find((s) => s.key === routeToKey);
    const rejectionCtx = await buildTriageRejectionContext(slug);
    const composed = composeTriageContext({
      slug,
      itemKey: routeToKey,
      attempt: targetAttempt,
      effectiveAttempts: targetEffective,
      pipelineSummaries: ctx.pipelineSummaries,
      previousAttempt: lastSummary,
      allowsRevertBypass: routeToPolicy.allowsRevertBypass,
      revertWarningAt: routeToPolicy.revertWarningAt,
      ciWorkflowFilePatterns: ctx.apmContext.config?.ciWorkflows?.filePatterns as string[] | undefined,
      ciScopeWarning: ctx.apmContext.config?.ci_scope_warning as string | undefined,
      rejectionContext: rejectionCtx || undefined,
    });
    if (composed) {
      commands.push({ type: "set-pending-context", itemKey: routeToKey, context: composed });
    }
  } catch { /* non-fatal — reroute still works without pendingContext */ }

  // 4. Re-index semantic graph if target category needs it
  const targetCat = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, routeToKey)?.category;
  if (targetCat) {
    commands.push({ type: "reindex", categories: [targetCat] });
  }

  return commands;
}

// ---------------------------------------------------------------------------
// Handler implementation
// ---------------------------------------------------------------------------

const triageHandler: NodeHandler = {
  name: "triage",

  async execute(ctx: NodeContext): Promise<NodeResult> {
    const { slug, logger } = ctx;

    // --- Validate failure context ---
    const failingNodeKey = ctx.failingNodeKey;
    const rawError = ctx.rawError;
    if (!failingNodeKey || !rawError) {
      return {
        outcome: "error",
        errorMessage: "Triage handler invoked without failure context (failingNodeKey/rawError missing).",
        summary: {},
      };
    }

    // --- Resolve triage profile ---
    const profile = resolveProfile(ctx);
    if (!profile) {
      return {
        outcome: "error",
        errorMessage: `Triage node "${ctx.itemKey}" could not resolve triage profile.`,
        summary: {},
      };
    }

    const errorSig = ctx.errorSignature ?? computeErrorSignature(rawError);

    // NOTE: Pre-triage guards (timeout, unfixable, dedup, death spiral) have
    // been moved to the kernel's stepTriageGuard dispatch step. If we reach
    // here, all guards have already passed.

    // --- 2-layer triage classification (RAG → LLM → fallback) ---
    const client = ctx.client;
    const triageResult: TriageResult = await evaluateTriage(
      rawError, profile, client, slug, ctx.appRoot, logger,
    );

    // --- Resolve route_to from failing node's on_failure.routes (graph-level) ---
    // Fallback: profile.routing[domain].route_to (backward compat)
    let routeToKey: string | null;
    let domainRetryCount = 0;
    const failureRoutes = ctx.failureRoutes ?? {};

    if (triageResult.domain === "$SELF") {
      routeToKey = failingNodeKey;
    } else {
      // Primary: on_failure.routes from the failing node
      const routeFromGraph = failureRoutes[triageResult.domain];
      // Fallback: profile routing table (backward compat for compiled contexts without on_failure.routes)
      const routeEntry = profile.routing[triageResult.domain];
      const resolvedRoute = routeFromGraph !== undefined ? routeFromGraph : (routeEntry?.route_to ?? undefined);

      if (resolvedRoute === null || resolvedRoute === undefined) {
        logger.event("triage.evaluate", failingNodeKey, {
          domain: triageResult.domain,
          reason: triageResult.reason,
          source: triageResult.source,
          route_to: null,
        });
        // No valid route → graceful degradation
        const record: TriageRecord = {
          failing_item: failingNodeKey,
          error_signature: errorSig,
          guard_result: "passed",
          rag_matches: triageResult.rag_matches ?? [],
          rag_selected: triageResult.source === "rag" ? (triageResult.rag_matches?.[0]?.snippet ?? null) : null,
          llm_invoked: triageResult.source === "llm",
          llm_domain: triageResult.source === "llm" ? triageResult.domain : undefined,
          llm_reason: triageResult.source === "llm" ? triageResult.reason : undefined,
          llm_response_ms: triageResult.llm_response_ms,
          domain: triageResult.domain,
          reason: triageResult.reason,
          source: triageResult.source,
          route_to: "$BLOCKED",
          cascade: [],
          cycle_count: 0,
          domain_retry_count: 0,
        };
        return {
          outcome: "completed",
          summary: { intents: [`triage: ${triageResult.domain} → route_to null → degradation`] },
          signals: { halt: false },
          commands: buildSalvageCommands(failingNodeKey, rawError, record),
          handlerOutput: {
            routeToKey: null,
            domain: triageResult.domain,
            reason: triageResult.reason,
            source: triageResult.source,
            triageRecord: record,
            guardResult: "passed",
          } satisfies TriageHandlerOutput,
        };
      }
      routeToKey = resolvedRoute === "$SELF" ? failingNodeKey : resolvedRoute;

      // Per-domain retry cap (from profile routing table)
      if (routeEntry?.retries) {
        try {
          const pipeState = await ctx.stateReader.getStatus(slug);
          const domainTag = `[domain:${triageResult.domain}]`;
          let consecutiveCount = 0;
          for (let i = (pipeState.errorLog ?? []).length - 1; i >= 0; i--) {
            const entry = pipeState.errorLog[i];
            if (entry.itemKey === RESET_OPS.RESET_FOR_REROUTE && entry.message?.includes(domainTag)) {
              consecutiveCount++;
            } else if (entry.itemKey === RESET_OPS.RESET_FOR_REROUTE) {
              break;
            }
          }
          domainRetryCount = consecutiveCount;
          if (consecutiveCount >= routeEntry.retries) {
            logger.event("triage.evaluate", failingNodeKey, {
              domain: triageResult.domain,
              reason: `domain retry cap reached (${consecutiveCount}/${routeEntry.retries})`,
              source: triageResult.source,
            });
            const record: TriageRecord = {
              failing_item: failingNodeKey,
              error_signature: errorSig,
              guard_result: "passed",
              rag_matches: triageResult.rag_matches ?? [],
              rag_selected: triageResult.source === "rag" ? (triageResult.rag_matches?.[0]?.snippet ?? null) : null,
              llm_invoked: triageResult.source === "llm",
              domain: triageResult.domain,
              reason: `domain retry cap reached (${consecutiveCount}/${routeEntry.retries})`,
              source: triageResult.source,
              route_to: "$BLOCKED",
              cascade: [],
              cycle_count: 0,
              domain_retry_count: domainRetryCount,
            };
            return {
              outcome: "completed",
              summary: { intents: [`triage: ${triageResult.domain} retry cap (${consecutiveCount}/${routeEntry.retries}) → degradation`] },
              signals: { halt: false },
              commands: buildSalvageCommands(failingNodeKey, rawError, record),
              handlerOutput: {
                routeToKey: null,
                domain: triageResult.domain,
                reason: `domain retry cap reached (${consecutiveCount}/${routeEntry.retries})`,
                source: triageResult.source,
                triageRecord: record,
                guardResult: "passed",
              } satisfies TriageHandlerOutput,
            };
          }
        } catch { /* continue with reroute */ }
      }
    }

    // --- Build full triage record ---
    // Pre-compute cycle_count from errorLog (handler is read-only, executor is generic)
    let estimatedCycleCount = 0;
    try {
      const pipeState = await ctx.stateReader.getStatus(slug);
      estimatedCycleCount = pipeState.errorLog.filter(
        (e) => e.itemKey === RESET_OPS.RESET_FOR_REROUTE,
      ).length;
    } catch { /* best effort — defaults to 0 */ }

    const record: TriageRecord = {
      failing_item: failingNodeKey,
      error_signature: errorSig,
      guard_result: "passed",
      rag_matches: triageResult.rag_matches ?? [],
      rag_selected: triageResult.source === "rag" ? (triageResult.rag_matches?.[0]?.snippet ?? null) : null,
      llm_invoked: triageResult.source === "llm",
      llm_domain: triageResult.source === "llm" ? triageResult.domain : undefined,
      llm_reason: triageResult.source === "llm" ? triageResult.reason : undefined,
      llm_response_ms: triageResult.llm_response_ms,
      domain: triageResult.domain,
      reason: triageResult.reason,
      source: triageResult.source,
      route_to: routeToKey,
      cascade: [],
      cycle_count: estimatedCycleCount + 1,
      domain_retry_count: domainRetryCount,
    };
    const evId = logger.event("triage.evaluate", failingNodeKey, { ...record });
    logger.blob(evId, "error_trace", rawError);

    // --- Build reroute commands: triage-record → reset-nodes → pending-context → reindex ---
    const triageNodeKey = ctx.itemKey;
    const triageNode = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, triageNodeKey);
    const profileName2 = triageNode?.triage_profile;
    const profileForCap = profileName2
      ? ctx.apmContext.triage_profiles?.[`${ctx.pipelineState.workflowName}.${profileName2}`]
      : undefined;
    // Budget policy for the route-to (failing) node determines max reroute cycles.
    // Falls back to the triage profile's max_reroutes, then code default (5).
    const routeToNode = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, routeToKey);
    const routeToPolicy = resolveNodeBudgetPolicy(routeToNode, ctx.apmContext);
    const maxReroutes = profileForCap?.max_reroutes ?? routeToPolicy.maxRerouteCycles;

    const commands = await buildRerouteCommands(ctx, routeToKey, record, triageResult, maxReroutes, routeToPolicy);

    return {
      outcome: "completed",
      summary: { intents: [`triage: ${triageResult.domain} (${triageResult.source}) → route to ${routeToKey}`] },
      commands,
      handlerOutput: {
        routeToKey,
        domain: triageResult.domain,
        reason: triageResult.reason,
        source: triageResult.source,
        triageRecord: record,
        guardResult: "passed",
      } satisfies TriageHandlerOutput,
    };
  },
};

export default triageHandler;
