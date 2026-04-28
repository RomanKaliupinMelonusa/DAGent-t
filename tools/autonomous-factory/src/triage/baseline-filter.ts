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
): BaselineEntry[] {
  if (!entries || entries.length === 0) return [];
  const out: BaselineEntry[] = [];
  for (const e of entries) {
    if (!e || typeof e.pattern !== "string" || e.pattern.length === 0) continue;
    // When an entry declares a kind, only apply it to the matching channel.
    // Unlabelled entries fall through to every channel (conservative default).
    if (e.kind && e.kind !== kind) continue;
    out.push(e);
  }
  return out;
}

/**
 * Prepared pattern — the baseline entry's `pattern` already passed through
 * the per-channel transform, plus the raw `source_url` constraint (if any).
 * Both conditions must hold for a runtime message to be considered a match.
 */
interface PreparedPattern {
  readonly prepared: string;
  readonly sourceUrl?: string;
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
  entries: ReadonlyArray<BaselineEntry>,
  transform: (s: string) => string,
): PreparedPattern[] {
  const out: PreparedPattern[] = [];
  for (const e of entries) {
    const n = transform(e.pattern);
    if (n.length === 0) continue;
    out.push({
      prepared: n,
      sourceUrl: e.source_url && e.source_url.length > 0 ? e.source_url : undefined,
    });
  }
  return out;
}

function matchesAnyWith(
  message: string,
  preparedPatterns: readonly PreparedPattern[],
  transform: (s: string) => string,
): boolean {
  if (preparedPatterns.length === 0) return false;
  const prepared = transform(message);
  for (const p of preparedPatterns) {
    if (!prepared.includes(p.prepared)) continue;
    // Optional tightening — entry only applies when the runtime message
    // also mentions this URL fragment. Substring match on the raw (non-
    // transformed) message so URL paths survive normalisation.
    if (p.sourceUrl && !message.includes(p.sourceUrl)) continue;
    return true;
  }
  return false;
}

const IDENTITY = (s: string): string => s;

// ---------------------------------------------------------------------------
// NoiseSubtractor — shared matcher state for structured + text filters
// ---------------------------------------------------------------------------

/**
 * A prepared, per-channel noise subtraction matcher built from a
 * `BaselineProfile`. Both `filterNoise` (structured) and
 * `filterNoiseFromText` (raw narrative) delegate matching decisions
 * to a single instance so the two rendering paths cannot drift on
 * normaliser choice, channel semantics, or `source_url` scoping.
 *
 * `hasAny` is `false` when no profile was supplied or every channel
 * reduces to zero prepared patterns (e.g. all entries normalise to the
 * empty string). Callers use it to fast-path through identity returns.
 *
 * Instances are lightweight (four arrays) and safe to construct per
 * invocation — no caching needed at this scale.
 */
interface NoiseSubtractor {
  readonly hasAny: boolean;
  matchesConsole(message: string): boolean;
  matchesUncaught(message: string): boolean;
  matchesNetwork(message: string): boolean;
  /** True when either console- or uncaught-channel patterns match.
   *  Used by the text filter, which sees mixed content per line and
   *  does not know which channel a given line belongs to. */
  matchesTextChannel(message: string): boolean;
}

function createNoiseSubtractor(
  baseline: BaselineProfile | null | undefined,
): NoiseSubtractor {
  if (!baseline) {
    return {
      hasAny: false,
      matchesConsole: () => false,
      matchesUncaught: () => false,
      matchesNetwork: () => false,
      matchesTextChannel: () => false,
    };
  }
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
  // The text filter treats console+uncaught as one bucket because lines
  // in raw stdout carry no channel annotation. Deduplication by prepared
  // form keeps the combined list compact without semantic change.
  const textSeen = new Set<string>();
  const textPatterns: PreparedPattern[] = [];
  for (const p of [...consolePatterns, ...uncaughtPatterns]) {
    const key = `${p.prepared}\u0000${p.sourceUrl ?? ""}`;
    if (textSeen.has(key)) continue;
    textSeen.add(key);
    textPatterns.push(p);
  }
  const hasAny =
    consolePatterns.length > 0 ||
    uncaughtPatterns.length > 0 ||
    networkPatterns.length > 0;
  return {
    hasAny,
    matchesConsole: (m) => matchesAnyWith(m, consolePatterns, normalizeError),
    matchesUncaught: (m) => matchesAnyWith(m, uncaughtPatterns, normalizeError),
    matchesNetwork: (m) => matchesAnyWith(m, networkPatterns, IDENTITY),
    matchesTextChannel: (m) => matchesAnyWith(m, textPatterns, normalizeError),
  };
}

/**
 * Per-channel subtraction counts surfaced alongside `filterNoise`'s
 * filtered payload. Rendered into the dev-agent handoff under the
 * browser-signals block so the agent can see the filter actually did
 * its job ("Noise filtered: 14 console / 3 network / 0 uncaught").
 */
