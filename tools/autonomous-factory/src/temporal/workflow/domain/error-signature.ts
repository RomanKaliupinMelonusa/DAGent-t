/**
 * domain/error-signature.ts — Stable error fingerprinting (workflow scope).
 *
 * Workflow-safe twin of `src/domain/error-signature.ts`. The legacy version
 * imports `node:crypto`, which is forbidden in workflow code (non-deterministic
 * across worker hosts and banned by the Temporal determinism ESLint rule).
 *
 * This copy replaces `createHash("sha256")` with the pure-JS `js-sha256`
 * implementation. Output format is identical (16-hex-char prefix of a
 * SHA-256 digest), so persisted `errorSignature` values produced by the
 * legacy kernel remain byte-compatible after the Session 5 cutover —
 * `halt_on_identical` history is preserved across the migration.
 *
 * Volatile-token patterns live in `./volatile-patterns.ts` — the single
 * source of truth shared with the legacy domain layer.
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
 *
 * Output is byte-identical to `src/domain/error-signature.ts#computeErrorSignature`
 * for the same input — both implementations hash the same normalized string
 * with SHA-256 and slice 16 hex chars.
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
