/**
 * apm/acceptance-schema.ts — Machine-checkable acceptance contract for a feature.
 *
 * Produced by the `spec-compiler` agent at feature-init from the
 * human-readable `_SPEC.md`, and written to
 * `<appRoot>/.dagent/<slug>_ACCEPTANCE.yml`.
 *
 * Consumed by:
 *   - The dev agent — injected into the prompt alongside the spec.
 *   - `e2e-author` (Phase A.4) — the blind SDET reads this in place of impl.
 *   - `validate-acceptance.mjs` (Phase B.1) — runs a Playwright smoke
 *     materialized from the required DOM + flows.
 *   - `qa-adversary` (Phase B.2) — adversarial probes.
 *   - `docs-archived` (Phase D.3) — summary discipline.
 *
 * The schema is intentionally minimal. Every field maps to something a
 * browser can check or a reviewer can scan. Anything that requires LLM
 * judgement to verify is deliberately excluded.
 */

import { z } from "zod";

/**
 * Cardinality hint for `required_dom` entries.
 *
 * - `one` (default): the testid is expected to resolve to exactly one
 *   element. The oracle uses strict-mode `getByTestId(X)` which fails
 *   loudly if the page renders zero or multiple matches.
 * - `many`: the testid is rendered once per item in a repeating list
 *   (e.g. list rows, search hits, card grids). The oracle asserts the
 *   first instance is visible via `.first()` and skips the exact-text
 *   check; `contains_text` substring assertions still apply to that
 *   first instance.
 */
export const CardinalitySchema = z.enum(["one", "many"]);

/**
 * Locator qualifier on action steps (`click`/`fill`/`assert_visible`/
 * `assert_text`). Defaults to `only` (strict-mode match). Use `first`
 * or `nth` to disambiguate when the testid has `cardinality: many`.
 */
export const MatchModeSchema = z.enum(["only", "first", "nth"]);

/** One concrete DOM element the feature must expose to users. */
export const RequiredDomSchema = z.object({
  /** `data-testid` value (preferred) or CSS selector prefixed with `css:`. */
  testid: z.string().min(1),
  /** Human-friendly name — used in failure messages and report summaries. */
  description: z.string().min(1),
  /** When true, the element must contain non-empty text content to pass.
   *  Guards against empty/loading placeholders masquerading as a pass. */
  requires_non_empty_text: z.boolean().default(false),
  /** Optional: a substring the element's text must contain (case-insensitive). */
  contains_text: z.string().optional(),
  /** Cardinality hint — see {@link CardinalitySchema}. Defaults to `one`. */
  cardinality: CardinalitySchema.default("one"),
});

/**
 * Shared locator qualifier fields for action steps. `nth` must be present
 * when and only when `match === "nth"`. Zero-based index.
 */
const LocatorQualifier = {
  match: MatchModeSchema.default("only"),
  nth: z.number().int().nonnegative().optional(),
} as const;

/** Refine: `match: nth` requires `nth`; other modes forbid it. */
function refineLocatorQualifier<T extends { match: "only" | "first" | "nth"; nth?: number }>(
  step: T,
  ctx: z.RefinementCtx,
): void {
  if (step.match === "nth" && step.nth === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nth"],
      message: "`nth` is required when `match: nth`",
    });
  }
  if (step.match !== "nth" && step.nth !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["nth"],
      message: "`nth` is only valid when `match: nth`",
    });
  }
}

/** One scripted user journey the feature must support. */
export const FlowStepSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("goto"), url: z.string() }),
  z.object({ action: z.literal("click"), testid: z.string(), ...LocatorQualifier }).superRefine(refineLocatorQualifier),
  z.object({ action: z.literal("fill"), testid: z.string(), value: z.string(), ...LocatorQualifier }).superRefine(refineLocatorQualifier),
  z.object({ action: z.literal("assert_visible"), testid: z.string(), timeout_ms: z.number().int().positive().optional(), ...LocatorQualifier }).superRefine(refineLocatorQualifier),
  z.object({ action: z.literal("assert_text"), testid: z.string(), contains: z.string(), ...LocatorQualifier }).superRefine(refineLocatorQualifier),
]);

export const RequiredFlowSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  steps: z.array(FlowStepSchema).min(1),
  /** Optional reference to a `test_fixtures[].id`. When set, e2e-author
   *  reads the fixture's URL / asserts from the contract instead of
   *  inlining them in the spec file. The root-level superRefine on
   *  `AcceptanceContractSchema` enforces that the id resolves to a
   *  declared fixture. */
  fixture: z.string().min(1).optional(),
});

/** Allowed comparators on a fixture assertion. `eq` is the default
 *  semantic when omitted. */
export const FixtureAssertComparatorSchema = z.enum(["eq", "gte", "lte", "matches"]);

/**
 * One declarative assertion on a test fixture. Two classes:
 *
 * - **Deterministic** (e.g. `http_status`) — the fixture validator can
 *   evaluate these against the kickoff baseline alone.
 * - **Runtime** (e.g. `first_tile_swatch_count`, `in_stock`) — require
 *   live browser evidence and are checked by `e2e-runner` /
 *   `qa-adversary`. The validator only enforces that the `kind` is
 *   in the catalogue.
 *
 * The catalogue lives in `lifecycle/fixture-validator.ts`
 * (`KNOWN_ASSERT_KINDS`) and is owned by the autonomous-factory engine.
 * Stack-specific kinds are added there, not here.
 */
export const FixtureAssertSchema = z.object({
  kind: z.string().min(1),
  value: z.unknown(),
  comparator: FixtureAssertComparatorSchema.optional(),
});

