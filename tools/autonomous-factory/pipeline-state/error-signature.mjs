/**
 * pipeline-state/error-signature.mjs — Stable error fingerprinting.
 *
 * Produces a stable fingerprint from a raw error message by stripping volatile
 * tokens (timestamps, PIDs, ports, hex hashes, paths). Enables cross-cycle
 * identity tracking: two errors with the same root cause produce the same hash.
 * Keep in sync with VOLATILE_PATTERNS in src/triage/error-fingerprint.ts.
 * Only universal (stack-agnostic) patterns here — framework-specific
 * normalization belongs in APM triage packs.
 */

import { createHash } from "node:crypto";

const VOLATILE_RE = [
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, "<TS>"],
  [/\b\d{13}\b/g, "<EPOCH>"],
  [/\bpid[=:]\d+/gi, "pid=<PID>"],
  [/:\d{4,5}\b/g, ":<PORT>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>"],
  [/\b[0-9a-f]{8,40}\b/gi, "<HEX>"],
  [/(?:\/[\w@.+-]+){2,}(?:\/[^\s'")]*)?/g, "<PATH>"],
  [new RegExp("[A-Z]:\\\\[^\\s'\")]+", "g"), "<PATH>"],
  [/\b(?:worker|runner)[-_]\d+\b/gi, "<RUNNER>"],
  [/:\d+:\d+/g, ":<L>:<C>"],
];

export function computeErrorSignature(msg) {
  let n = msg;
  for (const [re, repl] of VOLATILE_RE) n = n.replace(re, repl);
  n = n.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(n).digest("hex").slice(0, 16);
}
