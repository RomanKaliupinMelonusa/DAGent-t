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
import { featurePath, ensureFeatureDir } from "../adapters/feature-paths.js";

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
  lines.push(
    "Rule: trace lines matching any pattern above are pre-existing platform/legacy noise " +
    "and must NOT by themselves justify a frontend / browser-runtime-error classification.",
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

Output ONLY valid JSON: {"fault_domain": "<domain>", "reason": "<one-sentence explanation>"}
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
 * Ask the LLM to classify a novel error trace into a fault domain.
 *
 * `baseline` and `priorAttempts` are optional context that, when supplied,
 * are rendered into dedicated prompt sections with explicit anti-mis-
 * classification rules. Both default to "absent" so callers without the
 * data (and existing tests) need no changes.
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
): Promise<LlmTriageResult> {
  const FALLBACK: LlmTriageResult = {
    fault_domain: "blocked",
    reason: "LLM classification failed — halting for human review",
  };

  try {
    const prompt = buildTriagePrompt(
      trace, domains, topMatches, faultRouting, baseline, priorAttempts,
    );
    const text = await llm.classify({
      systemMessage: "You are a JSON-only fault-domain classifier. Output exactly one JSON object, no markdown.",
      prompt,
      timeoutMs: 60_000,
    });

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn("  ⚠ LLM triage router: no JSON found in response");
      return FALLBACK;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const faultDomain = String(parsed.fault_domain ?? "");
    const reason = String(parsed.reason ?? "");

    if (!domains.includes(faultDomain)) {
      console.warn(`  ⚠ LLM triage router: hallucinated domain "${faultDomain}" — not in allowed list`);
      return FALLBACK;
    }

    const result: LlmTriageResult = { fault_domain: faultDomain, reason };

    appendNovelTriageLog(slug, appRoot, {
      timestamp: new Date().toISOString(),
      fault_domain: faultDomain,
      reason,
      trace_excerpt: trace.slice(0, 2000),
    });

    return result;
  } catch (err) {
    console.warn(`  ⚠ LLM triage router error: ${err instanceof Error ? err.message : String(err)}`);
    return FALLBACK;
  }
}

export const __test = { buildTriagePrompt };
