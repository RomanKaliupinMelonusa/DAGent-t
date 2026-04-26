/**
 * lifecycle/fixture-validator.ts — Deterministic post-spec-compiler
 * validation gate for `acceptance.yml` test fixtures.
 *
 * Stack-agnostic: operates only on the `test_fixtures[]` schema and the
 * pre-feature `BaselineProfile`. PWA-Kit-specific concerns (URL locale
 * stripping, `config/sites.js` cross-reference) live in the spec-compiler
 * agent's instruction fragment, not here.
 *
 * Two classes of assertion:
 *   - **Deterministic** (e.g. `http_status`) — checked here against the
 *     baseline alone. Violations fail the spec-compiler invocation with a
 *     `[fixture-validation]`-tagged message that the L0 triage classifier
 *     routes to the new `fixture-validation-failure` domain.
 *   - **Runtime** (e.g. `first_tile_swatch_count`, `in_stock`,
 *     `product_type`) — only the `kind` is enforced here; live evidence
 *     is checked by `e2e-runner` / `qa-adversary`.
 *
 * Pure module: no I/O, no logging. Tests live at
 * `__tests__/fixture-validator.test.ts`.
 */

import type {
  AcceptanceContract,
  TestFixture,
  FixtureAssert,
} from "../apm/acceptance-schema.js";
import type { BaselineProfile, BaselineEntry } from "../ports/baseline-loader.js";

// ---------------------------------------------------------------------------
// Assertion kind catalogue — closed allow-list owned by the engine.
// ---------------------------------------------------------------------------

/** Asserts the validator can evaluate against the baseline alone. */
export const DETERMINISTIC_ASSERT_KINDS = ["http_status"] as const;

/** Asserts whose evidence must come from a live browser run. The
 *  validator only checks that the `kind` is recognised. */
export const RUNTIME_ASSERT_KINDS = [
  "first_tile_swatch_count",
  "in_stock",
  "product_type",
  "tile_count_min",
  "has_variations",
] as const;

/** All recognised assertion kinds. The validator rejects any fixture
 *  assertion whose `kind` is not in this list. */
export const KNOWN_ASSERT_KINDS: readonly string[] = [
  ...DETERMINISTIC_ASSERT_KINDS,
  ...RUNTIME_ASSERT_KINDS,
];

function isRuntimeKind(kind: string): boolean {
  return (RUNTIME_ASSERT_KINDS as readonly string[]).includes(kind);
}

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

export type FixtureViolationKind =
  | "url-failure-in-baseline"
  | "bad-assert-kind"
  | "http-status-violated";

export interface FixtureViolation {
  readonly fixtureId: string;
  readonly kind: FixtureViolationKind;
  readonly message: string;
  /** When applicable, the offending assert index inside the fixture. */
  readonly assertIndex?: number;
  /** When applicable, the baseline pattern that matched. */
  readonly baselineEvidence?: string;
}

export type FixtureValidationResult =
  | { readonly ok: true; readonly runtimeAsserts: ReadonlyArray<{ fixtureId: string; assertIndex: number; kind: string }> }
  | { readonly ok: false; readonly violations: ReadonlyArray<FixtureViolation> };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Substring-match a fixture URL against any baseline network failure
 *  whose `pattern` indicates a 4xx/5xx response. Returns the matching
 *  entry's pattern when found. Conservative: when a network failure
 *  entry's pattern doesn't carry a status code we still match if it
 *  contains the URL — that's an explicit "this URL is broken in the
 *  baseline" signal. */
function findFailingNetworkEntry(
  url: string,
  baseline: BaselineProfile,
): BaselineEntry | undefined {
  const failures = baseline.network_failures ?? [];
  for (const entry of failures) {
    if (!entry.pattern.includes(url)) continue;
    return entry;
  }
  return undefined;
}

/** Match a URL against persistent console errors that mention it. Mirrors
 *  the spirit of the triage baseline-filter: a persistent console error
 *  containing the URL is enough evidence to declare the fixture broken
 *  before runtime. */
function findPersistentConsoleEntry(
  url: string,
  baseline: BaselineProfile,
): BaselineEntry | undefined {
  const errors = baseline.console_errors ?? [];
  for (const entry of errors) {
    if (entry.volatility !== "persistent") continue;
    if (entry.pattern.includes(url)) return entry;
  }
  return undefined;
}

/** Did the baseline observe a successful (non-failure) probe of this URL?
 *  Used by the deterministic `http_status: 200` check — we treat absence
 *  of a network-failure entry as "fine" but a positive target hit lets
 *  us emit a stronger "URL went 4xx/5xx in baseline" violation when one
 *  is present. */
function urlHasBaselineFailure(url: string, baseline: BaselineProfile): BaselineEntry | undefined {
  return findFailingNetworkEntry(url, baseline) ?? findPersistentConsoleEntry(url, baseline);
}

function compareNumeric(
  comparator: FixtureAssert["comparator"],
  expected: number,
  actual: number,
): boolean {
  switch (comparator ?? "eq") {
    case "eq": return actual === expected;
    case "gte": return actual >= expected;
    case "lte": return actual <= expected;
    case "matches": return false; // not meaningful for numbers
  }
}

// ---------------------------------------------------------------------------
// Per-fixture validation
// ---------------------------------------------------------------------------

