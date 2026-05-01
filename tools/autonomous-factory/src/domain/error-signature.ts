/**
 * domain/error-signature.ts — Stable error fingerprinting.
 *
 * Produces a deterministic 16-hex-char hash from raw error messages by
 * stripping volatile tokens (timestamps, PIDs, ports, hex hashes, paths)
 * and SHA-256 hashing the normalised remainder. Enables cross-cycle
 * identity tracking: two errors with the same root cause produce the
 * same hash.
 *
 * Implementation uses the pure-JS `js-sha256` package rather than
 * `node:crypto` so this module is safe to import inside Temporal
 * workflow scope (the determinism ESLint rule bans `node:crypto`).
 * Output is byte-identical to a `createHash("sha256")` digest sliced
 * to 16 hex chars, so persisted `errorSignature` values produced by
 * earlier kernels remain compatible.
 *
 * Volatile-token patterns live in `./volatile-patterns.ts` — the single
 * source of truth consumed by this module AND by
 * `triage/error-fingerprint.ts`. Framework-specific patterns can be
 * injected via the optional `additionalPatterns` parameter (supplied
 * from APM config).
 *
 * Pure function — zero I/O, zero side effects.
 */

import { sha256 } from "js-sha256";
import {
  DEFAULT_VOLATILE_PATTERNS,
  type VolatilePattern,
} from "./volatile-patterns.js";

/**
 * Compute a stable 16-hex-char fingerprint from a raw error message.
 * Strips volatile tokens (defaults + optional extras), collapses whitespace,
 * then SHA-256 hashes. Extras are applied AFTER the defaults so user-supplied
 * patterns refine — not remove — baseline normalization.
 */
export function computeErrorSignature(
  msg: string,
  additionalPatterns?: ReadonlyArray<VolatilePattern>,
): string {
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
  return sha256(normalized).slice(0, 16);
}
