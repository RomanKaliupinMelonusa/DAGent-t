/**
 * triage/contract-classifier.ts — Profile-driven L0 pre-classifier.
 *
 * Session B (Item 3) — the three hard-coded rules (uncaught browser
 * errors, contract-locator timeouts, spec-schema-violation raw-string
 * matches) are now expressed as declarative `TriagePattern` entries on
 * the compiled triage profile. The APM compiler prepends the bundled
 * built-in set (see `builtin-patterns.ts`) unless a profile opts out
 * with `builtin_patterns: false`.
 *
 * Evaluation order: structured-field patterns first (cheap structural
 * checks), raw-regex patterns second. First match wins; returns null
 * when no pattern applies and the triage handler falls through to
 * RAG/LLM.
 *
 * The triage handler still verifies that the emitted domain is routable
 * on the failing node's on_failure.routes before acting. Compile-time
 * domain-set validation makes typos impossible in the happy path; the
 * runtime check remains as a defensive belt.
 */

import type { TriageResult } from "../types.js";
import type { StructuredFailure } from "./playwright-report.js";
import type { AcceptanceContract } from "../apm/index.js";
import type { CompiledTriageProfile, TriagePattern } from "../apm/index.js";
import { evaluateJsonPathPredicate } from "./jsonpath-predicate.js";

export interface ProfilePatternContext {
  readonly structuredFailure?: unknown;
  readonly rawError?: string;
  readonly acceptance?: AcceptanceContract | null;
}

function isPlaywrightReport(v: unknown): v is StructuredFailure {
  return !!v
    && typeof v === "object"
    && (v as { kind?: unknown }).kind === "playwright-json";
}

const GET_BY_TESTID_RE = /getByTestId\(\s*['"]([^'"]+)['"]\s*\)/;
const DATA_TESTID_SEL_RE = /\[data-testid=['"]([^'"]+)['"]\]/;

function extractTestid(errorBlob: string): string | null {
  const m1 = GET_BY_TESTID_RE.exec(errorBlob);
  if (m1) return m1[1];
  const m2 = DATA_TESTID_SEL_RE.exec(errorBlob);
  if (m2) return m2[1];
  return null;
}

const TIMEOUT_RE = /\b(TimeoutError\b|Timeout\s+\d+ms\s+exceeded|waiting for .*(getByTestId|locator))/i;

function renderReason(tpl: string | undefined, ctx: Record<string, string>): string {
  if (!tpl) return "";
  return tpl.replace(/\$\{(\w+)\}/g, (_, key) => ctx[key] ?? "");
}

function evalStructuredField(
  pat: Extract<TriagePattern, { match_kind: "structured-field" }>,
  payload: StructuredFailure,
  acceptance: AcceptanceContract | null | undefined,
): TriageResult | null {
  switch (pat.when) {
    case "uncaughtErrors.nonEmpty": {
      if (payload.uncaughtErrors.length === 0) return null;
      const firstErr = payload.uncaughtErrors[0];
      const errFirstLine = firstErr.message.split(/\r?\n/, 1)[0] ?? firstErr.message;
      const reason = renderReason(pat.reason_template, {
        inTest: firstErr.inTest,
        errFirstLine: errFirstLine.slice(0, 200),
      });
      return {
        domain: pat.domain,
        reason: reason || `Uncaught browser exception in "${firstErr.inTest}"`,
        source: "contract",
        rag_matches: [],
      };
    }
    case "failedTest.timeout-on-contract-testid": {
      if (!acceptance || payload.failedTests.length === 0) return null;
      const contractTestids = new Set(
        (acceptance.required_dom ?? [])
          .map((d) => d.testid)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
      if (contractTestids.size === 0) return null;
      for (const ft of payload.failedTests) {
        const blob = `${ft.error}\n${ft.stackHead}`;
        if (!TIMEOUT_RE.test(blob)) continue;
        const testid = extractTestid(blob);
        if (testid && contractTestids.has(testid)) {
          const reason = renderReason(pat.reason_template, {
            testid,
            inTest: ft.title,
          });
          return {
            domain: pat.domain,
            reason: reason || `Contract locator '${testid}' failed to render in test "${ft.title}"`,
            source: "contract",
            rag_matches: [],
          };
        }
      }
      return null;
    }
    default: {
      return null;
    }
  }
}

function evalRawRegex(
  pat: Extract<TriagePattern, { match_kind: "raw-regex" }>,
  rawError: string,
): TriageResult | null {
  if (!rawError) return null;
  let re: RegExp;
  try {
    re = new RegExp(pat.pattern, pat.flags);
  } catch {
    return null;
  }
  if (!re.test(rawError)) return null;
  const errFirstLine = rawError.split(/\r?\n/, 1)[0] ?? rawError;
  const reason = renderReason(pat.reason_template, {
    errFirstLine: errFirstLine.slice(0, 240),
  });
  return {
    domain: pat.domain,
    reason: reason || `Matched pattern /${pat.pattern.slice(0, 60)}/`,
    source: "contract",
    rag_matches: [],
  };
}

/**
 * 🆁3 — `json-path` arm. Delegates selector/op/capture mechanics to the
 * minimal evaluator in `jsonpath-predicate.ts` and renders the reason
 * template from the captured values. Keeps the pre-computed
 * `errFirstLine` available as a fallback variable so profile authors
 * can reuse the same placeholder used by the other arms.
 */
function evalJsonPath(
  pat: Extract<TriagePattern, { match_kind: "json-path" }>,
  payload: StructuredFailure,
): TriageResult | null {
  const verdict = evaluateJsonPathPredicate(payload, pat);
  if (!verdict) return null;
  const reason = renderReason(pat.reason_template, verdict.captures);
  return {
    domain: pat.domain,
    reason: reason || `Matched json-path predicate at ${pat.path}`,
    source: "contract",
    rag_matches: [],
  };
}

/**
 * Run the compiled triage profile's L0 patterns against the failure
 * evidence. Returns the first match's verdict, or null when nothing
 * matched (caller continues with RAG/LLM).
 */
export function evaluateProfilePatterns(
  profile: CompiledTriageProfile,
  ctx: ProfilePatternContext,
): TriageResult | null {
  const patterns = profile.patterns ?? [];
  if (patterns.length === 0) return null;

  const payload = isPlaywrightReport(ctx.structuredFailure) ? ctx.structuredFailure : null;
  const rawError = ctx.rawError ?? "";

  for (const pat of patterns) {
    if (pat.match_kind === "structured-field") {
      // Sugar for the two bundled built-in checks (uncaught browser
      // errors, contract-testid timeouts). @deprecated — prefer
      // `match_kind: "json-path"` for new predicates (🆁3). The
      // built-ins keep working until a future cleanup.
      if (!payload) continue;
      const v = evalStructuredField(pat, payload, ctx.acceptance ?? null);
      if (v) return v;
    } else if (pat.match_kind === "raw-regex") {
      const v = evalRawRegex(pat, rawError);
      if (v) return v;
    } else if (pat.match_kind === "json-path") {
      if (!payload) continue;
      const v = evalJsonPath(pat, payload);
      if (v) return v;
    }
  }
  return null;
}
