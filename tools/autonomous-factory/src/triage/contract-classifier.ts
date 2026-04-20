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
 *   - [Round-2 R2] A Playwright timeout on a `getByTestId('<id>')` where
 *     `<id>` is declared in the feature's ACCEPTANCE.yml required_dom →
 *     `frontend`. The contract literally named that testid as something
 *     the user must be able to see; if it never rendered, the feature
 *     implementation is the defect — not the DOM plumbing, not SSR, not
 *     the dev server. Prevents the Round-2 misroute where four identical
 *     click-handler regressions were classified as `ssr-hydration` by
 *     the LLM router and never reached the component owner.
 *
 * Future rules: network-request failures → `api-integration-error`,
 * visual-regression diffs → `ui-regression`, etc.
 */

import type { TriageResult } from "../types.js";
import type { StructuredFailure } from "./playwright-report.js";
import type { AcceptanceContract } from "../apm/acceptance-schema.js";

/** Domain returned when an uncaught JS error is present in a browser context. */
export const BROWSER_RUNTIME_ERROR_DOMAIN = "browser-runtime-error";

/** Domain returned when a contract-declared testid failed to render. */
export const CONTRACT_LOCATOR_MISSING_DOMAIN = "frontend";

/** Domain returned when `spec-compiler` produced an invalid acceptance
 *  contract (YAML parse error, schema violation, missing file). Intended
 *  to route back to `spec-compiler` itself for a repair attempt. */
export const SPEC_SCHEMA_VIOLATION_DOMAIN = "schema-violation";

/** Optional extras the triage handler may pass to refine classification. */
export interface ContractClassifierOptions {
  readonly acceptance?: AcceptanceContract | null;
}

/** Runtime shape guard — keeps the triage handler decoupled from the
 *  concrete StructuredFailure type at the layer boundary. */
function isPlaywrightReport(v: unknown): v is StructuredFailure {
  return !!v
    && typeof v === "object"
    && (v as { kind?: unknown }).kind === "playwright-json";
}

/** Extract the first testid referenced in a Playwright error blob.
 *
 *  Matches the forms Playwright actually prints:
 *    - `getByTestId('quick-view-btn')`
 *    - `getByTestId("quick-view-btn")`
 *    - `locator('[data-testid="quick-view-btn"]')`
 *
 *  Returns the first match only — the classifier needs one unambiguous
 *  testid to cross-reference against the contract, not a bag of them.
 */
const GET_BY_TESTID_RE = /getByTestId\(\s*['"]([^'"]+)['"]\s*\)/;
const DATA_TESTID_SEL_RE = /\[data-testid=['"]([^'"]+)['"]\]/;

function extractTestid(errorBlob: string): string | null {
  const m1 = GET_BY_TESTID_RE.exec(errorBlob);
  if (m1) return m1[1];
  const m2 = DATA_TESTID_SEL_RE.exec(errorBlob);
  if (m2) return m2[1];
  return null;
}

/** Heuristic: "did Playwright time out waiting for this locator?"
 *  Playwright formats its timeout errors with a `TimeoutError:` prefix
 *  (and `locator.waitFor`, `expect.*.toBeVisible`, etc. all reduce to
 *  that prefix). We match the prefix rather than the specific call so
 *  future Playwright versions keep working. */
const TIMEOUT_RE = /\b(TimeoutError\b|Timeout\s+\d+ms\s+exceeded|waiting for .*(getByTestId|locator))/i;

/**
 * Inspect a structured failure payload and return a deterministic
 * classification, or `null` when no rule matches (fall through to RAG/LLM).
 *
 * The caller (triage handler) is responsible for verifying that the
 * returned domain exists in the failing node's `failureRoutes` map before
 * acting — when the route is missing, the classifier's verdict is
 * discarded and evaluation continues normally.
 */
export function classifyStructuredFailure(
  payload: unknown,
  opts: ContractClassifierOptions = {},
): TriageResult | null {
  if (!isPlaywrightReport(payload)) return null;

  if (payload.uncaughtErrors.length > 0) {
    const firstErr = payload.uncaughtErrors[0];
    return {
      domain: BROWSER_RUNTIME_ERROR_DOMAIN,
      reason: `Uncaught browser exception in "${firstErr.inTest}": ${firstErr.message.slice(0, 200)}`,
      source: "contract",
      rag_matches: [],
    };
  }

  // Round-2 R2 — contract-locator timeout.
  const acceptance = opts.acceptance ?? null;
  if (acceptance && payload.failedTests.length > 0) {
    const contractTestids = new Set(
      (acceptance.required_dom ?? [])
        .map((d) => d.testid)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    );
    if (contractTestids.size > 0) {
      for (const ft of payload.failedTests) {
        const blob = `${ft.error}\n${ft.stackHead}`;
        if (!TIMEOUT_RE.test(blob)) continue;
        const testid = extractTestid(blob);
        if (testid && contractTestids.has(testid)) {
          return {
            domain: CONTRACT_LOCATOR_MISSING_DOMAIN,
            reason:
              `Contract locator '${testid}' declared in ACCEPTANCE.yml never rendered — ` +
              `this is a frontend implementation defect, not a test/SSR/infra issue. ` +
              `Failing test: "${ft.title}".`,
            source: "contract",
            rag_matches: [],
          };
        }
      }
    }
  }

  return null;
}

/**
 * Round-2 follow-up — classify a raw error STRING (no StructuredFailure).
 *
 * Motivation: when `spec-compiler` emits an invalid ACCEPTANCE.yml, the
 * `acceptance-integrity` middleware fails the node with a canonical
 * message like:
 *   "spec-compiler produced an invalid acceptance contract at <path>:
 *    [acceptance:<path>] schema violation: required_flows.4.steps: …"
 * These messages are structurally stable (produced by our own code, not
 * by an LLM or an external tool) and carry enough detail for the agent
 * to self-repair on the next attempt. Routing them deterministically to
 * `schema-violation` — and, via `on_failure.routes`, back to
 * `spec-compiler` itself — replaces the current "one bad field ⇒ whole
 * feature salvages to Draft PR" behaviour with a bounded repair loop
 * (`halt_on_identical` stops the ping-pong if the agent can't fix it).
 *
 * Matches only these canonical shapes — narrow on purpose so that the
 * rule never fires on e2e-runner output that happens to mention `.yml`.
 */
const SPEC_ACCEPTANCE_ERROR_RE =
  /(produced an invalid acceptance contract at |reported success but did not produce .*_ACCEPTANCE\.yml|\[acceptance:[^\]]+\]\s*(schema violation|YAML parse error|file not readable))/;

export function classifyRawError(rawError: string): TriageResult | null {
  if (!rawError) return null;
  if (!SPEC_ACCEPTANCE_ERROR_RE.test(rawError)) return null;
  // Keep the reason short — the full error is already in the handoff
  // context via composeTriageContext + failureFallback.rawError.
  const firstLine = rawError.split(/\r?\n/, 1)[0] ?? rawError;
  return {
    domain: SPEC_SCHEMA_VIOLATION_DOMAIN,
    reason:
      `spec-compiler produced an invalid ACCEPTANCE contract. ` +
      `Repair the schema violation and re-emit: ${firstLine.slice(0, 240)}`,
    source: "contract",
    rag_matches: [],
  };
}
