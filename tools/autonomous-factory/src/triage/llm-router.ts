/**
 * triage/llm-router.ts — LLM-based fallback router for novel error classification.
 *
 * When the local retriever yields no matches, this module uses the Copilot SDK
 * to classify the error into a fault domain. The LLM is constrained to output
 * only valid fault domains declared in workflows.yml.
 *
 * Implements the Data Flywheel: novel LLM classifications are persisted to
 * `in-progress/<slug>_NOVEL_TRIAGE.json` so humans can generalize them into
 * triage pack signatures.
 */

import fs from "node:fs";
import path from "node:path";
import type { CopilotClient } from "@github/copilot-sdk";
import { approveAll } from "@github/copilot-sdk";
import type { TriageSignature } from "../apm-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildTriagePrompt(
  trace: string,
  domains: string[],
  topMatches: TriageSignature[],
): string {
  const domainList = domains.map((d) => `"${d}"`).join(", ");
  const matchContext = topMatches.length > 0
    ? `\n\nPartial matches from the knowledge base (not confident enough for deterministic routing):\n${topMatches.map((m) => `- "${m.error_snippet}" → ${m.fault_domain}: ${m.reason}`).join("\n")}`
    : "";

  return `You are a fault-domain classifier for an agentic CI/CD pipeline.

Given the error trace below, determine which fault domain owns the root cause.

You MUST select exactly one of: ${domainList}

Rules:
- "infra" = missing cloud resources, CORS, auth config, Terraform errors, env vars
- "backend" = application logic errors, 500s, import failures, API bugs
- "frontend" = UI rendering, selectors, Playwright failures, CSS/HTML issues
- "both" = error clearly spans backend and frontend
- "cicd" = GitHub Actions workflow file errors, deploy pipeline config
- "environment" = transient auth/credential glitch, not a code bug
- "blocked" = unfixable without human intervention (permissions, subscriptions)
- "test-code" = the test itself is wrong (bad locator, race condition, contradicts spec)
- For stack-specific domains not listed above, use the closest match from the allowed list.

Output ONLY valid JSON: {"fault_domain": "<domain>", "reason": "<one-sentence explanation>"}
Do not output any other text.
${matchContext}

Error trace:
${trace.slice(0, 4000)}`;
}

// ---------------------------------------------------------------------------
// Novel triage log (Data Flywheel)
// ---------------------------------------------------------------------------

function appendNovelTriageLog(
  slug: string,
  appRoot: string,
  entry: NovelTriageEntry,
): void {
  const logPath = path.join(appRoot, "in-progress", `${slug}_NOVEL_TRIAGE.json`);
  let entries: NovelTriageEntry[] = [];
  try {
    if (fs.existsSync(logPath)) {
      entries = JSON.parse(fs.readFileSync(logPath, "utf-8"));
      if (!Array.isArray(entries)) entries = [];
    }
  } catch {
    entries = [];
  }
  entries.push(entry);
  fs.writeFileSync(logPath, JSON.stringify(entries, null, 2));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ask the LLM to classify a novel error trace into a fault domain.
 *
 * @param client   - Copilot SDK client instance
 * @param trace    - Raw error trace / diagnostic message
 * @param domains  - Valid fault domain strings from workflows.yml fault_routing
 * @param topMatches - Partial matches from the local retriever (injected as context)
 * @param slug     - Feature slug (for novel triage log)
 * @param appRoot  - App root path (for novel triage log)
 * @returns The classified fault domain and reason
 */
export async function askLlmRouter(
  client: CopilotClient,
  trace: string,
  domains: string[],
  topMatches: TriageSignature[],
  slug: string,
  appRoot: string,
): Promise<LlmTriageResult> {
  const FALLBACK: LlmTriageResult = {
    fault_domain: "blocked",
    reason: "LLM classification failed — halting for human review",
  };

  try {
    const prompt = buildTriagePrompt(trace, domains, topMatches);
    const session = await client.createSession({
      onPermissionRequest: approveAll,
      systemMessage: {
        mode: "replace",
        content: "You are a JSON-only fault-domain classifier. Output exactly one JSON object, no markdown.",
      },
    });

    const response = await session.sendAndWait(
      { prompt },
      60_000, // 60s timeout — triage should be fast
    );
    await session.disconnect();

    // Extract the last assistant message text
    const text = typeof response === "string"
      ? response
      : (response as { message?: string })?.message ?? "";

    // Parse JSON from the response (handle markdown code fences)
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn("  ⚠ LLM triage router: no JSON found in response");
      return FALLBACK;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const faultDomain = String(parsed.fault_domain ?? "");
    const reason = String(parsed.reason ?? "");

    // Strict enum validation — reject hallucinated domains
    if (!domains.includes(faultDomain)) {
      console.warn(`  ⚠ LLM triage router: hallucinated domain "${faultDomain}" — not in allowed list`);
      return FALLBACK;
    }

    const result: LlmTriageResult = { fault_domain: faultDomain, reason };

    // Data Flywheel: persist novel classification
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
