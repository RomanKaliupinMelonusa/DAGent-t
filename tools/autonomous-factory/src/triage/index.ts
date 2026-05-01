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
import type { CompiledTriageProfile } from "../apm/index.js";
import type { PipelineLogger } from "../telemetry/index.js";
import type { BaselineProfile } from "../ports/baseline-loader.js";
import { askLlmRouter } from "./llm-router.js";
import { extractPriorAttempts } from "./historian.js";

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
  // LLM-only single-call classifier. RAG and custom-classifier paths
  // were retired in Phase 4.3 — the storefront triage profile uses
  // `classifier: llm-only` and there is exactly one profile.
  if (!triageLlm || !slug || !appRoot) {
    return {
      domain: "$SELF",
      reason: "LLM unavailable — bounded self-retry",
      source: "fallback",
      rag_matches: [],
    };
  }

  const domains = Object.keys(profile.routing);
  const routingDescriptions: Record<string, { description?: string }> = {};
  for (const [d, entry] of Object.entries(profile.routing)) {
    if (entry.description) routingDescriptions[d] = { description: entry.description };
  }
  const priorAttempts = errorLog ? extractPriorAttempts(errorLog) : [];
  const t0 = Date.now();
  const result = await askLlmRouter(
    triageLlm, errorTrace, domains, [], slug, appRoot,
    routingDescriptions, baseline ?? null, priorAttempts, failingNodeKey,
    priorDebugRecommendation,
    filteredStructuredFailure,
  );
  const llmResponseMs = Date.now() - t0;
  return {
    domain: result.fault_domain,
    reason: result.reason,
    source: "llm",
    rag_matches: [],
    llm_response_ms: llmResponseMs,
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
 * the LLM router (Phase 4.3a).
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