/**
 * One named test fixture — a resolved URL plus the runtime preconditions
 * it must satisfy for the flows that reference it. Spec-compiler emits
 * these once, after resolving the URL against the running config
 * (`url.locale`, `url.site`) and cross-referencing the kickoff baseline.
 * Downstream agents (`e2e-author`, `e2e-runner`, `qa-adversary`) consume
 * fixtures by id; they MUST NOT re-resolve URLs themselves.
 */
export const TestFixtureSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  base_sha: z.string().min(1),
  asserted_at: z.string().datetime({ offset: true }),
  asserts: z.array(FixtureAssertSchema).default([]),
});

export const AcceptanceContractSchema = z.object({
  /** Feature slug — must match the pipeline `<slug>`. Prevents copy-paste errors. */
  feature: z.string().min(1),
  /** Human-readable summary — one or two sentences, shown to reviewers. */
  summary: z.string().min(1),
  /** Every element on this list must be reachable at runtime. */
  required_dom: z.array(RequiredDomSchema).default([]),
  /** Every flow must pass end-to-end in `validate-acceptance.mjs`. */
  required_flows: z.array(RequiredFlowSchema).default([]),
  /** Regular expressions that MUST NOT match any browser console.error
   *  captured during `validate-acceptance.mjs`. Defaults to the built-in
   *  allowlist if omitted. */
  forbidden_console_patterns: z.array(z.string()).default([
    // TypeError / ReferenceError are almost never legitimate in prod.
    "Uncaught\\s+(TypeError|ReferenceError|RangeError|SyntaxError)",
    "Cannot read propert(y|ies) of (undefined|null)",
  ]),
  /** Regular expressions for URLs whose network failure would be a feature
   *  defect (e.g. an API detail endpoint). Expressed as `METHOD URL_REGEX`. */
  forbidden_network_failures: z.array(z.string()).default([]),
  /** Base-template symbols the dev agent MUST audit for reuse before
   *  introducing a wrapper. Not enforced at runtime — this list becomes
   *  context for the dev prompt and a review checklist. */
  base_template_reuse: z.array(z.object({
    symbol: z.string().min(1),
    package: z.string().min(1),
    rationale: z.string().min(1),
  })).default([]),
  /** Resolved test fixtures referenced by `required_flows[].fixture`.
   *  Spec-compiler emits these after resolving URLs against the running
   *  config and cross-referencing the kickoff baseline. Optional for
   *  back-compat with pre-fixture acceptance contracts. */
  test_fixtures: z.array(TestFixtureSchema).default([]),
}).superRefine((c, ctx) => {
  // Reject duplicate fixture ids — id is the lookup key, must be unique.
  const seen = new Set<string>();
  for (let i = 0; i < c.test_fixtures.length; i++) {
    const id = c.test_fixtures[i]!.id;
    if (seen.has(id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["test_fixtures", i, "id"],
        message: `duplicate fixture id "${id}"`,
      });
    }
    seen.add(id);
  }
  // Every `required_flows[].fixture` must reference a declared fixture id.
  for (let i = 0; i < c.required_flows.length; i++) {
    const ref = c.required_flows[i]!.fixture;
    if (ref !== undefined && !seen.has(ref)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["required_flows", i, "fixture"],
        message: `fixture id "${ref}" not declared in test_fixtures[]`,
      });
    }
  }
});

export type AcceptanceContract = z.infer<typeof AcceptanceContractSchema>;
export type RequiredDom = z.infer<typeof RequiredDomSchema>;
export type RequiredFlow = z.infer<typeof RequiredFlowSchema>;
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type TestFixture = z.infer<typeof TestFixtureSchema>;
export type FixtureAssert = z.infer<typeof FixtureAssertSchema>;
export type FixtureAssertComparator = z.infer<typeof FixtureAssertComparatorSchema>;

// ---------------------------------------------------------------------------
// Loader — parse + validate from disk.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import { createHash } from "node:crypto";
import yaml from "js-yaml";

export class AcceptanceParseError extends Error {
  constructor(message: string, public readonly path: string) {
    super(`[acceptance:${path}] ${message}`);
    this.name = "AcceptanceParseError";
  }
}

/**
 * Load and validate an ACCEPTANCE.yml from disk. Throws
 * `AcceptanceParseError` with a file-tagged message on any problem —
 * callers that want to tolerate missing contracts should catch and inspect.
 */
export function loadAcceptanceContract(absPath: string): AcceptanceContract {
  let raw: string;
  try {
    raw = fs.readFileSync(absPath, "utf-8");
  } catch (err) {
    throw new AcceptanceParseError(
      `file not readable: ${(err as Error).message}`,
      absPath,
    );
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new AcceptanceParseError(
      `YAML parse error: ${(err as Error).message}`,
      absPath,
    );
  }
  const result = AcceptanceContractSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    throw new AcceptanceParseError(`schema violation: ${issues}`, absPath);
  }
  return result.data;
}

/**
 * Deterministic fingerprint of an acceptance contract — used by the
 * acceptance-immutable middleware (Phase A.2) to detect mid-cycle edits.
 *
 * The hash is computed over the normalized JSON form of the parsed
 * contract, NOT the raw YAML, so whitespace/comment changes don't
 * invalidate it.
 */
export function hashAcceptanceContract(contract: AcceptanceContract): string {
  // Stable stringify — sort keys recursively.
  const stable = JSON.stringify(contract, Object.keys(contract).sort());
  return createHash("sha256").update(stable).digest("hex");
}
