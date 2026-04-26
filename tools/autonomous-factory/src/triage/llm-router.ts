/**
 * triage/llm-router.ts — LLM-based fallback router for novel error classification.
 *
 * When the local retriever yields no matches, this module uses an injected
 * TriageLlm port to classify the error into a fault domain. The LLM is
 * constrained to output only valid fault domains declared in workflows.yml.
 *
 * Implements the Data Flywheel: novel LLM classifications are persisted to
 * `in-progress/<slug>_NOVEL_TRIAGE.jsonl` so humans can generalize them into
 * triage pack signatures.
 *
 * Vendor SDKs are NOT imported here — all LLM I/O flows through the
 * `TriageLlm` port (see `ports/triage-llm.ts`).
 */

import fs from "node:fs";
import type { TriageLlm } from "../ports/triage-llm.js";
import type { TriageSignature } from "../apm/types.js";
import type { BaselineProfile, BaselineEntry } from "../ports/baseline-loader.js";
import type { PriorAttempt } from "./historian.js";
import { parseDomainTag } from "./handoff-builder.js";
import { matchesAnyBaselinePattern } from "./baseline-filter.js";
import { normalizeError } from "./error-fingerprint.js";
import { featurePath, ensureFeatureDir } from "../adapters/feature-paths.js";

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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function renderBaselineSection(baseline: BaselineProfile | null): string {
  if (!baseline) return "";
  const ordered: Array<{ kind: string; entry: BaselineEntry }> = [];
  for (const e of baseline.console_errors ?? []) ordered.push({ kind: "console", entry: e });
  for (const e of baseline.network_failures ?? []) ordered.push({ kind: "network", entry: e });
  for (const e of baseline.uncaught_exceptions ?? []) ordered.push({ kind: "uncaught", entry: e });
  if (ordered.length === 0) return "";

  const capped = ordered.slice(0, BASELINE_PATTERN_CAP);
  const lines: string[] = [];
  lines.push("Pre-existing baseline noise (captured BEFORE this feature began):");
  for (const { kind, entry } of capped) {
    lines.push(`- [${kind}] ${truncate(entry.pattern, PATTERN_CHAR_CAP)}`);
  }
  if (ordered.length > capped.length) {
    lines.push(`- … (${ordered.length - capped.length} more patterns omitted)`);
  }
  // Domain-agnostic closing rule: a trace whose post-subtraction console /
  // network / uncaught evidence is empty cannot justify ANY domain. The
  // classifier must prefer `test-code` if that domain is in the allowed
  // list (degrades to `blocked` otherwise) — this is enforced
  // deterministically in `tryClassifyOnce` via `evidence_line`.
  lines.push(
    "Rule: trace lines matching any pattern above are pre-existing platform/legacy " +
    "noise. After mentally subtracting them, if no console / network / uncaught " +
    "evidence remains, the failure cannot justify ANY domain; prefer `test-code` if " +
    "it is in the allowed domain list (otherwise the verdict degrades to `blocked`). " +
    "Your `evidence_line` MUST NOT be a substring of any pattern above.",
  );
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

function buildTriagePrompt(
  trace: string,
  domains: string[],
  topMatches: TriageSignature[],
  faultRouting: Record<string, { description?: string }>,
  baseline: BaselineProfile | null,
  priorAttempts: readonly PriorAttempt[],
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

  const baselineSection = renderBaselineSection(baseline);
  const priorSection = renderPriorAttemptsSection(priorAttempts);
  const baselineBlock = baselineSection ? `\n\n${baselineSection}` : "";
  const priorBlock = priorSection ? `\n\n${priorSection}` : "";

  return `You are a fault-domain classifier for an agentic CI/CD pipeline.

Given the error trace below, determine which fault domain owns the root cause.

You MUST select exactly one of: ${domainList}

Rules:
${rules}
- For stack-specific domains not listed above, use the closest match from the allowed list.

Output ONLY valid JSON: {"fault_domain": "<domain>", "reason": "<one-sentence explanation>", "evidence_line": "<exact verbatim substring from the trace that justifies the verdict>"}
The "evidence_line" field MUST be copied verbatim from the trace below — do not paraphrase, do not invent.
Do not output any other text.
${matchContext}${baselineBlock}${priorBlock}

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
 * Walk `priorAttempts` newest-first and return the most recent attempt
 * whose `failingItemKey` matches the current node and whose
 * `[domain:X]` tag resolves to a domain still in the allowed list.
 * Returns `null` when nothing inheritable exists — caller should fall
 * through to the hard `blocked` fallback.
 */
function inheritPriorVerdict(
  priorAttempts: readonly PriorAttempt[],
  failingNodeKey: string | undefined,
  domains: string[],
): { fault_domain: string; cycle: number } | null {
  if (!failingNodeKey || priorAttempts.length === 0) return null;
  for (let i = priorAttempts.length - 1; i >= 0; i--) {
    const a = priorAttempts[i];
    if (a.failingItemKey !== failingNodeKey) continue;
    const dom = parseDomainTag(a.resetReason);
    if (!dom || !domains.includes(dom)) continue;
    return { fault_domain: dom, cycle: a.cycle };
  }
  return null;
}

/**
 * Ask the LLM to classify a novel error trace into a fault domain.
 *
 * Resilience contract (post-A3):
 *   1. First call uses the standard prompt + 60s budget.
 *   2. On parse failure / hallucinated domain / transport error, retry
 *      ONCE with a stricter system+user prompt and a halved budget so
 *      the retry cannot double-stall a node's wall-clock budget.
 *   3. If the retry also fails AND `failingNodeKey` is supplied, look
 *      up the most recent same-item entry in `priorAttempts` whose
 *      `[domain:X]` tag still resolves to an allowed domain; inherit
 *      that classification with an annotated reason.
 *   4. Only when neither retry nor inheritance works does the router
 *      hard-fall-through to `{ fault_domain: "blocked" }`.
 *
 * `baseline` and `priorAttempts` default to "absent" so callers without
 * the data (and existing tests) need no changes. `failingNodeKey` is
 * appended last so prior call sites compile unchanged; absent
 * `failingNodeKey` skips the inheritance step.
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
): Promise<LlmTriageResult> {
  const FALLBACK: LlmTriageResult = {
    fault_domain: "blocked",
    reason: "LLM classification failed — halting for human review",
  };

  const prompt = buildTriagePrompt(
    trace, domains, topMatches, faultRouting, baseline, priorAttempts,
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

  // Step 3 — inherit the prior cycle's verdict if one exists for this
  // failing node and points to a still-allowed domain.
  const inherited = inheritPriorVerdict(priorAttempts, failingNodeKey, domains);
  if (inherited) {
    const result: LlmTriageResult = {
      fault_domain: inherited.fault_domain,
      reason:
        `inherited from cycle ${inherited.cycle} — LLM classification unavailable ` +
        `(${first.kind} → ${second.kind})`,
    };
    appendNovelTriageLog(slug, appRoot, {
      timestamp: new Date().toISOString(),
      fault_domain: result.fault_domain,
      reason: result.reason,
      trace_excerpt: trace.slice(0, 2000),
    });
    return result;
  }

  // Step 4 — neither retry nor inheritance worked.
  return FALLBACK;
}

export const __test = { buildTriagePrompt, tryClassifyOnce, inheritPriorVerdict };
