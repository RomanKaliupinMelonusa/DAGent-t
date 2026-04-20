/**
 * triage/baseline-filter.ts — Subtract pre-feature baseline noise from a
 * structured Playwright failure.
 *
 * Called once by the triage handler immediately before classification.
 * When a baseline is present and one of its entries matches a console /
 * network / uncaught signal in the failing payload, that signal is
 * dropped from the payload passed to `classifyStructuredFailure`.
 *
 * Matching strategy — per-channel, normalised substring:
 *   - **console / uncaught channels**: both the baseline pattern and the
 *     runtime message are run through `normalizeError()`. That strips
 *     volatile tokens (timestamps, UUIDs, PIDs, durations, stack paths,
 *     line/column numbers) so cosmetic drift between baseline capture
 *     and the actual test run does not defeat the filter.
 *   - **network channel**: raw substring match. URL paths ARE the
 *     signal in this channel — sending them through the path-collapsing
 *     normaliser would make every URL match every other URL.
 *
 *   A baseline entry matches when the (per-channel-prepared) runtime
 *   message *contains* the (per-channel-prepared) pattern. This keeps
 *   the natural "pattern is a fragment of the full error" semantics.
 *
 * Design constraints:
 *   - Pure function. No I/O. No side effects.
 *   - Identity when baseline is null, empty, or the payload is not a
 *     playwright-json shape.
 *   - Non-recognised payloads pass through unchanged (future structured
 *     formats extend additively).
 *
 * The original payload is never mutated; a shallow-copied result is
 * returned so callers can retain the pre-filter object for telemetry.
 */

import type { StructuredFailure } from "./playwright-report.js";
import type { BaselineEntry, BaselineProfile } from "../ports/baseline-loader.js";
import { normalizeError } from "./error-fingerprint.js";

function collectPatterns(
  entries: ReadonlyArray<BaselineEntry> | undefined,
  kind: "console" | "uncaught" | "network",
): string[] {
  if (!entries || entries.length === 0) return [];
  const out: string[] = [];
  for (const e of entries) {
    if (!e || typeof e.pattern !== "string" || e.pattern.length === 0) continue;
    // When an entry declares a kind, only apply it to the matching channel.
    // Unlabelled entries fall through to every channel (conservative default).
    if (e.kind && e.kind !== kind) continue;
    out.push(e.pattern);
  }
  return out;
}

/**
 * Normalise a set of raw baseline patterns once, so the filter does not
 * re-normalise them for every runtime message it tests. Empty normalised
 * forms are dropped — a pattern that reduces to the empty string after
 * stripping volatile tokens would match every message and must be
 * ignored as malformed input.
 *
 * `transform` is the per-channel preparation function: either
 * `normalizeError` (console / uncaught) or identity (network).
 */
function preparePatterns(
  patterns: readonly string[],
  transform: (s: string) => string,
): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    const n = transform(p);
    if (n.length > 0) out.push(n);
  }
  return out;
}

function matchesAnyWith(
  message: string,
  preparedPatterns: readonly string[],
  transform: (s: string) => string,
): boolean {
  if (preparedPatterns.length === 0) return false;
  const prepared = transform(message);
  for (const p of preparedPatterns) {
    if (prepared.includes(p)) return true;
  }
  return false;
}

const IDENTITY = (s: string): string => s;

/**
 * Return a copy of `payload` with baseline-noise signals stripped.
 *
 * When `baseline` is null / the payload shape is unknown / no entries
 * match, returns the input unchanged (reference-equal) so callers can
 * cheaply detect no-ops.
 */
export function filterNoise(
  payload: unknown,
  baseline: BaselineProfile | null | undefined,
): unknown {
  if (!baseline) return payload;
  if (!payload || typeof payload !== "object") return payload;
  if ((payload as { kind?: unknown }).kind !== "playwright-json") return payload;

  // Aggregate per-channel patterns. Channel-specific + unlabelled entries
  // combine at the channel boundary. Patterns are prepared once here so
  // the inner loop only prepares each runtime message.
  // Console + uncaught go through the full volatile-token normaliser.
  // Network URLs stay raw — path collapsing would ruin URL specificity.
  const consolePatterns = preparePatterns(
    [
      ...collectPatterns(baseline.console_errors, "console"),
      ...collectPatterns(baseline.uncaught_exceptions, "console"), // harmless cross-apply
    ],
    normalizeError,
  );
  const uncaughtPatterns = preparePatterns(
    collectPatterns(baseline.uncaught_exceptions, "uncaught"),
    normalizeError,
  );
  const networkPatterns = preparePatterns(
    collectPatterns(baseline.network_failures, "network"),
    IDENTITY,
  );

  if (
    consolePatterns.length === 0 &&
    uncaughtPatterns.length === 0 &&
    networkPatterns.length === 0
  ) {
    return payload;
  }

  const pw = payload as StructuredFailure;
  const consoleErrors = pw.consoleErrors.filter(
    (m) => !matchesAnyWith(m, consolePatterns, normalizeError),
  );
  const failedRequests = pw.failedRequests.filter(
    (m) => !matchesAnyWith(m, networkPatterns, IDENTITY),
  );
  const uncaughtErrors = pw.uncaughtErrors.filter(
    (e) => !matchesAnyWith(e.message, uncaughtPatterns, normalizeError),
  );

  // Fast path — nothing actually matched. Return the original reference so
  // downstream code can detect "no filtering happened" via `===`.
  if (
    consoleErrors.length === pw.consoleErrors.length &&
    failedRequests.length === pw.failedRequests.length &&
    uncaughtErrors.length === pw.uncaughtErrors.length
  ) {
    return payload;
  }

  const filtered: StructuredFailure = {
    ...pw,
    consoleErrors,
    failedRequests,
    uncaughtErrors,
  };
  return filtered;
}