function validateFixture(
  fixture: TestFixture,
  baseline: BaselineProfile | null,
): { violations: FixtureViolation[]; runtime: Array<{ fixtureId: string; assertIndex: number; kind: string }> } {
  const violations: FixtureViolation[] = [];
  const runtime: Array<{ fixtureId: string; assertIndex: number; kind: string }> = [];

  // ── URL-vs-baseline check ───────────────────────────────────────────
  // When a baseline is available, a fixture URL must NOT appear in a
  // network failure or persistent console error. This is the core fix
  // for the product-quick-view-plp incident: spec-compiler emitted
  // `/uk/en-GB/category/...` which baseline already showed as 404, but
  // the contract was accepted and propagated to e2e-author verbatim.
  if (baseline) {
    const evidence = urlHasBaselineFailure(fixture.url, baseline);
    if (evidence) {
      violations.push({
        fixtureId: fixture.id,
        kind: "url-failure-in-baseline",
        message:
          `Fixture "${fixture.id}" URL "${fixture.url}" appears in the kickoff baseline ` +
          `as a failure: ${evidence.pattern}. Pick a routable URL — check ` +
          `config/default.js for url.locale / url.site stripping rules.`,
        baselineEvidence: evidence.pattern,
      });
    }
  }

  // ── Per-assert checks ───────────────────────────────────────────────
  for (let i = 0; i < fixture.asserts.length; i++) {
    const a = fixture.asserts[i]!;
    if (!KNOWN_ASSERT_KINDS.includes(a.kind)) {
      violations.push({
        fixtureId: fixture.id,
        kind: "bad-assert-kind",
        message:
          `Fixture "${fixture.id}" assert[${i}] has unknown kind "${a.kind}". ` +
          `Allowed kinds: ${KNOWN_ASSERT_KINDS.join(", ")}.`,
        assertIndex: i,
      });
      continue;
    }
    if (isRuntimeKind(a.kind)) {
      runtime.push({ fixtureId: fixture.id, assertIndex: i, kind: a.kind });
      continue;
    }
    // Deterministic kinds — currently `http_status` only.
    if (a.kind === "http_status") {
      if (typeof a.value !== "number") {
        violations.push({
          fixtureId: fixture.id,
          kind: "bad-assert-kind",
          message:
            `Fixture "${fixture.id}" assert[${i}] kind=http_status requires numeric value, got ${typeof a.value}.`,
          assertIndex: i,
        });
        continue;
      }
      // Successful status expected (2xx/3xx) but baseline shows the URL is broken.
      const expectedOk = compareNumeric(a.comparator, a.value, 200) || a.value < 400;
      if (expectedOk && baseline) {
        const evidence = urlHasBaselineFailure(fixture.url, baseline);
        if (evidence) {
          violations.push({
            fixtureId: fixture.id,
            kind: "http-status-violated",
            message:
              `Fixture "${fixture.id}" asserts http_status ${a.comparator ?? "eq"} ${a.value} ` +
              `but the kickoff baseline records a failure at "${fixture.url}": ${evidence.pattern}.`,
            assertIndex: i,
            baselineEvidence: evidence.pattern,
          });
        }
      }
    }
  }

  return { violations, runtime };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate every fixture on a freshly-compiled acceptance contract
 * against the kickoff baseline. Pure — no I/O.
 *
 * Returns `{ ok: true, runtimeAsserts }` when nothing is wrong; the
 * caller (middleware) discards `runtimeAsserts` for now — they are
 * surfaced for future consumers (`e2e-runner` evidence linking).
 *
 * Returns `{ ok: false, violations }` when at least one fixture is
 * misconfigured. Callers format the violations into a single
 * `[fixture-validation]`-tagged error message so the L0 triage
 * classifier picks them up.
 *
 * `baseline` may be `null` — when absent, the URL-vs-baseline and
 * `http_status` checks are skipped, but bad-assert-kind violations are
 * still reported.
 */
export function validateFixtures(
  contract: AcceptanceContract,
  baseline: BaselineProfile | null,
): FixtureValidationResult {
  const allViolations: FixtureViolation[] = [];
  const allRuntime: Array<{ fixtureId: string; assertIndex: number; kind: string }> = [];

  for (const fixture of contract.test_fixtures) {
    const { violations, runtime } = validateFixture(fixture, baseline);
    allViolations.push(...violations);
    allRuntime.push(...runtime);
  }

  if (allViolations.length > 0) {
    return { ok: false, violations: allViolations };
  }
  return { ok: true, runtimeAsserts: allRuntime };
}

/**
 * Format violations into a single error message tagged
 * `[fixture-validation]` so the L0 triage classifier in
 * `triage/builtin-patterns.ts` routes it to `fixture-validation-failure`.
 *
 * Pure — exported for tests and for the middleware that owns wiring.
 */
export function formatViolationsError(
  violations: ReadonlyArray<FixtureViolation>,
): string {
  const lines = [
    `[fixture-validation] ${violations.length} fixture violation(s) detected:`,
    ...violations.map((v, i) => `  ${i + 1}. [${v.kind}] ${v.message}`),
    "",
    "Repair the offending fixtures (pick a different URL / product / locale) and re-emit acceptance.yml.",
  ];
  return lines.join("\n");
}
