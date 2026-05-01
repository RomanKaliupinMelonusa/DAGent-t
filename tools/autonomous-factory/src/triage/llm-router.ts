/**
 * triage/llm-router.ts — LLM-based fallback router for novel error classification.
 *
 * When the local retriever yields no matches, this module uses an injected
 * TriageLlm port to classify the error into a fault domain. The LLM is
 * constrained to output only valid fault domains declared in workflows.yml.
 *
 * Implements the Data Flywheel: novel LLM classifications are persisted to
 * `.dagent/<slug>_NOVEL_TRIAGE.jsonl` so humans can generalize them into
 * triage pack signatures.
 *
 * Vendor SDKs are NOT imported here — all LLM I/O flows through the
 * `TriageLlm` port (see `ports/triage-llm.ts`).
 */

import fs from "node:fs";
import type { TriageLlm } from "../ports/triage-llm.js";
import type { TriageSignature } from "../apm/index.js";
import type { BaselineProfile, BaselineEntry } from "../ports/baseline-loader.js";
import type { PriorAttempt } from "./historian.js";
import { parseDomainTag } from "./handoff-builder.js";
import { matchesAnyBaselinePattern } from "./baseline-filter.js";
import { normalizeError } from "./error-fingerprint.js";
import { featurePath, ensureFeatureDir } from "../paths/feature-paths.js";

// ---------------------------------------------------------------------------
// Internal classification outcome — used by `tryClassifyOnce` to distinguish
// transient/recoverable failure modes (no-json, hallucinated, transport error)
// from a successful parse so the resilient `askLlmRouter` can decide whether
// to retry, inherit from a prior cycle's verdict, or hard-fall-through to
// `blocked`.
// ---------------------------------------------------------------------------

type ClassifyOutcome =
  | { ok: true; fault_domain: string; reason: string }
  | {
      ok: false;
      kind: "no-json" | "hallucinated" | "error" | "baseline-only";
      detail: string;
    };

export interface LlmTriageResult {
  fault_domain: string;
  reason: string;
}

interface NovelTriageEntry {
  timestamp: string;
  fault_domain: string;
  reason: string;
  trace_excerpt: string;
}

const BASELINE_PATTERN_CAP = 30;
const PRIOR_ATTEMPT_CAP = 3;
const PATTERN_CHAR_CAP = 160;
const REASON_CHAR_CAP = 200;
/** Cap on the rendered baseline-notes block. Mirrors `MAX_NOTES_CHARS`
 *  in `baseline-advisory.ts` so the dispatch advisory and the triage
 *  prompt show the same notes envelope. */
const NOTES_CHAR_CAP = 600;

/** Markers emitted by the orchestrator when the failing trace contains
 *  no genuine evidence — the agent timed out, exhausted its tool budget,
 *  or was force-disconnected. Used by `isEvidenceEmpty` and surfaced via
 *  the regex export for tests. */
export const EVIDENCE_EMPTY_MARKERS: readonly RegExp[] = [
  /\[session-idle-timeout\]/,
  /\[tool-budget-exhausted\]/,
  /\[force-disconnect\]/,
  /\[hard-timeout\]/,
];

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/**
 * Pure check: does this failure carry zero classifiable evidence?
 *
 * Returns `true` when the rawError contains any agent-side wedge
 * marker (session-idle-timeout / tool-budget-exhausted /
 * force-disconnect / hard-timeout) AND `structuredFailure` is either
 * absent or a `playwright-json` shape with empty
 * `consoleErrors` / `failedRequests` / `uncaughtErrors` / `failedTests`.
 *
 * The triage handler short-circuits on this signal before calling the
 * LLM router — a wedged agent's previous-cycle verdict must NOT be
 * inherited as if it were domain evidence.
 *
 * Conservative when the structured payload is an unrecognised shape:
 * returns `false` (the LLM still gets a chance).
 */
