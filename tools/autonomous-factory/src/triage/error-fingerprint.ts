/**
 * triage/error-fingerprint.ts — Stack-agnostic error normalization and fingerprinting.
 *
 * Produces a stable hash ("error signature") from a raw error message by stripping
 * volatile tokens (timestamps, PIDs, ports, hex hashes, absolute paths, runner IDs).
 * Two errors with the same root cause but different ephemeral data produce the same
 * fingerprint, enabling cross-cycle identity tracking in the triage system.
 */

import { createHash } from "node:crypto";

// Patterns for volatile tokens that change across retries but don't affect root cause.
// IMPORTANT: These patterns must be truly universal (stack-agnostic). Tool-specific
// or framework-specific normalization belongs in APM triage packs, not here.
// Keep in sync with the inline VOLATILE_RE in pipeline-state.mjs.
const VOLATILE_PATTERNS: Array<[RegExp, string]> = [
  // ISO timestamps: 2026-04-13T20:32:53.346Z
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, "<TS>"],
  // Unix timestamps (ms): 1713045173346
  [/\b\d{13}\b/g, "<EPOCH>"],
  // PIDs, ports: pid=12345, :3000, :3001
  [/\bpid[=:]\d+/gi, "pid=<PID>"],
  [/:\d{4,5}\b/g, ":<PORT>"],
  // UUIDs (must run before HEX to match the full token)
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>"],
  // Hex hashes (SHAs, commit refs) — runs after UUID
  [/\b[0-9a-f]{8,40}\b/gi, "<HEX>"],
  // Absolute paths — any Unix path with 2+ segments or any Windows drive path
  [/(?:\/[\w@.+-]+){2,}(?:\/[^\s'")]*)?/g, "<PATH>"],
  [/[A-Z]:\\[^\s'")]+/g, "<PATH>"],
  // Runner/worker IDs: worker-0, runner-1234
  [/\b(?:worker|runner)[-_]\d+\b/gi, "<RUNNER>"],
  // Line numbers in stack traces: :8565:35
  [/:\d+:\d+/g, ":<L>:<C>"],
];

/**
 * Normalize an error message by replacing volatile tokens with stable placeholders.
 * The normalization is order-independent — patterns are applied sequentially.
 */
export function normalizeError(raw: string): string {
  let normalized = raw;
  for (const [pattern, replacement] of VOLATILE_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }
  // Collapse whitespace runs
  return normalized.replace(/\s+/g, " ").trim();
}

/**
 * Produce a stable SHA-256 fingerprint (hex, first 16 chars) from a raw error message.
 * Two errors with the same root cause but different ephemeral tokens produce the same hash.
 */
export function computeErrorSignature(raw: string): string {
  const normalized = normalizeError(raw);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
