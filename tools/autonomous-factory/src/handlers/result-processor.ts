/**
 * handlers/result-processor.ts — ResultProcessor plugin interface.
 *
 * Post-processes raw script handler output before it reaches triage.
 * Two built-in implementations:
 *   - result-processor-regex.ts  — deterministic dedup + cap + summary extraction
 *   - result-processor-cognitive.ts — LLM diagnosis layered on top of deduped output
 *
 * The kernel invokes the processor after handler.execute() returns a failed result,
 * BEFORE the error flows to handleFailureReroute() / triageFailure().
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Extracted test run statistics (stack-agnostic). */
export interface TestStats {
  passed: number;
  failed: number;
  total: number;
  duration?: string;
}

/** LLM-produced structured diagnosis (optional, from cognitive pass). */
export interface CognitiveDiagnosis {
  root_cause: string;
  fault_domain_hint: string;
  error_type: string;
  evidence: string;
}

/** Output from the result processor pipeline. */
export interface ProcessedResult {
  /** Deduped, capped output for logs + triage input. */
  condensed: string;
  /** Raw output preserved for archival (_E2E-FULL-LOG.md). */
  fullOutput: string;
  /** Noise-stripped + deduped output BEFORE capping. Used by the cognitive
   *  processor as LLM input to avoid the information loss of truncation.
   *  Only populated when the regex pass runs; undefined otherwise. */
  cleanedOutput?: string;
  /** Extracted test summary statistics (if parseable). */
  stats?: TestStats;
  /** LLM-produced structured diagnosis (if cognitive pass ran). */
  diagnosis?: CognitiveDiagnosis;
}

/** Configuration for the result processor (from workflows.yml node config). */
export interface ResultProcessorConfig {
  /** Processor type: "regex" = deterministic only, "cognitive" = regex + LLM, "none" = disabled. */
  type: "regex" | "cognitive" | "none";
  /** Maximum chars for condensed output (default: 8192). */
  maxChars?: number;
  /** LLM model tier for cognitive pass: "fast" or "default" (default: "fast"). */
  model?: "fast" | "default";
  /** Path to .md instruction fragment for LLM system prompt (relative to .apm/). */
  prompt?: string;
  /** Maximum chars to send to the LLM in the cognitive pass.
   *  When omitted, the full noise-stripped output is sent (recommended for
   *  cognitive processor — the cost difference is negligible vs. pipeline run cost).
   *  Set explicitly to cap LLM input for cost-sensitive environments. */
  maxLlmInputChars?: number;
  /**
   * Regex patterns matching console/log noise lines to strip BEFORE truncation.
   * Each pattern is compiled as a case-insensitive regex and tested against
   * individual lines. Matching lines are removed from the output before
   * dedup/extraction/capping — freeing budget for actual diagnostic evidence.
   *
   * Declared per-project in workflows.yml → result_processor.noise_patterns.
   * The kernel applies them generically — no framework knowledge needed.
   */
  noisePatterns?: string[];
  /**
   * Regex patterns matching high-signal diagnostic lines to extract BEFORE
   * truncation. Matched sections are placed at the top of the condensed
   * output so the triage LLM always sees critical evidence regardless of
   * where it appears in the raw output.
   *
   * Each pattern is compiled as a case-insensitive regex with global+multiline
   * flags and executed against the full output. The kernel captures the match
   * plus continuation lines (until a blank-line pair or next test marker).
   *
   * When empty or omitted, `capOutput` falls back to plain head/tail truncation.
   *
   * Declared per-project in workflows.yml → result_processor.priority_patterns.
   */
  priorityPatterns?: string[];
  /**
   * Regex pattern that matches the header of individual test failure blocks.
   * Used by `dedupTestFailures()` to split output into per-test blocks and
   * collapse identical errors. The pattern is used as a lookahead split point.
   *
   * Examples:
   *   Playwright: `\s*\d+\)\s+\[\w+\]\s+›`  (matches "  1) [chromium] › ...")
   *   Jest:       `●\s+\S+`                   (matches "● Suite › test name")
   *
   * When omitted, test-level dedup is skipped (the generic diagnostic block
   * dedup still runs). Declared per-project in workflows.yml.
   */
  failureBlockSeparator?: string;
}

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/** Plugin interface for processing raw handler output before triage. */
export interface ResultProcessor {
  /**
   * Process raw handler output into a condensed, structured form.
   * @param rawOutput - Raw stdout+stderr from the handler
   * @param config - Processor configuration from APM
   * @param promptContent - Resolved system prompt content (for cognitive pass)
   * @returns Processed result with condensed output, stats, and optional diagnosis
   */
  process(
    rawOutput: string,
    config: ResultProcessorConfig,
    promptContent?: string,
  ): Promise<ProcessedResult>;
}