export function isEvidenceEmpty(
  rawError: string | undefined | null,
  structuredFailure: unknown,
): boolean {
  if (!rawError) return false;
  const markerHit = EVIDENCE_EMPTY_MARKERS.some((re) => re.test(rawError));
  if (!markerHit) return false;
  if (structuredFailure === null || structuredFailure === undefined) return true;
  if (typeof structuredFailure !== "object") return false;
  const sf = structuredFailure as {
    kind?: unknown;
    consoleErrors?: unknown;
    failedRequests?: unknown;
    uncaughtErrors?: unknown;
    failedTests?: unknown;
  };
  if (sf.kind !== "playwright-json") return false;
  const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
  return (
    len(sf.consoleErrors) === 0 &&
    len(sf.failedRequests) === 0 &&
    len(sf.uncaughtErrors) === 0 &&
    len(sf.failedTests) === 0
  );
}

/**
 * Project the baseline-filtered structured failure to a count of
 * surviving signals. `null`/non-playwright shapes return 0 (caller
 * treats absence as "no signals").
 */
function countSurvivingSignals(structuredFailure: unknown): number {
  if (!structuredFailure || typeof structuredFailure !== "object") return 0;
  const sf = structuredFailure as {
    kind?: unknown;
    consoleErrors?: unknown;
    failedRequests?: unknown;
    uncaughtErrors?: unknown;
    failedTests?: unknown;
  };
  if (sf.kind !== "playwright-json") return 0;
  const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
  return (
    len(sf.consoleErrors) +
    len(sf.failedRequests) +
    len(sf.uncaughtErrors) +
    len(sf.failedTests)
  );
}

function renderBaselineSection(
  baseline: BaselineProfile | null,
  filteredStructuredFailure?: unknown,
): string {
  if (!baseline) return "";
  const ordered: Array<{ kind: string; entry: BaselineEntry }> = [];
  for (const e of baseline.console_errors ?? []) ordered.push({ kind: "console", entry: e });
  for (const e of baseline.network_failures ?? []) ordered.push({ kind: "network", entry: e });
  for (const e of baseline.uncaught_exceptions ?? []) ordered.push({ kind: "uncaught", entry: e });
  const notes = (baseline.notes ?? "").replace(/\s+/g, " ").trim();
  if (ordered.length === 0 && notes.length === 0) return "";

  const lines: string[] = [];
  if (ordered.length > 0) {
    const capped = ordered.slice(0, BASELINE_PATTERN_CAP);
    const persistent = capped.filter((c) => c.entry.volatility === "persistent");
    const transient = capped.filter((c) => c.entry.volatility !== "persistent");
    lines.push("Pre-existing baseline noise (captured BEFORE this feature began):");
    if (persistent.length > 0) {
      lines.push(
        "Permanent platform warnings — DO NOT investigate; do not modify component code to silence:",
      );
      for (const { kind, entry } of persistent) {
        lines.push(`- [${kind}] ${truncate(entry.pattern, PATTERN_CHAR_CAP)}`);
      }
    }
    if (transient.length > 0) {
      if (persistent.length > 0) lines.push("Other pre-existing patterns (transient / unclassified):");
      for (const { kind, entry } of transient) {
        lines.push(`- [${kind}] ${truncate(entry.pattern, PATTERN_CHAR_CAP)}`);
      }
    }
    if (ordered.length > capped.length) {
      lines.push(`- … (${ordered.length - capped.length} more patterns omitted)`);
    }
  }
  // Free-form analyst notes — most actionable signal the baseline-analyzer
  // produces (e.g. "URL X returns 404, use Y instead"). Bounded so a
  // verbose note cannot drown the rule list.
  if (notes.length > 0) {
    const clipped = notes.length > NOTES_CHAR_CAP
      ? `${notes.slice(0, NOTES_CHAR_CAP - 1)}…`
      : notes;
    lines.push("Analyst notes (from baseline-analyzer):");
    lines.push(clipped);
  }
  // Domain-agnostic closing rule: a trace whose post-subtraction console /
  // network / uncaught evidence is empty cannot justify ANY domain. The
  // classifier must prefer `test-code` if that domain is in the allowed
  // list (degrades to `blocked` otherwise) — this is enforced
  // deterministically in `tryClassifyOnce` via `evidence_line`.
  if (ordered.length > 0) {
    lines.push(
      "Rule: trace lines matching any pattern above are pre-existing platform/legacy " +
      "noise. After mentally subtracting them, if no console / network / uncaught " +
      "evidence remains, the failure cannot justify ANY domain; prefer `test-code` if " +
      "it is in the allowed domain list (otherwise the verdict degrades to `blocked`). " +
      "Your `evidence_line` MUST NOT be a substring of any pattern above.",
    );
  }

  // A3 hard rule — when the baseline-filtered structured failure has zero
  // surviving signals AND the baseline declares at least one persistent
  // entry, the only thing the trace could anchor on is permanent platform
  // noise. Steer the classifier away from `code-defect`.
  if (
    filteredStructuredFailure !== undefined &&
    countSurvivingSignals(filteredStructuredFailure) === 0 &&
    ordered.some((c) => c.entry.volatility === "persistent")
  ) {
    lines.push(
      "Surviving evidence is entirely permanent platform noise — prefer `test-code`; " +
      "`code-defect` is not justified.",
    );
  }
  return lines.join("\n");
}

