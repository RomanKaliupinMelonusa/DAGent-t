/**
 * domain/error-signature.ts — Stable error fingerprinting.
 *
 * Produces a deterministic hash from raw error messages by stripping volatile
 * tokens (timestamps, PIDs, ports, hex hashes, paths). Enables cross-cycle
 * identity tracking: two errors with the same root cause produce the same hash.
 *
 * Volatile-token patterns live in `./volatile-patterns.ts` — the single source
 * of truth consumed by this module AND by `triage/error-fingerprint.ts`.
 * Framework-specific patterns can be injected via the optional
 * `additionalPatterns` parameter (supplied from APM config).
 *
 * Pure function — zero I/O, zero side effects.
 */
import { createHash } from "node:crypto";
import { DEFAULT_VOLATILE_PATTERNS, } from "./volatile-patterns.js";
/**
 * Compute a stable 16-hex-char fingerprint from a raw error message.
 * Strips volatile tokens (defaults + optional extras), collapses whitespace,
 * then SHA-256 hashes. Extras are applied AFTER the defaults so user-supplied
 * patterns refine — not remove — baseline normalization.
 */
export function computeErrorSignature(msg, additionalPatterns) {
    let normalized = msg;
    for (const [re, repl] of DEFAULT_VOLATILE_PATTERNS) {
        normalized = normalized.replace(re, repl);
    }
    if (additionalPatterns) {
        for (const [re, repl] of additionalPatterns) {
            normalized = normalized.replace(re, repl);
        }
    }
    normalized = normalized.replace(/\s+/g, " ").trim();
    return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
//# sourceMappingURL=error-signature.js.map