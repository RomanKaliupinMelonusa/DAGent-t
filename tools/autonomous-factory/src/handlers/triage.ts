/**
 * handlers/triage.ts — Triage node handler for failure classification.
 *
 * A first-class DAG node handler that classifies pipeline failures using the
 * 2-layer triage engine (RAG + LLM). Dispatched by the kernel via `on_failure`
 * edges — never through normal DAG scheduling.
 *
 * The handler CLASSIFIES **and** EXECUTES DAG mutations (resetNodes,
 * salvageForDraft, setLastTriageRecord, setPendingContext). This is the only
 * handler with state mutation authority — all other handlers are observers.
 *
 * Handler output contract (`handlerOutput`):
 *   - routeToKey: string | null  — DAG node that was reset (null = graceful degradation)
 *   - domain: string             — classified fault domain
 *   - reason: string             — human-readable reason
 *   - source: "rag" | "llm" | "fallback" — which classification layer matched
 *   - triageRecord: TriageRecord — full record (already persisted by handler)
 *   - guardResult: string        — pre-triage guard outcome ("passed" | guard name)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { NodeHandler, NodeContext, NodeResult } from "./types.js";
import type { CompiledTriageProfile } from "../apm-types.js";
import type { TriageRecord, TriageResult } from "../types.js";
import { RESET_OPS } from "../types.js";
import { evaluateTriage, isUnfixableError, isOrchestratorTimeout } from "../triage.js";
import { computeErrorSignature } from "../triage/error-fingerprint.js";
import { getWorkflowNode, resolveCircuitBreaker, getHeadSha } from "../session/shared.js";
import { getStatus, resetNodes, salvageForDraft, setLastTriageRecord, setPendingContext } from "../state.js";
import { buildTriageRejectionContext, composeTriageContext, checkRetryDedup } from "../triage/context-builder.js";
import { computeEffectiveDevAttempts } from "../context-injection.js";

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

/** Build a TriageRecord for guard-terminated paths (no classification ran). */
function buildGuardRecord(
  failingItem: string,
  errorSig: string,
  guardResult: TriageRecord["guard_result"],
  guardDetail: string,
  domain: string,
  reason: string,
): TriageRecord {
  return {
    failing_item: failingItem,
    error_signature: errorSig,
    guard_result: guardResult,
    guard_detail: guardDetail,
    rag_matches: [],
    rag_selected: null,
    llm_invoked: false,
    domain,
    reason,
    source: "fallback",
    route_to: failingItem,
    cascade: [],
    cycle_count: 0,
    domain_retry_count: 0,
  };
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

    const workflow = ctx.apmContext.workflows?.[ctx.pipelineState.workflowName];
    const unfixableSignals = workflow?.unfixable_signals ?? [];
    const errorSig = ctx.errorSignature ?? computeErrorSignature(rawError);

    // --- Pre-triage guard: SDK timeout → transient retry ($SELF) ---
    if (isOrchestratorTimeout(rawError)) {
      const record = buildGuardRecord(
        failingNodeKey, errorSig,
        "timeout_bypass", "SDK session timeout",
        "$SELF", "SDK timeout — transient retry",
      );
      const evId = logger.event("triage.evaluate", failingNodeKey, { ...record });
      logger.blob(evId, "error_trace", rawError);
      return {
        outcome: "completed",
        summary: { intents: [`triage: SDK timeout → retry ${failingNodeKey}`] },
        handlerOutput: {
          routeToKey: failingNodeKey,
          domain: "$SELF",
          reason: "SDK timeout — transient retry",
          source: "fallback",
          triageRecord: record,
          guardResult: "timeout_bypass",
        } satisfies TriageHandlerOutput,
      };
    }

    // --- Pre-triage guard: unfixable signals → graceful degradation ---
    const unfixableReason = isUnfixableError(rawError, unfixableSignals);
    if (unfixableReason) {
      const record = buildGuardRecord(
        failingNodeKey, errorSig,
        "unfixable_halt", unfixableReason,
        "blocked", `unfixable signal: ${unfixableReason}`,
      );
      const evId = logger.event("triage.evaluate", failingNodeKey, { ...record });
      logger.blob(evId, "error_trace", rawError);
      await executeSalvage(ctx, failingNodeKey, rawError, record, logger);
      return {
        outcome: "completed",
        summary: { intents: [`triage: unfixable signal "${unfixableReason}" → degradation`] },
        signals: { halt: false },
        handlerOutput: {
          routeToKey: null,
          domain: "blocked",
          reason: `unfixable signal: ${unfixableReason}`,
          source: "fallback",
          triageRecord: record,
          guardResult: "unfixable_halt",
        } satisfies TriageHandlerOutput,
      };
    }

    // --- Pre-triage guard: retry dedup (same error at same HEAD → halt) ---
    try {
      const pipeState = await getStatus(slug);
      const executionLog = pipeState.executionLog ?? [];
      const failingNode = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, failingNodeKey);
      const cbConfig = resolveCircuitBreaker(failingNode);
      // Derive attempt count from execution log (in-memory attemptCounts not visible here)
      const failingRecords = executionLog.filter((r: { nodeKey: string }) => r.nodeKey === failingNodeKey);
      const attemptCount = failingRecords.length > 0 ? Math.max(...failingRecords.map((r: { attempt: number }) => r.attempt)) + 1 : 1;
      const dedupResult = checkRetryDedup(
        failingNodeKey, attemptCount, executionLog,
        ctx.repoRoot, cbConfig.allowsRevertBypass,
      );
      if (dedupResult) {
        const record = buildGuardRecord(
          failingNodeKey, errorSig,
          "retry_dedup", dedupResult.reason,
          dedupResult.halt ? "blocked" : "$SELF",
          dedupResult.reason,
        );
        const evId = logger.event("triage.evaluate", failingNodeKey, { ...record });
        logger.blob(evId, "error_trace", rawError);
        if (dedupResult.halt) {
          await executeSalvage(ctx, failingNodeKey, rawError, record, logger);
          return {
            outcome: "completed",
            summary: { intents: [`triage: retry dedup → halt (${dedupResult.reason})`] },
            signals: { halt: false },
            handlerOutput: {
              routeToKey: null,
              domain: "blocked",
              reason: dedupResult.reason,
              source: "fallback",
              triageRecord: record,
              guardResult: "retry_dedup",
            } satisfies TriageHandlerOutput,
          };
        }
      }
    } catch { /* continue to next guard */ }

    // --- Pre-triage guard: death spiral (same error ≥N times) ---
    const deathSpiralThreshold = ctx.apmContext.config?.max_same_error_cycles ?? 3;
    try {
      const pipeState = await getStatus(slug);
      const sameSigCount = pipeState.errorLog.filter((e) => e.errorSignature === errorSig).length;
      if (sameSigCount >= deathSpiralThreshold) {
        const record = buildGuardRecord(
          failingNodeKey, errorSig,
          "death_spiral", `signature ${errorSig} seen ${sameSigCount + 1}×`,
          "blocked", `death spiral — error signature ${errorSig} seen ${sameSigCount + 1} times`,
        );
        const evId = logger.event("triage.evaluate", failingNodeKey, { ...record });
        logger.blob(evId, "error_trace", rawError);
        await executeSalvage(ctx, failingNodeKey, rawError, record, logger);
        return {
          outcome: "completed",
          summary: { intents: [`triage: death spiral (${sameSigCount + 1}× same error) → degradation`] },
          signals: { halt: false },
          handlerOutput: {
            routeToKey: null,
            domain: "blocked",
            reason: `death spiral — error signature ${errorSig} seen ${sameSigCount + 1} times`,
            source: "fallback",
            triageRecord: record,
            guardResult: "death_spiral",
          } satisfies TriageHandlerOutput,
        };
      }
    } catch { /* continue to triage classification */ }

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
        // No valid route → execute graceful degradation
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
        await executeSalvage(ctx, failingNodeKey, rawError, record, logger);
        return {
          outcome: "completed",
          summary: { intents: [`triage: ${triageResult.domain} → route_to null → degradation`] },
          signals: { halt: false },
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
          const pipeState = await getStatus(slug);
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
            await executeSalvage(ctx, failingNodeKey, rawError, record, logger);
            return {
              outcome: "completed",
              summary: { intents: [`triage: ${triageResult.domain} retry cap (${consecutiveCount}/${routeEntry.retries}) → degradation`] },
              signals: { halt: false },
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
      cycle_count: 0,
      domain_retry_count: domainRetryCount,
    };
    const evId = logger.event("triage.evaluate", failingNodeKey, { ...record });
    logger.blob(evId, "error_trace", rawError);

    // --- Execute DAG reset: target node + all downstream dependents ---
    const triageNodeKey = ctx.itemKey;
    const triageNode = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, triageNodeKey);
    const profileName2 = triageNode?.triage_profile;
    const profileForCap = profileName2
      ? ctx.apmContext.triage_profiles?.[`${ctx.pipelineState.workflowName}.${profileName2}`]
      : undefined;
    const maxReroutes = profileForCap?.max_reroutes ?? 5;

    const taggedReason = `[domain:${triageResult.domain}] [source:${triageResult.source}] ${triageResult.reason}`;

    logger.event("state.reset", failingNodeKey, {
      route_to: routeToKey,
      domain: triageResult.domain,
      source: triageResult.source,
      reason: triageResult.reason,
    });

    try {
      const resetResult = await resetNodes(slug, routeToKey, taggedReason, maxReroutes, RESET_OPS.RESET_FOR_REROUTE);
      if (resetResult.halted) {
        logger.event("item.end", failingNodeKey, { outcome: "failed", halted: true, error_preview: `${resetResult.cycleCount} reroute cycles exhausted` });
        return {
          outcome: "completed",
          summary: { intents: [`triage: ${triageResult.domain} (${triageResult.source}) → reroute cap exhausted`] },
          signals: { halt: true },
          handlerOutput: {
            routeToKey,
            domain: triageResult.domain,
            reason: triageResult.reason,
            source: triageResult.source,
            triageRecord: record,
            guardResult: "passed",
          } satisfies TriageHandlerOutput,
        };
      }

      // Enrich triage record with cascade info from resetNodes
      const enrichedRecord: TriageRecord = {
        ...record,
        cascade: resetResult.state.items
          .filter((it: { status: string; key: string }) => it.status === "pending" && it.key !== routeToKey)
          .map((it: { key: string }) => it.key),
        cycle_count: resetResult.cycleCount,
      };

      // Persist the triage record
      try { await setLastTriageRecord(slug, enrichedRecord); } catch { /* non-fatal */ }

      // Build and persist full pendingContext for the target node
      try {
        const targetNode = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, routeToKey);
        const targetCb = resolveCircuitBreaker(targetNode);
        // Derive target attempt count from execution log (PipelineItem has no
        // `attempt` field — attempts are tracked per-invocation in the log).
        const pipeStateForCtx = await getStatus(slug);
        const targetExecLog = (pipeStateForCtx.executionLog ?? [])
          .filter((r: { nodeKey: string }) => r.nodeKey === routeToKey);
        const targetAttempt = targetExecLog.length > 0
          ? Math.max(...targetExecLog.map((r: { attempt: number }) => r.attempt)) + 1
          : 1;
        const targetEffective = await computeEffectiveDevAttempts(
          routeToKey, targetAttempt, slug, targetCb.allowsRevertBypass,
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
          allowsRevertBypass: targetCb.allowsRevertBypass,
          revertWarningAt: targetCb.revertWarningAt,
          ciWorkflowFilePatterns: ctx.apmContext.config?.ciWorkflows?.filePatterns as string[] | undefined,
          ciScopeWarning: ctx.apmContext.config?.ci_scope_warning as string | undefined,
          rejectionContext: rejectionCtx || undefined,
        });
        if (composed) {
          await setPendingContext(slug, routeToKey, composed);
        }
      } catch { /* non-fatal */ }

      // Re-index semantic graph after reroute if target category needs it
      const repoRoot = ctx.repoRoot;
      const targetCat = getWorkflowNode(ctx.apmContext, ctx.pipelineState.workflowName, routeToKey)?.category;
      const reindexCats = new Set((ctx.apmContext.config?.reindex_categories as string[]) ?? ["dev", "test"]);
      if (targetCat && reindexCats.has(targetCat)) {
        logger.event("tool.call", routeToKey, { tool: "roam", category: "index", detail: " → re-indexing after reroute", is_write: false });
        try {
          execSync("roam index", { cwd: repoRoot, stdio: "inherit", timeout: 120_000 });
        } catch { /* non-fatal */ }
      }
    } catch {
      logger.event("item.end", failingNodeKey, { outcome: "error", halted: true, error_preview: "Could not execute reroute" });
      return {
        outcome: "error",
        errorMessage: "Could not execute DAG reset after triage classification",
        summary: {},
        signals: { halt: true },
      };
    }

    return {
      outcome: "completed",
      summary: { intents: [`triage: ${triageResult.domain} (${triageResult.source}) → route to ${routeToKey}`] },
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

// ---------------------------------------------------------------------------
// State mutation helpers (triage handler has exclusive mutation authority)
// ---------------------------------------------------------------------------

/**
 * Execute graceful degradation — salvage partial work to a Draft PR.
 * Called when routeToKey is null (no valid route) or domain retry cap reached.
 */
async function executeSalvage(
  ctx: NodeContext,
  failingKey: string,
  errorMsg: string,
  triageRecord: TriageRecord,
  logger: NodeContext["logger"],
): Promise<void> {
  const { slug, appRoot } = ctx;
  logger.event("state.salvage", failingKey, { reason: errorMsg.slice(0, 500) });
  // Note: failItem is NOT called here — the kernel already called kernelFail
  // before dispatching on_failure. We only do salvageForDraft (skip-to-draft).
  try {
    await salvageForDraft(slug, failingKey);
  } catch { /* best effort */ }
  const draftFlagPath = path.join(appRoot, "in-progress", `${slug}.blocked-draft`);
  fs.writeFileSync(draftFlagPath, errorMsg, "utf-8");
  try {
    await setLastTriageRecord(slug, triageRecord);
  } catch { /* non-fatal */ }
}

export default triageHandler;