function renderPriorAttemptsSection(priorAttempts: readonly PriorAttempt[]): string {
  if (priorAttempts.length === 0) return "";
  const slice = priorAttempts.slice(-PRIOR_ATTEMPT_CAP);
  const lines: string[] = [];
  lines.push("Prior debug-cycle classifications on this feature branch:");
  for (const a of slice) {
    const domain = parseDomainTag(a.resetReason) ?? "unknown";
    const reason = truncate(a.resetReason.replace(/\s+/g, " ").trim(), REASON_CHAR_CAP);
    lines.push(`- Cycle ${a.cycle} (${a.timestamp}): domain=${domain} · reason=${reason}`);
  }
  lines.push(
    "Rule: if a recent debug-cycle's structured report_outcome already classified the " +
    "fault domain, prefer that classification unless the new trace contains evidence that " +
    "contradicts it.",
  );
  return lines.join("\n");
}

/**
 * Render the prior-debug-recommendation block. The classifier sees this
 * AFTER the baseline-noise section and BEFORE the prior-attempts section
 * so the most recent specialist diagnosis is the highest-trust hint
 * available short of contradicting trace evidence.
 */
function renderPriorDebugRecommendationSection(
  rec: { readonly domain: string; readonly note: string; readonly cycleIndex: number } | undefined,
): string {
  if (!rec) return "";
  const note = rec.note.replace(/\s+/g, " ").trim();
  return (
    `A prior debug specialist (cycle ${rec.cycleIndex}) recommended classifying the ` +
    `next failure as \`${rec.domain}\` because: ${note}. Prefer this classification ` +
    `unless the new trace contains direct evidence contradicting it.`
  );
}

/**
 * Optional fixture-context block. Surfaces the `test_fixtures[]` entries
 * declared on the acceptance contract that the failing flow references,
 * so the classifier can prefer the `test-data` domain when (a) the
 * post-baseline-subtraction trace contains no application runtime
 * errors AND (b) at least one fixture assertion can be plausibly
 * violated by the failure.
 *
 * The router does not deterministically check whether assertions are
 * actually violated — that's the validator's job. The router's role is
 * to bias the LLM AWAY from `test-code` (locator tweaks) when fixture
 * mismatch is the more likely root cause.
 */
export interface TriageFixtureContext {
  /** Name of the failing flow when one can be identified. Surfaced to
   *  the model so it can correlate trace evidence with the fixture's
   *  declared assertions. */
  readonly failingFlow?: string;
  /** Fixtures referenced by failing or related flows. Pruned by the
   *  caller to the relevant subset; the router renders all supplied
   *  entries. */
  readonly fixtures: ReadonlyArray<{
    readonly id: string;
    readonly url: string;
    readonly asserts: ReadonlyArray<{
      readonly kind: string;
      readonly value: unknown;
      readonly comparator?: string;
    }>;
  }>;
}

