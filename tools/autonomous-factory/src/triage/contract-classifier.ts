/**
 * triage/contract-classifier.ts — Deterministic pre-classifier for structured
 * failure payloads.
 *
 * When the failing handler produced a parsed `StructuredFailure` (e.g. from
 * the Playwright JSON reporter via `local-exec`), this classifier inspects
 * the parsed shape and — for unambiguous signals — returns a fixed domain
 * verdict BEFORE the RAG/LLM layers run.
 *
 * Rationale: rule-based classification on structured evidence is faster,
 * cheaper, and more reliable than ANSI-log substring matching or a paid
 * LLM call. We still fall through to RAG/LLM when the structured payload
 * doesn't carry a clear signal.
 *
 * Current rules:
 *   - Any `uncaughtErrors[]` → `browser-runtime-error`
 *     (a user-facing JS crash is always an impl defect; it is NEVER a
 *     test-code bug, and re-running the tests cannot fix it).
 *
 * Future rules: network-request failures → `api-integration-error`,
 * visual-regression diffs → `ui-regression`, etc.
 */

import type { TriageResult } from "../types.js";
import type { StructuredFailure } from "./playwright-report.js";

/** Domain returned when an uncaught JS error is present in a browser context. */
export const BROWSER_RUNTIME_ERROR_DOMAIN = "browser-runtime-error";

/** Runtime shape guard — keeps the triage handler decoupled from the
 *  concrete StructuredFailure type at the layer boundary. */
function isPlaywrightReport(v: unknown): v is StructuredFailure {
  return !!v
    && typeof v === "object"
    && (v as { kind?: unknown }).kind === "playwright-json";
}

/**
 * Inspect a structured failure payload and return a deterministic
 * classification, or `null` when no rule matches (fall through to RAG/LLM).
 *
 * The caller (triage handler) is responsible for verifying that the
 * returned domain exists in the failing node's `failureRoutes` map before
 * acting — when the route is missing, the classifier's verdict is
 * discarded and evaluation continues normally.
 */
export function classifyStructuredFailure(payload: unknown): TriageResult | null {
  if (!isPlaywrightReport(payload)) return null;

  if (payload.uncaughtErrors.length > 0) {
    const firstErr = payload.uncaughtErrors[0];
    return {
      domain: BROWSER_RUNTIME_ERROR_DOMAIN,
      reason: `Uncaught browser exception in "${firstErr.inTest}": ${firstErr.message.slice(0, 200)}`,
      source: "rag",
      rag_matches: [],
    };
  }

  return null;
}
