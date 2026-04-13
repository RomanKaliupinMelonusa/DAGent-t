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
// Output capping (priority-based extraction + head/tail fallback)
// ---------------------------------------------------------------------------

/**
 * Extract high-signal sections from test runner output using project-declared
 * priority patterns.
 *
 * Test runners emit structured failure blocks interleaved with verbose noise
 * (console logs, framework warnings, network traces). Naive head/tail
 * truncation often keeps only the noise and discards the actual failure
 * evidence.
 *
 * This function scans for patterns declared in the APM config
 * (`result_processor.priority_patterns`). Each matched section is extracted
 * verbatim (up to a per-section cap) and placed BEFORE the generic head/tail
 * remainder — ensuring the triage LLM always sees critical evidence.
 *
 * The kernel contains ZERO hardcoded patterns. All framework/runner-specific
 * knowledge lives in each project's `.apm/workflows.yml`.
 *
 * When no priority patterns are configured, returns empty extraction and
 * the caller falls back to plain head/tail truncation.
 */
function extractPrioritySections(
  output: string,
  budget: number,
  patternStrings?: string[],
): { extracted: string; remainder: string } {
  if (!patternStrings || patternStrings.length === 0) {
    return { extracted: "", remainder: output };
  }

  // Compile project-declared patterns — each gets global+multiline flags
  const compiledPatterns: RegExp[] = patternStrings
    .map((p) => {
      try { return new RegExp(p, "gims"); } catch { return null; }
    })
    .filter(Boolean) as RegExp[];

  if (compiledPatterns.length === 0) {
    return { extracted: "", remainder: output };
  }

  const seen = new Set<string>();
  const sections: string[] = [];
  let totalLen = 0;
  const sectionCap = Math.floor(budget * 0.15); // max 15% of budget per section

  for (const pattern of compiledPatterns) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(output)) !== null) {
      let section = match[0].trim();
      if (!section || seen.has(section)) continue;
      // Cap individual sections to avoid one giant crash stack dominating
      if (section.length > sectionCap) {
        section = section.slice(0, sectionCap) + "\n  ... [section truncated]";
      }
      if (totalLen + section.length > budget * 0.6) break; // reserve 40% for head/tail context
      seen.add(section);
      sections.push(section);
      totalLen += section.length + 2; // +2 for separators
    }
  }

  if (sections.length === 0) {
    return { extracted: "", remainder: output };
  }

  // Build remainder by removing extracted sections (avoid duplicating content)
  let remainder = output;
  for (const s of seen) {
    // Only remove first occurrence to keep remainder coherent
    const idx = remainder.indexOf(s);
    if (idx !== -1) {
      remainder = remainder.slice(0, idx) + remainder.slice(idx + s.length);
    }
  }

  const extracted = `--- PRIORITY EVIDENCE (${sections.length} sections) ---\n\n` +
    sections.join("\n\n---\n\n");

  return { extracted, remainder };
}

function capOutput(output: string, maxChars: number, priorityPatterns?: string[]): string {
  if (output.length <= maxChars) return output;

  // Phase 1: Extract high-signal sections using project-declared priority patterns
  const { extracted, remainder } = extractPrioritySections(output, maxChars, priorityPatterns);

  if (extracted) {
    // Priority sections get first claim on the budget
    const remainingBudget = maxChars - extracted.length - 50; // 50 chars for markers
    if (remainingBudget <= 0) {
      return extracted.slice(0, maxChars);
    }
    // Fill the rest with head/tail of the remainder
    const headBudget = Math.floor(remainingBudget * 0.6);
    const tailBudget = remainingBudget - headBudget - 100;
    const head = remainder.slice(0, Math.max(headBudget, 0));
    const tail = tailBudget > 0 ? remainder.slice(-tailBudget) : "";
    const omitted = remainder.length - headBudget - Math.max(tailBudget, 0);
    return `${extracted}\n\n--- CONTEXT ---\n\n${head}${omitted > 0 ? `\n\n... [${omitted} chars omitted] ...\n\n` : "\n\n"}${tail}`;
  }

  // Fallback: no priority sections found — use original head/tail strategy
  const headBudget = Math.floor(maxChars * 0.6);
  const tailBudget = maxChars - headBudget - 100;

  const head = output.slice(0, headBudget);
  const tail = output.slice(-tailBudget);
  const omitted = output.length - headBudget - tailBudget;

  return `${head}\n\n... [${omitted} chars omitted] ...\n\n${tail}`;
}

// ---------------------------------------------------------------------------
// Noise filtering (project-configurable via APM)
// ---------------------------------------------------------------------------

/**
 * Strip lines matching project-declared noise patterns.
 * Runs BEFORE dedup and truncation to free budget for diagnostic evidence.
 *
 * Each noise pattern is a regex string compiled case-insensitively.
 * Multi-line console noise blocks (React stack traces, HTTP request logs)
 * are matched line-by-line — if the first line of a block matches,
 * subsequent indented continuation lines are also removed.
 */
function stripNoiseLines(output: string, noisePatterns: string[]): string {
  if (noisePatterns.length === 0) return output;

  const compiled = noisePatterns.map((p) => {
    try { return new RegExp(p, "i"); } catch { return null; }
  }).filter(Boolean) as RegExp[];

  if (compiled.length === 0) return output;

  const lines = output.split("\n");
  const result: string[] = [];
  let inNoiseBlock = false;

  for (const line of lines) {
    // Check if this line starts a noise block
    const isNoiseLine = compiled.some((re) => re.test(line));
    if (isNoiseLine) {
      inNoiseBlock = true;
      continue;
    }
    // Continuation lines of a noise block: indented or string concatenation
    if (inNoiseBlock) {
      if (/^\s{2,}/.test(line) || /^\s*'/.test(line) || /^\s*\+\s*'/.test(line)) {
        continue; // still in noise block continuation
      }
      inNoiseBlock = false; // block ended
    }
    result.push(line);
  }

  return result.join("\n");
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

    // 2. Strip project-declared noise patterns (frees budget for real evidence)
    let cleaned = config.noisePatterns && config.noisePatterns.length > 0
      ? stripNoiseLines(rawOutput, config.noisePatterns)
      : rawOutput;

    // 3. Dedup identical diagnostic blocks
    let condensed = dedupDiagnosticBlocks(cleaned);

    // 4. Prepend summary line if stats were extracted
    if (stats) {
      const summaryLine = `TEST SUMMARY: ${stats.passed} passed, ${stats.failed} failed, ${stats.total} total${stats.duration ? ` (${stats.duration})` : ""}`;
      condensed = `${summaryLine}\n\n${condensed}`;
    }

    // 5. Cap total size (priority extraction from APM config + head/tail fallback)
    condensed = capOutput(condensed, maxChars, config.priorityPatterns);

    return {
      condensed,
      fullOutput: rawOutput,
      stats,
    };
  },
};

export default regexResultProcessor;
