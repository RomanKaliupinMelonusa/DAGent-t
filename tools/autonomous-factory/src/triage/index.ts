/**
 * triage/index.ts — 2-layer error triage for pipeline failures.
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
import type { TriageResult } from "../types.js";
import type { CompiledTriageProfile } from "../apm/types.js";
import type { PipelineLogger } from "../logger.js";
import { retrieveTopMatches } from "./retriever.js";
import { askLlmRouter } from "./llm-router.js";
import { loadCustomClassifier } from "./custom-classifier.js";

export { computeErrorSignature, normalizeError } from "./error-fingerprint.js";

// ---------------------------------------------------------------------------
// Public API — triage evaluation
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
  logger?: PipelineLogger,
  repoRoot?: string,
): Promise<TriageResult> {
  // Resolve classifier strategy.
  // - Built-in strategy keywords are the canonical enum + friendly aliases.
  // - Anything starting with "./" is treated as a sandboxed custom classifier module.
  // - Anything else falls back to "rag+llm" / "rag-only" derived from llm_fallback.
  const raw = profile.classifier;
  const builtinMap: Record<string, "rag+llm" | "rag-only" | "llm-only"> = {
    "rag+llm": "rag+llm",
    "rag-only": "rag-only",
    "rag": "rag-only",
    "llm-only": "llm-only",
    "llm": "llm-only",
  };

  // Custom classifier path → delegate entirely.
  if (raw && raw.startsWith("./")) {
    if (!appRoot) {
      throw new Error(`Custom classifier "${raw}" requires an appRoot for path resolution.`);
    }
    const classify = await loadCustomClassifier(raw, appRoot, repoRoot ?? appRoot);
    const result = await classify(errorTrace, profile, { client, slug, logger });
    // Validate that the returned domain exists in the routing table (or is $SELF).
    if (result.domain !== "$SELF" && !(result.domain in profile.routing)) {
      throw new Error(
        `Custom classifier "${raw}" returned domain "${result.domain}" ` +
        `which is not in profile.routing. Valid domains: ${Object.keys(profile.routing).join(", ")} or $SELF.`,
      );
    }
    return result;
  }

  const classifier: "rag+llm" | "rag-only" | "llm-only" =
    (raw ? builtinMap[raw] : undefined) ?? (profile.llm_fallback ? "rag+llm" : "rag-only");

  const useRag = classifier !== "llm-only";
  const useLlm = classifier !== "rag-only";

  // --- Layer 1: RAG — deterministic substring match ---
  const topMatches = useRag && profile.signatures.length > 0
    ? retrieveTopMatches(errorTrace, profile.signatures)
    : [];

  // Build structured rag_matches for the result record
  const ragMatches = topMatches.map((m, i) => ({
    snippet: m.error_snippet,
    domain: m.fault_domain,
    reason: m.reason,
    rank: i + 1,
  }));

  if (useRag && topMatches.length > 0) {
    const bestMatch = topMatches[0];
    // Validate that the matched domain exists in this profile's routing
    if (bestMatch.fault_domain in profile.routing) {
      return {
        domain: bestMatch.fault_domain,
        reason: bestMatch.reason,
        source: "rag",
        rag_matches: ragMatches,
      };
    }
    // RAG matched a domain not in this profile's routing — fall through to LLM
    logger?.event("triage.evaluate", null, {
      domain: bestMatch.fault_domain,
      reason: `RAG match domain "${bestMatch.fault_domain}" not in profile routing — falling through to LLM`,
      source: "fallback",
      rag_match_count: topMatches.length,
    });
  }

  // --- Layer 2: LLM — cognitive classification ---
  if (useLlm && client && slug && appRoot) {
    const domains = Object.keys(profile.routing);
    const routingDescriptions: Record<string, { description?: string }> = {};
    for (const [d, entry] of Object.entries(profile.routing)) {
      if (entry.description) routingDescriptions[d] = { description: entry.description };
    }
    const t0 = Date.now();
    const result = await askLlmRouter(client, errorTrace, domains, topMatches, slug, appRoot, routingDescriptions);
    const llmResponseMs = Date.now() - t0;
    return {
      domain: result.fault_domain,
      reason: result.reason,
      source: "llm",
      rag_matches: ragMatches,
      llm_response_ms: llmResponseMs,
    };
  }

  // --- Fallback: unclassified — retry $SELF ---
  return {
    domain: "$SELF",
    reason: "unclassified — no RAG matches, LLM unavailable",
    source: "fallback",
    rag_matches: ragMatches,
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
