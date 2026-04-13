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
