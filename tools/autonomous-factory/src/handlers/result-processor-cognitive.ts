/**
 * handlers/result-processor-cognitive.ts — LLM cognitive pass for test output diagnosis.
 *
 * Layers an LLM analysis on top of the deterministic regex pass.
 * Triggered conditionally: only when failure rate is high and error patterns
 * are concentrated (indicating a systemic issue worth diagnosing).
 *
 * The LLM system prompt is loaded from a project-specific .md instruction
 * fragment declared in APM config. This keeps the kernel stack-agnostic
 * while letting each project define domain-specific diagnostic guidance.
 *
 * Output: a structured CognitiveDiagnosis (root_cause, fault_domain_hint,
 * error_type, evidence) prepended to the condensed output as a
 * FAULT_DOMAIN_HINT header for triage Tier 2.
 */

import type { CopilotClient } from "@github/copilot-sdk";
import { approveAll } from "@github/copilot-sdk";
import regexProcessor from "./result-processor-regex.js";
import type {
  ResultProcessor,
  ResultProcessorConfig,
  ProcessedResult,
  CognitiveDiagnosis,
} from "./result-processor.js";

// ---------------------------------------------------------------------------
// Trigger heuristics
// ---------------------------------------------------------------------------

const DEFAULT_BUILTIN_PROMPT =
  "Analyze this test output. Respond with JSON: " +
  '{ "root_cause": "<one sentence>", "fault_domain_hint": "<domain>", "error_type": "<category>", "evidence": "<key excerpts>" }';

/** Determine whether the condensed output warrants an LLM diagnosis. */
function shouldInvokeLlm(condensed: string, stats?: { passed: number; failed: number; total: number }): boolean {
  // Condition 1: majority failures
  if (stats && stats.total > 0) {
    const failRate = stats.failed / stats.total;
    if (failRate <= 0.5) return false;
  } else if (!stats) {
    // Stats unparseable — can't check fail rate. Continue to other conditions
    // but log that we're operating without summary data.
    console.log("  ℹ Cognitive processor: test stats unavailable — relying on error pattern analysis");
  }

  // Condition 2: concentrated error patterns (≤3 unique error snippets)
  const errorLines = condensed
    .split("\n")
    .filter((l) => /error|fail|timeout|crash|threw|exception/i.test(l));
  const uniqueErrors = new Set(errorLines.map((l) => l.replace(/\d+/g, "N").trim()));
  if (uniqueErrors.size > 3) return false;

  // Condition 3 (bonus): crash indicators boost confidence
  const hasCrashIndicator = /error occurred in the <|crash page|isn't working|ErrorBoundary/i.test(condensed);
  if (hasCrashIndicator) return true;

  // Default: invoke if conditions 1+2 passed
  return true;
}

// ---------------------------------------------------------------------------
// LLM call
// ---------------------------------------------------------------------------

async function callLlm(
  client: CopilotClient,
  condensed: string,
  systemPrompt: string,
): Promise<CognitiveDiagnosis | undefined> {
  try {
    const session = await client.createSession({
      onPermissionRequest: approveAll,
      systemMessage: {
        mode: "replace",
        content: systemPrompt,
      },
    });

    const response = await session.sendAndWait(
      { prompt: condensed.slice(0, 6000) }, // cap input to avoid token overrun
      30_000, // 30s — diagnosis should be fast
    );
    await session.disconnect();

    const text = typeof response === "string"
      ? response
      : (response as { message?: string })?.message ?? "";

    // Parse JSON from response (handle markdown code fences)
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn("  ⚠ Cognitive processor: no JSON in LLM response");
      return undefined;
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      root_cause: String(parsed.root_cause ?? ""),
      fault_domain_hint: String(parsed.fault_domain_hint ?? ""),
      error_type: String(parsed.error_type ?? ""),
      evidence: String(parsed.evidence ?? ""),
    };
  } catch (err) {
    console.warn(`  ⚠ Cognitive processor: LLM call failed — ${err instanceof Error ? err.message : String(err)}`);
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Format FAULT_DOMAIN_HINT header for triage integration
// ---------------------------------------------------------------------------

function formatWithHint(condensed: string, diagnosis: CognitiveDiagnosis): string {
  const header = [
    `FAULT_DOMAIN_HINT: ${diagnosis.fault_domain_hint}`,
    `ROOT_CAUSE: ${diagnosis.root_cause}`,
    `ERROR_TYPE: ${diagnosis.error_type}`,
    `EVIDENCE: ${diagnosis.evidence}`,
  ].join("\n");

  return `${header}\n\n${condensed}`;
}

// ---------------------------------------------------------------------------
// ResultProcessor implementation
// ---------------------------------------------------------------------------

export function createCognitiveProcessor(client?: CopilotClient): ResultProcessor {
  return {
    async process(
      rawOutput: string,
      config: ResultProcessorConfig,
      promptContent?: string,
    ): Promise<ProcessedResult> {
      // Step 1: Always run the deterministic regex pass first
      const regexResult = await regexProcessor.process(rawOutput, config);

      // Step 2: Determine if LLM pass should run
      if (!client) {
        console.log("  ℹ Cognitive processor: no CopilotClient — skipping LLM pass");
        return regexResult;
      }

      if (!shouldInvokeLlm(regexResult.condensed, regexResult.stats)) {
        console.log("  ℹ Cognitive processor: trigger conditions not met — skipping LLM pass");
        return regexResult;
      }

      // Step 3: Invoke LLM with project-specific or default prompt
      const systemPrompt = promptContent?.trim() || DEFAULT_BUILTIN_PROMPT;
      console.log("  🤖 Cognitive processor: invoking LLM diagnosis");
      const diagnosis = await callLlm(client, regexResult.condensed, systemPrompt);

      if (!diagnosis || !diagnosis.fault_domain_hint) {
        console.log("  ⚠ Cognitive processor: LLM produced no usable diagnosis — using regex result only");
        return regexResult;
      }

      console.log(`  🤖 Cognitive diagnosis: fault_domain_hint=${diagnosis.fault_domain_hint}, error_type=${diagnosis.error_type}`);

      // Step 4: Prepend FAULT_DOMAIN_HINT header to condensed output
      return {
        condensed: formatWithHint(regexResult.condensed, diagnosis),
        fullOutput: regexResult.fullOutput,
        stats: regexResult.stats,
        diagnosis,
      };
    },
  };
}
