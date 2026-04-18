/**
 * handlers/result-processor-regex.ts — Zero-config kernel output sanitizer.
 *
 * Extracts test summary stats and truncates output to a fixed budget.
 * No per-project configuration — the kernel applies sensible defaults.
 * Fault classification is handled by the triage system (RAG + LLM router).
 */

import type {
  ProcessedResult,
  TestStats,
} from "./result-processor.js";

const DEFAULT_MAX_CHARS = 8192;

// ---------------------------------------------------------------------------
// Test summary extraction
// ---------------------------------------------------------------------------

/** Extract test run stats from common runner output formats. */
export function extractTestStats(output: string): TestStats | undefined {
  // Playwright format: "X passed", "Y failed", "Z skipped"
  const passedMatch = output.match(/(\d+)\s+passed/i);
  const failedMatch = output.match(/(\d+)\s+failed/i);
  const skippedMatch = output.match(/(\d+)\s+skipped/i);

  // Jest/Vitest format: "Tests: X passed, Y failed, Z total"
  const jestMatch = output.match(/Tests:\s*(\d+)\s+passed,\s*(\d+)\s+failed,\s*(\d+)\s+total/i);

  // Duration extraction
  const durationMatch = output.match(/(?:finished in|took|duration[:\s]+)\s*([\d.]+\s*[ms]+)/i);

  if (jestMatch) {
    return {
      passed: parseInt(jestMatch[1], 10),
      failed: parseInt(jestMatch[2], 10),
      total: parseInt(jestMatch[3], 10),
      duration: durationMatch?.[1],
    };
  }

  if (passedMatch || failedMatch) {
    const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
    const skipped = skippedMatch ? parseInt(skippedMatch[1], 10) : 0;
    return {
      passed,
      failed,
      total: passed + failed + skipped,
      duration: durationMatch?.[1],
    };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// Output capping (head/tail truncation)
// ---------------------------------------------------------------------------

export function capOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;

  const headBudget = Math.floor(maxChars * 0.6);
  const tailBudget = maxChars - headBudget - 100;

  const head = output.slice(0, headBudget);
  const tail = output.slice(-tailBudget);
  const omitted = output.length - headBudget - tailBudget;

  return `${head}\n\n... [${omitted} chars omitted] ...\n\n${tail}`;
}

// ---------------------------------------------------------------------------
// Public API — zero-config output sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize raw script output: extract test stats and truncate to budget.
 * No configuration required — the kernel applies sensible defaults.
 */
export function sanitizeOutput(
  rawOutput: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): ProcessedResult {
  // 1. Extract stats before any mutations
  const stats = extractTestStats(rawOutput);

  // 2. Prepend summary line if stats were extracted
  let condensed = rawOutput;
  if (stats) {
    const summaryLine = `TEST SUMMARY: ${stats.passed} passed, ${stats.failed} failed, ${stats.total} total${stats.duration ? ` (${stats.duration})` : ""}`;
    condensed = `${summaryLine}\n\n${condensed}`;
  }

  // 3. Cap total size (head/tail truncation)
  condensed = capOutput(condensed, maxChars);

  return {
    condensed,
    fullOutput: rawOutput,
    stats,
  };
}
