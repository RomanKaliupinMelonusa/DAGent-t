/**
 * kernel/invocation-id.ts — Time-sortable invocation identifiers.
 *
 * The Artifact Bus assigns one `invocationId` per dispatch. The identifier
 * must be:
 *   1. Unique across parallel dispatches in the same pipeline run.
 *   2. Lexicographically ordered by creation time, so directory listings
 *      under `.dagent/<slug>/<nodeKey>/` sort chronologically without
 *      needing to parse `meta.json` timestamps.
 *   3. Filesystem-safe (no slashes, colons, or case-folding ambiguity).
 *   4. Portable — no external dependency.
 *
 * Implementation: ULID-style — 10-char base32 timestamp (48-bit, millisecond
 * precision) + 16-char base32 randomness (80-bit). Total 26 chars, matches
 * Crockford's Base32 alphabet (no I, L, O, U to avoid visual confusion).
 *
 * Not a full ULID implementation (no monotonic guarantee within the same
 * millisecond); collision probability is ~1 in 2^80 per ms, safely below
 * any conceivable dispatch rate. Adopt the `ulid` package if/when we need
 * monotonic same-ms ordering.
 */

import { randomBytes } from "node:crypto";

const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
const ENCODING_LEN = ENCODING.length; // 32
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    throw new Error(`invocation-id: invalid timestamp ${ms}`);
  }
  let out = "";
  let t = Math.floor(ms);
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = t % ENCODING_LEN;
    out = ENCODING[mod] + out;
    t = (t - mod) / ENCODING_LEN;
  }
  return out;
}

function encodeRandom(): string {
  // 16 base32 chars carry 80 bits. Draw 10 random bytes and map every 5 bits.
  const bytes = randomBytes(10);
  let bits = 0;
  let bitCount = 0;
  let out = "";
  for (const b of bytes) {
    bits = (bits << 8) | b;
    bitCount += 8;
    while (bitCount >= 5) {
      bitCount -= 5;
      const idx = (bits >> bitCount) & 0b11111;
      out += ENCODING[idx];
    }
  }
  return out;
}

/**
 * Create a new `invocationId` using the current wall clock.
 * Length: 26 characters, `[0-9A-HJKMNPQ-TV-Z]+`, prefixed by `inv_`.
 */
export function newInvocationId(now: number = Date.now()): string {
  return `inv_${encodeTime(now)}${encodeRandom()}`;
}

/** `true` when the string matches the shape emitted by `newInvocationId`. */
export function isInvocationId(value: string): boolean {
  if (!value.startsWith("inv_")) return false;
  const body = value.slice(4);
  if (body.length !== TIME_LEN + RANDOM_LEN) return false;
  for (const ch of body) {
    if (!ENCODING.includes(ch)) return false;
  }
  return true;
}
