/**
 * domain/volatile-patterns.ts — Single source of truth for error-fingerprint
 * volatile-token patterns.
 *
 * "Volatile" tokens are the parts of an error message that change between
 * retries but don't affect the root cause (timestamps, PIDs, ports, UUIDs,
 * hex hashes, absolute paths, line/col numbers, …). Stripping them produces
 * a stable error signature that survives cross-cycle comparison.
 *
 * Policy:
 *   - `DEFAULT_VOLATILE_PATTERNS` is the built-in, stack-agnostic baseline.
 *   - Framework-specific patterns (session tokens, Playwright test UUIDs,
 *     cloud-provider resource ARNs, etc.) belong in config — declared per
 *     workflow and/or per node — and are merged on top of the baseline.
 *
 * Pure — no I/O, no side effects.
 */

/** A volatile-token rule: regex + replacement token. */
export type VolatilePattern = readonly [RegExp, string];

/** User-supplied pattern from YAML/JSON config — compiled to a VolatilePattern. */
export interface ConfiguredVolatilePattern {
  /** Regex source (without surrounding slashes). */
  readonly pattern: string;
  /** Optional regex flags (defaults to "g"). */
  readonly flags?: string;
  /** Replacement token. */
  readonly replacement: string;
}

/**
 * Built-in stack-agnostic patterns. The order matters — UUID runs before
 * generic HEX so the full UUID is captured; path patterns run late so
 * path-like tokens inside other patterns aren't swallowed.
 */
export const DEFAULT_VOLATILE_PATTERNS: ReadonlyArray<VolatilePattern> = [
  // ISO timestamp (with trailing Z required) — runs first so it's not
  // partially eaten by other rules. Re-asserted on top of the legacy
  // optional-Z rule (kept below for back-compat with non-Z timestamps).
  [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, "<ISO>"],
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, "<TS>"],
  [/\b\d{13}\b/g, "<EPOCH>"],
  [/\bpid[=:]\d+/gi, "pid=<PID>"],
  // POSIX-style "PID 4185" (space separator) — common in shell hook output.
  [/\bPID\s+\d+/g, "PID <PID>"],
  // Node.js deprecation/warning line prefix "(node:4206)".
  [/\bnode:\d+/g, "node:<N>"],
  [/:\d{4,5}\b/g, ":<PORT>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>"],
  // Invocation IDs (Crockford base32 with a fixed `inv_` prefix) —
  // canonical engine-side identifier; runs before generic SHA so we
  // capture the full token.
  [/\binv_[0-9A-Z]{26}\b/g, "<INV>"],
  // Git commit SHAs (7-char abbrev + full 40-char). Runs before the
  // generic HEX rule so commit SHAs become `<SHA>` (semantic) rather
  // than `<HEX>`.
  [/\b[0-9a-f]{7,40}\b/g, "<SHA>"],
  [/\b[0-9a-f]{8,40}\b/gi, "<HEX>"],
  // Git diff `--shortstat` summaries. Runs before the path rule so the
  // bare numbers don't masquerade as ports/lines/columns elsewhere.
  [/\b\d+ files? changed,\s*\d+ insertions?\(\+\)(?:,\s*\d+ deletions?\(-\))?/g, "<DIFFSTAT>"],
  [/(?:\/[\w@.+-]+){2,}(?:\/[^\s'")]*)?/g, "<PATH>"],
  [/[A-Z]:\\[^\s'")\]]+/g, "<PATH>"],
  [/\b(?:worker|runner)[-_]\d+\b/gi, "<RUNNER>"],
  [/:\d+:\d+/g, ":<L>:<C>"],
];

/**
 * Compile a list of user-supplied patterns (from YAML config) into
 * runtime `VolatilePattern`s. Invalid regex sources throw with a clear
 * diagnostic so the compile-time APM validator can surface bad config
 * early rather than silently ignoring it at fingerprint time.
 */
export function compileVolatilePatterns(
  raw: ReadonlyArray<ConfiguredVolatilePattern> | undefined,
): VolatilePattern[] {
  if (!raw || raw.length === 0) return [];
  const compiled: VolatilePattern[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i]!;
    const flags = entry.flags ?? "g";
    try {
      compiled.push([new RegExp(entry.pattern, flags), entry.replacement]);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `volatile_patterns[${i}]: invalid regex /${entry.pattern}/${flags} — ${reason}`,
      );
    }
  }
  return compiled;
}

/**
 * Merge two pattern lists into a single ordered sequence.
 * Defaults run first so user patterns can refine — but not remove —
 * baseline normalization.
 */
export function mergeVolatilePatterns(
  ...lists: ReadonlyArray<ReadonlyArray<VolatilePattern>>
): VolatilePattern[] {
  const out: VolatilePattern[] = [];
  for (const list of lists) {
    for (const p of list) out.push(p);
  }
  return out;
}
