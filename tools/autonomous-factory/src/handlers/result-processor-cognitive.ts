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

/**
 * Determine whether the condensed output warrants an LLM diagnosis.
 *
 * Design principle: the cognitive processor costs ~$0.003 and takes ~3-5s.
 * A misclassified pipeline run costs ~$38 and 15+ min of human time.
 * The gate should therefore be permissive — invoke whenever failures exist.
 *
 * Previous design had a fail-rate gate (>50%) + error-concentration gate
 * (≤3 unique patterns) + regex crash-indicator bypass. The regex gate
 * caused misclassification when word order varied ("crash page" vs
 * "Page crashed"), and the fail-rate gate blocked diagnosis at 47%.
 * Both were premature optimizations that cost more than they saved.
 */
function shouldInvokeLlm(
  _condensed: string,
  stats?: { passed: number; failed: number; total: number },
): boolean {
  // Any failures → invoke. The LLM uses a project-specific prompt
  // (e2e-diagnosis.md) that's far more accurate than regex pattern matching
  // for classifying fault domains.
  if (stats && stats.failed > 0) return true;

  // Stats unparseable — invoke conservatively. The output already failed
  // the handler, so something went wrong.
  if (!stats) {
    console.log("  ℹ Cognitive processor: test stats unavailable — invoking LLM for safety");
    return true;
  }

  // All tests passed but handler still failed (e.g., exit code issues) — invoke.
  return false;
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
      { prompt: condensed.slice(0, 8000) }, // cap input — priority sections lead, so critical evidence survives
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
