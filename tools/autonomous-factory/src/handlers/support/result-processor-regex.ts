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
// Output capping — structure-aware for Playwright, head/tail fallback
// ---------------------------------------------------------------------------

// Match the start of a Playwright failed-test section, e.g.
//   `  1) [chromium] › e2e/foo.spec.ts:12:3 › suite › test name`
// The leading whitespace is preserved by Playwright; anchoring to line-start
// with optional indentation keeps this robust across reporter versions.
const PW_SECTION_HEAD_RE = /^\s{2,}\d+\)\s+\[[^\]]+\]\s+›/m;

/**
 * Split a Playwright-style output into `{ preamble, sections, postscript }`.
 * Each section is the raw text of one numbered failed-test block, including
 * its leading header line. Returns `null` when the output carries no
 * numbered sections (plain single-failure / non-Playwright output).
 */
function splitPlaywrightSections(
  output: string,
): { preamble: string; sections: string[]; postscript: string } | null {
  // Find all section-header line starts. Iterate with a global regex so we
  // know exactly where each block begins.
  const headerRe = new RegExp(PW_SECTION_HEAD_RE.source, "gm");
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(output)) !== null) {
    starts.push(m.index);
    // Prevent zero-length match loops.
    if (headerRe.lastIndex === m.index) headerRe.lastIndex++;
  }
  if (starts.length === 0) return null;

  const preamble = output.slice(0, starts[0]);
  const sections: string[] = [];
  // Detect the end of the last section by scanning backward from EOF for
  // the Playwright summary footer (lines like `  3 failed`). Everything
  // from the summary to EOF is the postscript; everything before is the
  // last section body.
  const FOOTER_RE = /^\s{2,}\d+\s+(failed|passed|skipped|did not run|flaky)\b/m;
  const footerMatch = FOOTER_RE.exec(output.slice(starts[starts.length - 1]));
  const lastSectionEnd = footerMatch
    ? starts[starts.length - 1] + footerMatch.index
    : output.length;

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : lastSectionEnd;
    sections.push(output.slice(start, end));
  }
  const postscript = output.slice(lastSectionEnd);
  return { preamble, sections, postscript };
}

/**
 * Budgeted, structure-aware cap. When the output is Playwright-style, keeps
 * the preamble + postscript verbatim (summary, `N failed` footer) and packs
 * as many complete numbered sections as fit. If a single section alone
 * exceeds the remaining budget, that section is head+tail truncated in
 * place — so at least its header line and last stack frames survive, which
 * is where the critical `error-context.md` pointer lives.
 *
 * Falls back to the classic head/tail cap for non-Playwright output.
 */
export function capOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output;

  const split = splitPlaywrightSections(output);
  if (split) {
    return capPlaywrightStructured(split, maxChars);
  }

  // Non-Playwright: head/tail fallback (preserves original semantics).
  const headBudget = Math.floor(maxChars * 0.6);
  const tailBudget = maxChars - headBudget - 100;
  const head = output.slice(0, headBudget);
  const tail = output.slice(-tailBudget);
  const omitted = output.length - headBudget - tailBudget;
  return `${head}\n\n... [${omitted} chars omitted] ...\n\n${tail}`;
}

function capPlaywrightStructured(
  parts: { preamble: string; sections: string[]; postscript: string },
  maxChars: number,
): string {
  const { preamble, sections, postscript } = parts;
  // Reserve preamble + postscript first. If together they already exceed
  // the budget, degrade to head/tail on the whole output (rare).
  const framesBytes = preamble.length + postscript.length;
  if (framesBytes >= maxChars) {
    const joined = preamble + sections.join("") + postscript;
    const head = joined.slice(0, Math.floor(maxChars * 0.6));
    const tail = joined.slice(-(maxChars - head.length - 100));
    return `${head}\n\n... [${joined.length - head.length - tail.length} chars omitted] ...\n\n${tail}`;
  }

  const sectionBudget = maxChars - framesBytes;
  const kept: string[] = [];
  let used = 0;
  let truncatedCount = 0;
  const MIN_SECTION_KEEP = 600; // below this, don't try an in-section truncate

  for (const sec of sections) {
    const remaining = sectionBudget - used;
    if (remaining <= 0) {
      truncatedCount += sections.length - kept.length;
      break;
    }
    if (sec.length <= remaining) {
      kept.push(sec);
      used += sec.length;
      continue;
    }
    // Section too big for remaining budget. If we can keep a meaningful
    // head+tail of it, do so; otherwise drop it (and all following).
    if (remaining >= MIN_SECTION_KEEP) {
      const headB = Math.floor(remaining * 0.55);
      const tailB = remaining - headB - 80;
      const h = sec.slice(0, headB);
      const t = sec.slice(-tailB);
      kept.push(`${h}\n\n... [${sec.length - headB - tailB} chars omitted from this section] ...\n\n${t}`);
      used = sectionBudget; // section fully consumed the remainder
    } else {
      truncatedCount += sections.length - kept.length;
    }
    break;
  }

  let body = preamble + kept.join("") + postscript;
  if (truncatedCount > 0) {
    const note = `\n\n... [${truncatedCount} additional failing-test section(s) omitted for brevity — full output at in-progress/<slug>_LAST_FAILURE.txt] ...\n`;
    // Inject the note just before the postscript so the `N failed` footer
    // still closes the block.
    body = preamble + kept.join("") + note + postscript;
  }
  return body;
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