const FIXTURE_BLOCK_MAX_FIXTURES = 5;
const FIXTURE_BLOCK_MAX_ASSERTS = 6;

function renderFixtureContextSection(
  ctx: TriageFixtureContext | undefined,
  domains: readonly string[],
): string {
  if (!ctx || !domains.includes("test-data")) return "";
  if (ctx.fixtures.length === 0) return "";

  const lines: string[] = [];
  lines.push("Test-fixture context for the failing flow:");
  if (ctx.failingFlow) lines.push(`Failing flow: ${ctx.failingFlow}`);
  const fxs = ctx.fixtures.slice(0, FIXTURE_BLOCK_MAX_FIXTURES);
  for (const f of fxs) {
    lines.push(`- fixture id=${f.id} url=${f.url}`);
    const asserts = f.asserts.slice(0, FIXTURE_BLOCK_MAX_ASSERTS);
    for (const a of asserts) {
      const cmp = a.comparator ?? "eq";
      const val = typeof a.value === "string" ? `"${a.value}"` : String(a.value);
      lines.push(`    · assert kind=${a.kind} ${cmp} ${val}`);
    }
    if (f.asserts.length > asserts.length) {
      lines.push(`    · … (${f.asserts.length - asserts.length} more asserts omitted)`);
    }
  }
  if (ctx.fixtures.length > fxs.length) {
    lines.push(`- … (${ctx.fixtures.length - fxs.length} more fixtures omitted)`);
  }
  lines.push(
    "Rule: prefer `test-data` over `test-code` when (a) post-baseline-subtraction " +
    "the trace shows no application runtime errors AND (b) the failure plausibly " +
    "violates a fixture assertion above (URL unreachable, swatch / variation count " +
    "mismatch, in-stock / product-type mismatch). `test-data` reroutes to spec-compiler " +
    "to pick a different fixture; `test-code` only fits when the test itself is wrong " +
    "for a valid fixture.",
  );
  return lines.join("\n");
}

function buildTriagePrompt(
  trace: string,
  domains: string[],
  topMatches: TriageSignature[],
  faultRouting: Record<string, { description?: string }>,
  baseline: BaselineProfile | null,
  priorAttempts: readonly PriorAttempt[],
  priorDebugRecommendation?: { readonly domain: string; readonly note: string; readonly cycleIndex: number },
  filteredStructuredFailure?: unknown,
  fixtureContext?: TriageFixtureContext,
): string {
  const domainList = domains.map((d) => `"${d}"`).join(", ");
  const matchContext = topMatches.length > 0
    ? `\n\nPartial matches from the knowledge base (not confident enough for deterministic routing):\n${topMatches.map((m) => `- "${m.error_snippet}" → ${m.fault_domain}: ${m.reason}`).join("\n")}`
    : "";

  const rules = domains
    .map((d) => {
      const desc = faultRouting[d]?.description;
      return desc ? `- "${d}" = ${desc}` : `- "${d}"`;
    })
    .join("\n");

  const baselineSection = renderBaselineSection(baseline, filteredStructuredFailure);
  const recommendationSection = renderPriorDebugRecommendationSection(priorDebugRecommendation);
  const priorSection = renderPriorAttemptsSection(priorAttempts);
  const fixtureSection = renderFixtureContextSection(fixtureContext, domains);
  const baselineBlock = baselineSection ? `\n\n${baselineSection}` : "";
  const recommendationBlock = recommendationSection ? `\n\n${recommendationSection}` : "";
  const priorBlock = priorSection ? `\n\n${priorSection}` : "";
  const fixtureBlock = fixtureSection ? `\n\n${fixtureSection}` : "";

  return `You are a fault-domain classifier for an agentic CI/CD pipeline.

Given the error trace below, determine which fault domain owns the root cause.

You MUST select exactly one of: ${domainList}

Rules:
${rules}
- For stack-specific domains not listed above, use the closest match from the allowed list.

Output ONLY valid JSON: {"fault_domain": "<domain>", "reason": "<one-sentence explanation>", "evidence_line": "<exact verbatim substring from the trace that justifies the verdict>"}
The "evidence_line" field MUST be copied verbatim from the trace below — do not paraphrase, do not invent.
Do not output any other text.
${matchContext}${baselineBlock}${recommendationBlock}${priorBlock}${fixtureBlock}

Error trace:
${trace.slice(0, 4000)}`;
}

