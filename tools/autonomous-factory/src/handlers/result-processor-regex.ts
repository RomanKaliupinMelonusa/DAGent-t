/**
 * handlers/result-processor-regex.ts — Deterministic test output preprocessor.
 *
 * Deduplicates identical diagnostic blocks, extracts test summary stats,
 * and caps total output size. Zero LLM cost — pure regex/string processing.
 *
 * Stack-agnostic: recognizes common test runner output patterns (Playwright,
 * Jest, Vitest, etc.) without hardcoding any specific framework.
 */

import type {
  ResultProcessor,
  ResultProcessorConfig,
  ProcessedResult,
  TestStats,
} from "./result-processor.js";

const DEFAULT_MAX_CHARS = 8192;

// ---------------------------------------------------------------------------
// Diagnostic block deduplication
// ---------------------------------------------------------------------------

/**
 * Detect repeated diagnostic blocks separated by common markers.
 * Collapses N identical blocks to a single occurrence with a count annotation.
 */
function dedupDiagnosticBlocks(output: string): string {
  // Split on common diagnostic separators (--- Browser Diagnostics ---, ═══, ──────, etc.)
  const separatorPattern = /^[-─═]{3,}.*[-─═]{3,}$/m;
  const blocks = output.split(separatorPattern);

  if (blocks.length <= 2) return output; // nothing to dedup

  // Hash blocks and count occurrences
  const seen = new Map<string, { first: string; count: number }>();
  const order: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    // Normalize whitespace for comparison but preserve first occurrence
    const key = trimmed.replace(/\s+/g, " ");
    const existing = seen.get(key);
    if (existing) {
      existing.count++;
    } else {
      seen.set(key, { first: trimmed, count: 1 });
      order.push(key);
    }
  }

  // Rebuild with dedup annotations
  const parts: string[] = [];
  for (const key of order) {
    const entry = seen.get(key)!;
    if (entry.count > 1) {
      parts.push(`${entry.first}\n\n(× ${entry.count} identical occurrences — showing first)`);
    } else {
      parts.push(entry.first);
    }
  }

  return parts.join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Test summary extraction
// ---------------------------------------------------------------------------

/** Extract test run stats from common runner output formats. */
function extractTestStats(output: string): TestStats | undefined {
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
// Output capping (head + tail strategy)
// ---------------------------------------------------------------------------

function capOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;

  const headBudget = Math.floor(maxChars * 0.6);
  const tailBudget = maxChars - headBudget - 100; // 100 chars for truncation marker

  const head = output.slice(0, headBudget);
  const tail = output.slice(-tailBudget);
  const omitted = output.length - headBudget - tailBudget;

  return `${head}\n\n... [${omitted} chars omitted] ...\n\n${tail}`;
}

// ---------------------------------------------------------------------------
// ResultProcessor implementation
// ---------------------------------------------------------------------------

const regexResultProcessor: ResultProcessor = {
  async process(
    rawOutput: string,
    config: ResultProcessorConfig,
  ): Promise<ProcessedResult> {
    const maxChars = config.maxChars ?? DEFAULT_MAX_CHARS;

    // 1. Extract stats before any mutations
    const stats = extractTestStats(rawOutput);

    // 2. Dedup identical diagnostic blocks
    let condensed = dedupDiagnosticBlocks(rawOutput);

    // 3. Prepend summary line if stats were extracted
    if (stats) {
      const summaryLine = `TEST SUMMARY: ${stats.passed} passed, ${stats.failed} failed, ${stats.total} total${stats.duration ? ` (${stats.duration})` : ""}`;
      condensed = `${summaryLine}\n\n${condensed}`;
    }

    // 4. Cap total size
    condensed = capOutput(condensed, maxChars);

    return {
      condensed,
      fullOutput: rawOutput,
      stats,
    };
  },
};

export default regexResultProcessor;
