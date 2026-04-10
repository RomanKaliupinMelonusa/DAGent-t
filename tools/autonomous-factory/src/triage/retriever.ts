/**
 * triage/retriever.ts — Local substring matcher for the triage knowledge base.
 *
 * Blazing-fast, zero-dependency retriever that matches error traces against
 * pre-compiled triage signatures. Cost: $0. Latency: <1ms.
 *
 * The incoming trace is normalized via `normalizeDiagnosticTrace()` to strip
 * dynamic entropy (timestamps, SHAs, runner IDs) before substring matching.
 */

import { normalizeDiagnosticTrace } from "../session/shared.js";
import type { TriageSignature } from "../apm-types.js";

/**
 * Match a raw error trace against the triage knowledge base.
 *
 * Returns the top 3 matching signatures, ranked by longest `error_snippet`
 * (more specific = more confident). Pure synchronous function.
 */
export function retrieveTopMatches(
  trace: string,
  kb: TriageSignature[],
): TriageSignature[] {
  if (!trace || kb.length === 0) return [];

  const normalized = normalizeDiagnosticTrace(trace).toLowerCase();

  const hits = kb.filter((sig) =>
    normalized.includes(sig.error_snippet.toLowerCase()),
  );

  // Rank by specificity: longest error_snippet first
  hits.sort((a, b) => b.error_snippet.length - a.error_snippet.length);

  return hits.slice(0, 3);
}