function appendNovelTriageLog(
  slug: string,
  appRoot: string,
  entry: NovelTriageEntry,
): void {
  const logPath = featurePath(appRoot, slug, "novel-triage");
  ensureFeatureDir(appRoot, slug, "novel-triage");
  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(logPath, line, "utf-8");
}

/**
 * One round-trip to the LLM port + JSON extraction + domain validation.
 * Returns a tagged outcome the caller uses to decide whether to retry,
 * inherit, or fall through. Throws are caught here and reported as
 * `{ ok: false, kind: "error" }`.
 */
async function tryClassifyOnce(
  llm: TriageLlm,
  systemMessage: string,
  prompt: string,
  domains: string[],
  timeoutMs: number,
  baseline: BaselineProfile | null,
): Promise<ClassifyOutcome> {
  try {
    const text = await llm.classify({ systemMessage, prompt, timeoutMs });
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      return { ok: false, kind: "no-json", detail: "no JSON object found in response" };
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch (err) {
      return {
        ok: false,
        kind: "no-json",
        detail: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const faultDomain = String(parsed.fault_domain ?? "");
    const reason = String(parsed.reason ?? "");
    if (!domains.includes(faultDomain)) {
      return {
        ok: false,
        kind: "hallucinated",
        detail: `domain "${faultDomain}" not in allowed list`,
      };
    }
    // Enforce the baseline rule deterministically. The router cannot
    // accept a verdict whose `evidence_line` substring-matches any
    // pre-feature noise pattern, because that means the model picked
    // a domain on noise alone. Missing/empty `evidence_line` is
    // lenient-accepted — we can only filter what the model surfaces.
    const evidenceLine = typeof parsed.evidence_line === "string"
      ? parsed.evidence_line
      : "";
    if (evidenceLine.length > 0 && baseline) {
      const normalised = normalizeError(evidenceLine);
      if (matchesAnyBaselinePattern(normalised, baseline)
        || matchesAnyBaselinePattern(evidenceLine, baseline)) {
        return {
          ok: false,
          kind: "baseline-only",
          detail:
            `evidence_line matches baseline pattern: "${truncate(evidenceLine, 120)}"`,
        };
      }
    }
    return { ok: true, fault_domain: faultDomain, reason };
  } catch (err) {
    return {
      ok: false,
      kind: "error",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Ask the LLM to classify a novel error trace into a fault domain.
 *
 * Resilience contract (post Phase 2 — LLM-Unavailable Fallback Policy):
 *   1. First call uses the standard prompt + 60s budget.
 *   2. On parse failure / hallucinated domain / transport error /
 *      `baseline-only` rejection, retry ONCE with a stricter
 *      system+user prompt and a halved budget so the retry cannot
 *      double-stall a node's wall-clock budget.
 *   3. If the retry also fails, the router halts the run with
 *      `fault_domain: "blocked"` and `reason: "llm-unavailable — ..."`
 *      so the operator can `npm run pipeline:resume` once the LLM
 *      backend is available again. The router NEVER inherits a prior
 *      cycle's verdict — evidence may have shifted between cycles
 *      (e.g. test-code noise vs. genuine code defect), and silently
 *      reusing a stale classification produced cycle-2 mis-routes in
 *      the `product-quick-view-plp` run.
 *
 * `baseline` and `priorAttempts` default to "absent" so callers without
 * the data (and existing tests) need no changes. `failingNodeKey` is
 * retained on the signature for back-compat; `priorAttempts` still
 * feeds the prompt-construction path for context-rich classification.
 */
export async function askLlmRouter(
  llm: TriageLlm,
  trace: string,
  domains: string[],
  topMatches: TriageSignature[],
  slug: string,
  appRoot: string,
  faultRouting: Record<string, { description?: string }>,
  baseline: BaselineProfile | null = null,
  priorAttempts: readonly PriorAttempt[] = [],
  failingNodeKey?: string,
  priorDebugRecommendation?: { readonly domain: string; readonly note: string; readonly cycleIndex: number },
  filteredStructuredFailure?: unknown,
  fixtureContext?: TriageFixtureContext,
): Promise<LlmTriageResult> {
  const prompt = buildTriagePrompt(
    trace, domains, topMatches, faultRouting, baseline, priorAttempts, priorDebugRecommendation,
    filteredStructuredFailure, fixtureContext,
  );
  const baseSystem =
    "You are a JSON-only fault-domain classifier. " +
    "Output exactly one JSON object, no markdown.";

  // Step 1 — primary attempt.
  const first = await tryClassifyOnce(llm, baseSystem, prompt, domains, 60_000, baseline);
  if (first.ok) {
    const result: LlmTriageResult = { fault_domain: first.fault_domain, reason: first.reason };
    appendNovelTriageLog(slug, appRoot, {
      timestamp: new Date().toISOString(),
      fault_domain: result.fault_domain,
      reason: result.reason,
      trace_excerpt: trace.slice(0, 2000),
    });
    return result;
  }
  console.warn(`  ⚠ LLM triage router: ${first.kind} — ${first.detail}; retrying with stricter prompt`);

  // Step 2 — stricter retry. The system prompt cites the prior failure
  // mode so the model can self-correct; the user prompt re-asserts the
  // allowed-domain list inline. Halved timeout caps total LLM wall time
  // at the original 60s budget.
  const retrySystem =
    `${baseSystem} Your previous response was rejected (${first.kind}: ${first.detail}). ` +
    `Output ONLY a single JSON object with fields fault_domain and reason. ` +
    `No prose, no markdown, no code fences.`;
  const retryPrompt =
    `${prompt}\n\nAllowed domains: ${JSON.stringify(domains)}. Pick exactly one.`;
  const second = await tryClassifyOnce(llm, retrySystem, retryPrompt, domains, 30_000, baseline);
  if (second.ok) {
    const result: LlmTriageResult = { fault_domain: second.fault_domain, reason: second.reason };
    appendNovelTriageLog(slug, appRoot, {
      timestamp: new Date().toISOString(),
      fault_domain: result.fault_domain,
      reason: result.reason,
      trace_excerpt: trace.slice(0, 2000),
    });
    return result;
  }
  console.warn(`  ⚠ LLM triage router: retry also failed (${second.kind}: ${second.detail})`);

  // Step 3 — both attempts failed. Halt the run with `blocked` so the
  // operator can resume once the LLM backend is healthy. We never
  // inherit a prior cycle's verdict: evidence may have shifted between
  // cycles, and silently re-using a stale classification produced
  // cycle-2 mis-routes (see `product-quick-view-plp` run). The reason
  // string interpolates both attempt kinds so operators can grep
  // `_state.json` / `_NOVEL_TRIAGE.jsonl` for `llm-unavailable` and
  // distinguish this halt from other `blocked` causes.
  const result: LlmTriageResult = {
    fault_domain: "blocked",
    reason:
      `llm-unavailable — both classification attempts failed ` +
      `(${first.kind}: ${first.detail} → ${second.kind}: ${second.detail})`,
  };
  appendNovelTriageLog(slug, appRoot, {
    timestamp: new Date().toISOString(),
    fault_domain: result.fault_domain,
    reason: result.reason,
    trace_excerpt: trace.slice(0, 2000),
  });
  return result;
}

export const __test = { buildTriagePrompt, tryClassifyOnce };
