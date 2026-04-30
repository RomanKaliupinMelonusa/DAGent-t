/**
 * tools/autonomous-factory/scripts/pr-equivalence/normalize.mjs
 *
 * Normalizer for PR-diff byte-equivalence. Takes the raw text of a unified
 * diff (the kind `git diff` or `gh pr diff` emits) and returns a
 * deterministic, normalized string — volatile fields (timestamps, run IDs,
 * commit SHAs, UUIDs, ports, paths-with-tmp, line:col counters, runners)
 * are replaced with stable placeholders so two diffs produced by the
 * legacy and Temporal pipelines from the same input spec collapse to the
 * same byte sequence.
 *
 * Reuses `DEFAULT_VOLATILE_PATTERNS` + `compileVolatilePatterns` from
 * `src/domain/volatile-patterns.js` — the same regex set the error-
 * signature fingerprinter has used in production for months. Per the
 * Session 5 G3 brief, this is the canonical helper.
 *
 * Diff-specific normalisations on top of the volatile-pattern set:
 *   - `index <oldsha>..<newsha>` → `index <SHA>..<SHA>` (raw 7–40 hex
 *     would already match `<HEX>` but the surrounding `index ` prefix
 *     keeps the diff line shape recognisable).
 *   - `From <commit>` (mailbox-format diffs) similarly.
 *   - "On branch …" / "ref: …" header lines are stripped.
 *
 * Pure ESM, no I/O — load text via the caller (test, CLI, or harness).
 */
import {
  DEFAULT_VOLATILE_PATTERNS,
  compileVolatilePatterns,
} from "../../src/domain/volatile-patterns.js";

/**
 * Diff-shape extras applied BEFORE the default volatile-pattern sweep,
 * so they can match raw 40-hex SHAs and RFC-style date strings before
 * the default UUID/HEX/TS patterns rewrite the surrounding tokens. Each
 * is a [RegExp, replacement] tuple — same shape as
 * `DEFAULT_VOLATILE_PATTERNS`.
 */
const DIFF_EXTRAS_PRE = [
  // mailbox-format header `From <40-hex> Mon Sep 17 2026 12:00:00 +0000`
  [/^From\s+[0-9a-f]{40}\s+.*$/gm, "From <SHA> <DATE>"],
  // RFC 2822 / RFC 5322 Date header — "Date: Wed, 30 Apr 2026 06:01:08 +0000"
  [/^Date:\s+.*$/gm, "Date: <DATE>"],
  // `index 1a2b3c..4d5e6f 100644` — git diff hunk header.
  [/^index\s+[0-9a-f]+\.\.[0-9a-f]+(\s+\d+)?$/gm, "index <SHA>..<SHA>$1"],
  // Pipeline run-IDs: `run-YYYYMMDD-HHMMSS[-suffix]` (legacy + Temporal both
  // emit this shape). `\d{8}-\d{6}` stays as a literal anchor so we don't
  // collide with arbitrary numeric tokens.
  [/\brun-\d{8}-\d{6}(?:-\w+)?\b/g, "run-<RUNID>"],
];

/**
 * Diff-shape extras applied AFTER the default volatile-pattern sweep —
 * cleanup of artifacts the default pass leaves behind.
 */
const DIFF_EXTRAS_POST = [
  // strip terminal-encoded CR suffix (some patch tools emit \r at EOL)
  [/\r$/gm, ""],
];

/**
 * User-supplied extras. The orchestrator's APM config exposes the same
 * `volatile_patterns` shape; passing them here lets app teams customise
 * the harness for app-specific volatile fields (e.g. tenant IDs in
 * generated config). When omitted the harness is still useful for the
 * generic case.
 */
export function normalizeDiff(rawText, userPatterns = []) {
  if (typeof rawText !== "string") {
    throw new TypeError("normalizeDiff: input must be a string");
  }
  const compiledUser = compileVolatilePatterns(userPatterns);

  let out = rawText;
  for (const [re, repl] of DIFF_EXTRAS_PRE) {
    out = out.replace(re, repl);
  }
  for (const [re, repl] of DEFAULT_VOLATILE_PATTERNS) {
    out = out.replace(re, repl);
  }
  for (const [re, repl] of DIFF_EXTRAS_POST) {
    out = out.replace(re, repl);
  }
  for (const [re, repl] of compiledUser) {
    out = out.replace(re, repl);
  }

  // Trailing-whitespace + final-newline canonicalization. Two diffs that
  // agree everywhere except in the presence/absence of a trailing
  // newline should still be byte-equal post-normalization.
  out = out
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
  if (!out.endsWith("\n")) out += "\n";
  return out;
}

/**
 * Compare two raw diff strings. Returns `{equal, normalized: {a, b}}`.
 * The `normalized` payload is included so a CI failure can dump the
 * canonicalized forms side-by-side rather than the raw inputs.
 */
export function compareDiffs(a, b, userPatterns = []) {
  const normalizedA = normalizeDiff(a, userPatterns);
  const normalizedB = normalizeDiff(b, userPatterns);
  return {
    equal: normalizedA === normalizedB,
    normalized: { a: normalizedA, b: normalizedB },
  };
}
