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
/**
 * Built-in stack-agnostic patterns. The order matters — UUID runs before
 * generic HEX so the full UUID is captured; path patterns run late so
 * path-like tokens inside other patterns aren't swallowed.
 */
export const DEFAULT_VOLATILE_PATTERNS = [
    [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, "<TS>"],
    [/\b\d{13}\b/g, "<EPOCH>"],
    [/\bpid[=:]\d+/gi, "pid=<PID>"],
    // POSIX-style "PID 4185" (space separator) — common in shell hook output.
    [/\bPID\s+\d+/g, "PID <PID>"],
    // Node.js deprecation/warning line prefix "(node:4206)".
    [/\bnode:\d+/g, "node:<N>"],
    [/:\d{4,5}\b/g, ":<PORT>"],
    [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>"],
    [/\b[0-9a-f]{8,40}\b/gi, "<HEX>"],
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
export function compileVolatilePatterns(raw) {
    if (!raw || raw.length === 0)
        return [];
    const compiled = [];
    for (let i = 0; i < raw.length; i++) {
        const entry = raw[i];
        const flags = entry.flags ?? "g";
        try {
            compiled.push([new RegExp(entry.pattern, flags), entry.replacement]);
        }
        catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            throw new Error(`volatile_patterns[${i}]: invalid regex /${entry.pattern}/${flags} — ${reason}`);
        }
    }
    return compiled;
}
/**
 * Merge two pattern lists into a single ordered sequence.
 * Defaults run first so user patterns can refine — but not remove —
 * baseline normalization.
 */
export function mergeVolatilePatterns(...lists) {
    const out = [];
    for (const list of lists) {
        for (const p of list)
            out.push(p);
    }
    return out;
}
//# sourceMappingURL=volatile-patterns.js.map