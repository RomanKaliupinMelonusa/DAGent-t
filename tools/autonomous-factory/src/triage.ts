/**
 * triage.ts — 2-layer error triage for pipeline failures.
 *
 * Classifies error traces into fault domains using a triage profile:
 *   Layer 1 (RAG): Deterministic substring match from triage packs. $0, <1ms.
 *   Layer 2 (LLM): Cognitive classification via Copilot SDK. ~$0.01, ~2s.
 *
 * Pre-triage guards (unfixable signals, SDK timeout, death spiral) are the
 * kernel's responsibility — they run BEFORE evaluateTriage is called.
 *
 * The triage engine classifies; the DAG state machine routes via route_to.
 */

import type { CopilotClient } from "@github/copilot-sdk";
import type { TriageResult } from "./types.js";
import type { CompiledTriageProfile, TriageSignature } from "./apm-types.js";
import { retrieveTopMatches } from "./triage/retriever.js";
import { askLlmRouter } from "./triage/llm-router.js";
export { computeErrorSignature } from "./triage/error-fingerprint.js";

// ---------------------------------------------------------------------------
// Public API — v2 (profile-based)
// ---------------------------------------------------------------------------

/**
 * Evaluate a failure trace against a compiled triage profile.
 * Returns a TriageResult with the classified domain, reason, and source layer.
 *
 * The caller uses `profile.routing[result.domain].route_to` to determine
 * which DAG node to reset. The kernel cascades all downstream dependents.
 */
export async function evaluateTriage(
  errorTrace: string,
  profile: CompiledTriageProfile,
  client?: CopilotClient,
  slug?: string,
  appRoot?: string,
): Promise<TriageResult> {
  // --- Layer 1: RAG — deterministic substring match ---
  const topMatches = profile.signatures.length > 0
    ? retrieveTopMatches(errorTrace, profile.signatures)
    : [];

  if (topMatches.length > 0) {
    const bestMatch = topMatches[0];
    // Validate that the matched domain exists in this profile's routing
    if (bestMatch.fault_domain in profile.routing) {
      console.log(`  🔍 RAG triage: matched "${bestMatch.error_snippet}" → ${bestMatch.fault_domain} (${bestMatch.reason})`);
      return {
        domain: bestMatch.fault_domain,
        reason: bestMatch.reason,
        source: "rag",
      };
    }
    // RAG matched a domain not in this profile's routing — fall through to LLM
    console.log(`  ⚠ RAG match domain "${bestMatch.fault_domain}" not in profile routing — falling through to LLM`);
  }

  // --- Layer 2: LLM — cognitive classification ---
  if (profile.llm_fallback && client && slug && appRoot) {
    console.log("  🤖 LLM triage: classifying novel error via Copilot SDK");
    const domains = Object.keys(profile.routing);
    const routingDescriptions: Record<string, { description?: string }> = {};
    for (const [d, entry] of Object.entries(profile.routing)) {
      if (entry.description) routingDescriptions[d] = { description: entry.description };
    }
    const result = await askLlmRouter(client, errorTrace, domains, topMatches, slug, appRoot, routingDescriptions);
    console.log(`  🤖 LLM triage result: fault_domain=${result.fault_domain} (${result.reason})`);
    return {
      domain: result.fault_domain,
      reason: result.reason,
      source: "llm",
    };
  }

  // --- Fallback: unclassified — retry $SELF ---
  console.warn("  ⚠ Triage could not determine root cause (no RAG matches, LLM unavailable/disabled). Falling back to $SELF retry.");
  return {
    domain: "$SELF",
    reason: "unclassified — no RAG matches, LLM unavailable",
    source: "fallback",
  };
}

// ---------------------------------------------------------------------------
// Kernel guards — pre-triage checks (NOT part of triage evaluation)
// ---------------------------------------------------------------------------

/**
 * Check whether an error contains signals that no agent can fix.
 * Returns the matching signal reason, or `null` if fixable.
 */
export function isUnfixableError(errorMessage: string, unfixableSignals: string[]): string | null {
  const msg = errorMessage.toLowerCase();
  for (const signal of unfixableSignals) {
    if (msg.includes(signal)) return signal;
  }
  return null;
}

/**
 * Check whether the error is an SDK/orchestrator session timeout.
 * These must be intercepted BEFORE triage — they are infrastructure
 * errors, not codebase errors.
 */
export function isOrchestratorTimeout(errorMessage: string): boolean {
  return /timeout after \d+ms/i.test(errorMessage)
      && /waiting for session\.idle/i.test(errorMessage);
}