export interface BaselineDropCounts {
  readonly console: number;
  readonly network: number;
  readonly uncaught: number;
}

/**
 * Module-scoped store for the most recent `filterNoise` invocation's
 * drop counts. The triage handler calls `getLastDropCounts()` right
 * after the filter to surface the numbers without widening the pure
 * function's return type (keeping `filterNoise` drop-in compatible).
 * Not thread-safe — the orchestrator is single-threaded per feature.
 */
let _lastDropCounts: BaselineDropCounts = { console: 0, network: 0, uncaught: 0 };

/**
 * Returns the per-channel drop counts from the most recent `filterNoise`
 * call. Reset to zero on every invocation — safe to read once per
 * triage evaluation. Returns a new object each call.
 */
export function getLastDropCounts(): BaselineDropCounts {
  return { ..._lastDropCounts };
}

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
  _lastDropCounts = { console: 0, network: 0, uncaught: 0 };
  if (!baseline) return payload;
  if (!payload || typeof payload !== "object") return payload;
  if ((payload as { kind?: unknown }).kind !== "playwright-json") return payload;

  const sub = createNoiseSubtractor(baseline);
  if (!sub.hasAny) return payload;

  const pw = payload as StructuredFailure;
  const consoleErrors = pw.consoleErrors.filter((m) => !sub.matchesConsole(m));
  const failedRequests = pw.failedRequests.filter((m) => !sub.matchesNetwork(m));
  const uncaughtErrors = pw.uncaughtErrors.filter((e) => !sub.matchesUncaught(e.message));

  // Fast path — nothing actually matched. Return the original reference so
  // downstream code can detect "no filtering happened" via `===`.
  if (
    consoleErrors.length === pw.consoleErrors.length &&
    failedRequests.length === pw.failedRequests.length &&
    uncaughtErrors.length === pw.uncaughtErrors.length
  ) {
    return payload;
  }

  _lastDropCounts = {
    console: pw.consoleErrors.length - consoleErrors.length,
    network: pw.failedRequests.length - failedRequests.length,
    uncaught: pw.uncaughtErrors.length - uncaughtErrors.length,
  };

  const filtered: StructuredFailure = {
    ...pw,
    consoleErrors,
    failedRequests,
    uncaughtErrors,
  };
  return filtered;
}

// ---------------------------------------------------------------------------
// Text-level filter — for raw stdout narratives
// ---------------------------------------------------------------------------

/**
 * Strip lines from a free-form stdout blob that match baseline noise.
 * Used by `buildDownstreamFailureContextRaw` so the `## Most recent
 * failure output` narrative doesn't re-inline the same pre-feature React
 * warnings / network errors that were already subtracted from the
 * structured `🌐 Browser signals` block.
 *
 * Semantics:
 *   - `baseline` null / empty → identity (same reference).
 *   - Matching is per *line* and delegates to the same
 *     `NoiseSubtractor` the structured filter uses, guaranteeing the
 *     two paths never drift on normaliser choice or `source_url`
 *     scoping.
 *   - Returns `{ text, droppedCount }` so callers can surface a
 *     "N lines of pre-feature noise filtered" provenance footer.
 */
export function filterNoiseFromText(
  text: string,
  baseline: BaselineProfile | null | undefined,
): { text: string; droppedCount: number } {
  if (!baseline || !text) return { text, droppedCount: 0 };

  const sub = createNoiseSubtractor(baseline);
  if (!sub.hasAny) return { text, droppedCount: 0 };

  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  let droppedCount = 0;
  for (const line of lines) {
    if (sub.matchesTextChannel(line) || sub.matchesNetwork(line)) {
      droppedCount++;
      continue;
    }
    kept.push(line);
  }
  if (droppedCount === 0) return { text, droppedCount: 0 };
  return { text: kept.join("\n"), droppedCount };
}

// ---------------------------------------------------------------------------
// Shared single-message matcher — used by the LLM router to enforce the
// "baseline-only evidence cannot justify a verdict" rule. Matching semantics
// (per-channel normaliser, source_url scoping, dropped-empty-pattern guard)
// are inherited verbatim from `createNoiseSubtractor` so the structured
// filter and the router can never drift.
//
// Returns true when `message` matches any console / uncaught / network
// pattern declared in the supplied baseline. Returns false when baseline
// is null/empty or no entry applies.
// ---------------------------------------------------------------------------
export function matchesAnyBaselinePattern(
  message: string,
  baseline: BaselineProfile | null | undefined,
): boolean {
  if (!baseline || !message) return false;
  const sub = createNoiseSubtractor(baseline);
  if (!sub.hasAny) return false;
  return sub.matchesTextChannel(message) || sub.matchesNetwork(message);
}
