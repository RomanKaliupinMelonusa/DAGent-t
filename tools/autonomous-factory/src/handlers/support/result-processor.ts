/**
 * handlers/result-processor.ts — Kernel output sanitization types.
 *
 * Provides deterministic test output sanitization (stat extraction + truncation)
 * as a zero-config kernel utility. No per-node configuration — the kernel
 * applies sensible defaults. Fault classification is handled by the triage
 * system (4-tier cascade: unfixable → JSON → header → RAG → LLM router).
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

/** Sanitized output from the kernel output processor. */
export interface ProcessedResult {
  /** Truncated output for logs + triage input. */
  condensed: string;
  /** Raw output preserved for archival. */
  fullOutput: string;
  /** Extracted test summary statistics (if parseable). */
  stats?: TestStats;
}
