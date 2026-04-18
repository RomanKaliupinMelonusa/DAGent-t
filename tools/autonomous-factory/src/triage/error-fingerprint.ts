/**
 * triage/error-fingerprint.ts — Stack-agnostic error normalization and fingerprinting.
 *
 * Thin wrapper over `domain/volatile-patterns.ts` (the single source of truth)
 * and `domain/error-signature.ts`. Exposes a `normalizeError()` helper that
 * returns the human-readable normalized form, plus a `computeErrorSignature()`
 * re-export for backward compatibility with triage module consumers.
 *
 * Framework-specific patterns belong in APM config (`config.error_signature.
 * volatile_patterns`), not here.
 */

import {
  DEFAULT_VOLATILE_PATTERNS,
  type VolatilePattern,
} from "../domain/volatile-patterns.js";

export { computeErrorSignature } from "../domain/error-signature.js";

/**
 * Normalize an error message by replacing volatile tokens with stable
 * placeholders. Pattern order matches the single source of truth in
 * `domain/volatile-patterns.ts`.
 */
export function normalizeError(
  raw: string,
  additionalPatterns?: ReadonlyArray<VolatilePattern>,
): string {
  let normalized = raw;
  for (const [pattern, replacement] of DEFAULT_VOLATILE_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }
  if (additionalPatterns) {
    for (const [pattern, replacement] of additionalPatterns) {
      normalized = normalized.replace(pattern, replacement);
    }
  }
  return normalized.replace(/\s+/g, " ").trim();
}
