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
import path from "node:path";
import type { TriageLlm } from "../ports/triage-llm.js";
import type { TriageSignature } from "../apm/types.js";

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

function buildTriagePrompt(
  trace: string,
  domains: string[],
  topMatches: TriageSignature[],
  faultRouting: Record<string, { description?: string }>,
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

  return `You are a fault-domain classifier for an agentic CI/CD pipeline.

Given the error trace below, determine which fault domain owns the root cause.

You MUST select exactly one of: ${domainList}

Rules:
${rules}
- For stack-specific domains not listed above, use the closest match from the allowed list.

Output ONLY valid JSON: {"fault_domain": "<domain>", "reason": "<one-sentence explanation>"}
Do not output any other text.
${matchContext}

Error trace:
${trace.slice(0, 4000)}`;
}

function appendNovelTriageLog(
  slug: string,
  appRoot: string,
  entry: NovelTriageEntry,
): void {
  const logPath = path.join(appRoot, "in-progress", `${slug}_NOVEL_TRIAGE.jsonl`);
  const line = JSON.stringify(entry) + "\n";
  fs.appendFileSync(logPath, line, "utf-8");
}

/**
 * Ask the LLM to classify a novel error trace into a fault domain.
 */
export async function askLlmRouter(
  llm: TriageLlm,
  trace: string,
  domains: string[],
  topMatches: TriageSignature[],
  slug: string,
  appRoot: string,
  faultRouting: Record<string, { description?: string }>,
): Promise<LlmTriageResult> {
  const FALLBACK: LlmTriageResult = {
    fault_domain: "blocked",
    reason: "LLM classification failed — halting for human review",
  };

  try {
    const prompt = buildTriagePrompt(trace, domains, topMatches, faultRouting);
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
