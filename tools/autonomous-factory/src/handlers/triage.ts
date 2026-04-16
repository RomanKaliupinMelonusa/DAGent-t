/**
 * handlers/triage.ts — Triage node handler for failure classification.
 *
 * A first-class DAG node handler that classifies pipeline failures using the
 * 2-layer triage engine (RAG + LLM). Dispatched by the kernel via `on_failure`
 * edges — never through normal DAG scheduling.
 *
 * The handler CLASSIFIES and RECOMMENDS; the kernel EXECUTES the DAG reset.
 * This separation keeps the handler interface clean (observer, no state mutation).
 *
 * Handler output contract (`handlerOutput`):
 *   - routeToKey: string | null  — DAG node to reset (null = graceful degradation)
 *   - domain: string             — classified fault domain
 *   - reason: string             — human-readable reason
 *   - source: "rag" | "llm" | "fallback" — which classification layer matched
 *   - triageRecord: TriageRecord — full record for state persistence
 *   - guardResult: string        — pre-triage guard outcome ("passed" | guard name)
 */

import type { NodeHandler, NodeContext, NodeResult } from "./types.js";
import type { CompiledTriageProfile } from "../apm-types.js";
import type { TriageRecord, TriageResult } from "../types.js";
import { RESET_OPS } from "../types.js";
import { evaluateTriage, isUnfixableError, isOrchestratorTimeout } from "../triage.js";
import { computeErrorSignature } from "../triage/error-fingerprint.js";
import { getWorkflowNode } from "../session/shared.js";
import { getStatus } from "../state.js";

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
  const node = getWorkflowNode(ctx.apmContext, ctx.itemKey);
  const profileName = node?.triage_profile;
  if (!profileName) return undefined;
  return ctx.apmContext.triage_profiles?.[`default.${profileName}`];
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

    const workflow = ctx.apmContext.workflows?.default;
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
      return {
        outcome: "completed",
        summary: { intents: [`triage: unfixable signal "${unfixableReason}" → degradation`] },
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
        return {
          outcome: "completed",
          summary: { intents: [`triage: death spiral (${sameSigCount + 1}× same error) → degradation`] },
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

    // --- Resolve route_to from profile routing ---
    let routeToKey: string | null;
    let domainRetryCount = 0;

    if (triageResult.domain === "$SELF") {
      routeToKey = failingNodeKey;
    } else {
      const routeEntry = profile.routing[triageResult.domain];
      if (!routeEntry || routeEntry.route_to === null) {
        logger.event("triage.evaluate", failingNodeKey, {
          domain: triageResult.domain,
          reason: triageResult.reason,
          source: triageResult.source,
          route_to: null,
        });
        // No valid route → signal graceful degradation
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
      routeToKey = routeEntry.route_to === "$SELF" ? failingNodeKey : routeEntry.route_to;

      // Per-domain retry cap
      if (routeEntry.retries) {
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
            return {
              outcome: "completed",
              summary: { intents: [`triage: ${triageResult.domain} retry cap (${consecutiveCount}/${routeEntry.retries}) → degradation`] },
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

    // --- Build full triage record for kernel to persist ---
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
      cascade: [], // kernel fills this after resetNodes()
      cycle_count: 0, // kernel fills this after resetNodes()
      domain_retry_count: domainRetryCount,
    };
    const evId = logger.event("triage.evaluate", failingNodeKey, { ...record });
    logger.blob(evId, "error_trace", rawError);

    logger.event("state.reset", failingNodeKey, {
      route_to: routeToKey,
      domain: triageResult.domain,
      source: triageResult.source,
      reason: triageResult.reason,
    });

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

export default triageHandler;
