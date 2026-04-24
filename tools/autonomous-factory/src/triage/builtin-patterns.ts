/**
 * triage/builtin-patterns.ts — Bundled L0 pre-classifier rules.
 *
 * Session B (Item 3) — the three deterministic rules that previously
 * lived as hard-coded code in `contract-classifier.ts` now ship here as
 * declarative patterns. The APM compiler prepends them to every triage
 * profile unless the profile opts out with `builtin_patterns: false`.
 *
 * Each rule's `domain` is a suggested tag. A profile's routing map is
 * still the source of truth — if the profile does not route the
 * emitted domain, the verdict is discarded and evaluation falls through
 * to RAG/LLM exactly as before.
 */

import type { TriagePattern } from "../apm/types.js";

export const BUILTIN_TRIAGE_PATTERNS: readonly TriagePattern[] = [
  // Uncaught browser exception — always an impl defect; re-running the
  // tests cannot fix it.
  {
    match_kind: "structured-field",
    format: "playwright-json",
    when: "uncaughtErrors.nonEmpty",
    domain: "browser-runtime-error",
    reason_template:
      'Uncaught browser exception in "${inTest}": ${errFirstLine}',
  },
  // Playwright timeout on a contract-declared testid — the acceptance
  // contract named that testid as something the user must see; if it
  // never rendered, the feature impl is the defect (not SSR, not infra).
  {
    match_kind: "structured-field",
    format: "playwright-json",
    when: "failedTest.timeout-on-contract-testid",
    domain: "frontend",
    reason_template:
      "Contract locator '${testid}' declared in ACCEPTANCE.yml never rendered — " +
      "this is a frontend implementation defect, not a test/SSR/infra issue. " +
      'Failing test: "${inTest}".',
  },
  // Canonical spec-compiler schema-violation messages produced by the
  // acceptance-integrity middleware. Routed back to spec-compiler via
  // the node's on_failure.routes[schema-violation] = spec-compiler.
  {
    match_kind: "raw-regex",
    pattern:
      "(produced an invalid acceptance contract at |reported success but did not produce .*acceptance\\.yml|\\[acceptance:[^\\]]+\\]\\s*(schema violation|YAML parse error|file not readable))",
    domain: "schema-violation",
    reason_template:
      "spec-compiler produced an invalid ACCEPTANCE contract. " +
      "Repair the schema violation and re-emit: ${errFirstLine}",
  },
];
