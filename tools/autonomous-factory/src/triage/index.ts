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

import type { TriageLlm } from "../ports/triage-llm.js";
import type { TriageResult } from "../types.js";
import type { CompiledTriageProfile } from "../apm/types.js";
import type { PipelineLogger } from "../telemetry/index.js";
import type { BaselineProfile } from "../ports/baseline-loader.js";
import { retrieveTopMatches } from "./retriever.js";
import { askLlmRouter } from "./llm-router.js";
import { extractPriorAttempts } from "./historian.js";
import { loadCustomClassifier } from "./custom-classifier.js";

/** Minimal errorLog shape consumed by `extractPriorAttempts`. Matches the
 *  shape on `PipelineState.errorLog` without importing the full state
 *  module here. */
interface TriageErrorLogEntry {
  readonly timestamp: string;
  readonly itemKey: string;
  readonly message: string;
  readonly errorSignature?: string | null;
}

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
  triageLlm?: TriageLlm,
  slug?: string,
  appRoot?: string,
  logger?: PipelineLogger,
  repoRoot?: string,
  baseline?: BaselineProfile | null,
  errorLog?: readonly TriageErrorLogEntry[],
  failingNodeKey?: string,
  priorDebugRecommendation?: { readonly domain: string; readonly note: string; readonly cycleIndex: number },
  filteredStructuredFailure?: unknown,
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
    const result = await classify(errorTrace, profile, { triageLlm, slug, logger });
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
  if (useLlm && triageLlm && slug && appRoot) {
    const domains = Object.keys(profile.routing);
    const routingDescriptions: Record<string, { description?: string }> = {};
    for (const [d, entry] of Object.entries(profile.routing)) {
      if (entry.description) routingDescriptions[d] = { description: entry.description };
    }
    const priorAttempts = errorLog ? extractPriorAttempts(errorLog) : [];
    const t0 = Date.now();
    const result = await askLlmRouter(
      triageLlm, errorTrace, domains, topMatches, slug, appRoot,
      routingDescriptions, baseline ?? null, priorAttempts, failingNodeKey,
      priorDebugRecommendation,
      filteredStructuredFailure,
    );
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

// ---------------------------------------------------------------------------
// Orchestrator-contract errors — deterministic L0 short-circuit
// ---------------------------------------------------------------------------

/**
 * Detect error signatures emitted by the orchestrator's own input /
 * output materialization middleware (see
 * `handlers/middlewares/materialize-inputs.ts` and
 * `loop/dispatch/item-dispatch.ts`).
 *
 * These signatures indicate a *consumer-side contract-layer* fault — a
 * node declared it `consumes` an artifact that does not exist in the
 * ledger at dispatch time. The root cause is never the producing agent's
 * output quality — it is either:
 *   - a bug in the kernel ↔ state-store artifact ledger sync,
 *   - an APM-compiled workflow that wires a consumer to a producer that
 *     doesn't actually flow that kind, or
 *   - a missing / misdeclared `consumes_artifacts` on a downstream node.
 *
 * Routing these through RAG / LLM triage is demonstrably harmful: the LLM
 * sees an "acceptance input missing" error and confidently blames
 * `spec-compiler`, when in fact spec-compiler did everything right and the
 * bytes are sitting on disk. This helper lets the triage handler
 * short-circuit to graceful degradation with an accurate diagnosis so an
 * operator (not an agent) fixes the contract / ledger bug.
 *
 * NOTE: Producer-side faults (`missing_required_output:<kind>`,
 * `invalid_envelope_output:<kind>`) are intentionally NOT classified here.
 * Those are genuine output-quality failures — the producer node declared
 * it would emit X and either emitted nothing or emitted with a malformed
 * envelope. They are routed via the workflow's `schema-violation` route
 * (typically `$SELF` for bounded self-repair) by L0 patterns in
 * `triage/builtin-patterns.ts`.
 *
 * Returns `null` when the signature is not orchestrator-contract origin.
 */
export function classifyOrchestratorContractError(
  errorSignature: string | undefined | null,
): { readonly kind: "missing-input"; readonly artifact: string } | null {
  if (!errorSignature) return null;
  const inMatch = /^missing_required_input:(.+)$/.exec(errorSignature);
  if (inMatch) return { kind: "missing-input", artifact: inMatch[1] };
  return null;
}
