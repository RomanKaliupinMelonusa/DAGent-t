/**
 * domain/error-signature.ts — Stable error fingerprinting.
 *
 * Produces a deterministic hash from raw error messages by stripping volatile
 * tokens (timestamps, PIDs, ports, hex hashes, paths). Enables cross-cycle
 * identity tracking: two errors with the same root cause produce the same hash.
 *
 * Pure function — zero I/O, zero side effects.
 * Keep in sync with VOLATILE_RE in pipeline-state.mjs and
 * VOLATILE_PATTERNS in triage/error-fingerprint.ts.
 */

import { createHash } from "node:crypto";

/**
 * Regex/replacement pairs for stripping volatile tokens from error messages.
 * Only universal (stack-agnostic) patterns — framework-specific normalization
 * belongs in APM triage packs.
 */
const VOLATILE_RE: ReadonlyArray<readonly [RegExp, string]> = [
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, "<TS>"],
  [/\b\d{13}\b/g, "<EPOCH>"],
  [/\bpid[=:]\d+/gi, "pid=<PID>"],
  [/:\d{4,5}\b/g, ":<PORT>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>"],
  [/\b[0-9a-f]{8,40}\b/gi, "<HEX>"],
  [/(?:\/[\w@.+-]+){2,}(?:\/[^\s'")]*)?/g, "<PATH>"],
  [/[A-Z]:\\[^\s'")\]]+/g, "<PATH>"],
  [/\b(?:worker|runner)[-_]\d+\b/gi, "<RUNNER>"],
  [/:\d+:\d+/g, ":<L>:<C>"],
];

/**
 * Compute a stable 16-hex-char fingerprint from a raw error message.
 * Strips volatile tokens, collapses whitespace, then SHA-256 hashes.
 */
export function computeErrorSignature(msg: string): string {
  let normalized = msg;
  for (const [re, repl] of VOLATILE_RE) {
    normalized = normalized.replace(re, repl);
  }
  normalized = normalized.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
