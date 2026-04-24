/**
 * triage/historian.ts — Prior-attempts reconstruction from errorLog.
 *
 * Pure functions that walk the persisted `errorLog` to produce a factual
 * per-cycle history of a feature run. Used in raw-context mode to replace
 * the LLM-condensed "Automated Diagnosis" blurb with evidence the dev
 * agent can trust: each prior redevelopment cycle's reset reason + the
 * error signature it produced after the fix.
 *
 * No I/O, no LLM, no git — operates purely on the supplied ErrorLogEntry[].
 */

import { RESET_OPS, REDEVELOPMENT_RESET_OPS } from "../types.js";

// Minimal errorLog entry shape — duplicated (rather than imported from
// `domain/transitions.ts`) to keep this module pure/state-shape-local.
interface HistorianLogEntry {
  readonly timestamp: string;
  readonly itemKey: string;
  readonly message: string;
  readonly errorSignature?: string | null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriorAttempt {
  /** 1-based cycle number (1 = first reset, 2 = second, ...). */
  readonly cycle: number;
  /** ISO timestamp of the reset event. */
  readonly timestamp: string;
  /** The triage reason passed into the reset (e.g. `[domain:ssr-hydration] ...`). */
  readonly resetReason: string;
  /** Signature of the failure that provoked the reset (from the preceding
   *  non-reset errorLog entry for an item that actually executed). Null
   *  when no preceding failure could be identified. */
  readonly resultingSignature: string | null;
  /** Item key of the failure that provoked this reset. */
  readonly failingItemKey: string | null;
  /** First ~400 chars of the failure message. */
  readonly errorPreview: string;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Walk `errorLog` and produce one `PriorAttempt` entry per
 * `reset-for-reroute` / redevelopment reset op, each paired with the most
 * recent preceding failure entry for a real pipeline item.
 *
 * Returned entries are ordered oldest-first.
 */
export function extractPriorAttempts(
  errorLog: readonly HistorianLogEntry[],
): PriorAttempt[] {
  const resetOps = new Set<string>([
    ...REDEVELOPMENT_RESET_OPS as readonly string[],
    RESET_OPS.RESET_FOR_REROUTE,
    RESET_OPS.RESET_PHASES,
  ]);

  const results: PriorAttempt[] = [];
  let cycle = 0;

  for (let i = 0; i < errorLog.length; i++) {
    const entry = errorLog[i];
    if (!resetOps.has(entry.itemKey)) continue;

    // Walk backward to find the most recent real-item failure (not a reset op).
    let preceding: HistorianLogEntry | undefined;
    for (let j = i - 1; j >= 0; j--) {
      const cand = errorLog[j];
      if (!resetOps.has(cand.itemKey)) {
        preceding = cand;
        break;
      }
    }

    cycle++;
    results.push({
      cycle,
      timestamp: entry.timestamp,
      resetReason: entry.message,
      resultingSignature: preceding?.errorSignature ?? null,
      failingItemKey: preceding?.itemKey ?? null,
      errorPreview: truncatePreview(preceding?.message ?? ""),
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render the prior-attempts block as markdown for injection into a
 * redevelopment dev agent's triage-handoff input. Returns an empty string when
 * no prior attempts exist (i.e. first cycle — nothing to summarize).
 */
export function buildPriorAttemptsBlock(
  errorLog: readonly HistorianLogEntry[],
): string {
  const attempts = extractPriorAttempts(errorLog);
  if (attempts.length === 0) return "";

  const lines: string[] = [];
  lines.push("## Prior attempts on this feature branch");
  lines.push("");
  lines.push(
    `You have already attempted this feature ${attempts.length} time(s). Each cycle below shows what the triage system decided and the error signature that remained after your fix. **Do not repeat the same approach twice.**`,
  );
  lines.push("");

  // Count signatures across attempts to flag recurring errors.
  const sigCounts = new Map<string, number>();
  for (const a of attempts) {
    if (a.resultingSignature) {
      sigCounts.set(a.resultingSignature, (sigCounts.get(a.resultingSignature) ?? 0) + 1);
    }
  }

  for (const a of attempts) {
    const sigTag = a.resultingSignature
      ? ` \`sig:${a.resultingSignature.slice(0, 12)}\`${
          (sigCounts.get(a.resultingSignature) ?? 1) > 1 ? " ⚠️ recurring" : ""
        }`
      : " (no signature captured)";
    lines.push(`### Cycle ${a.cycle} — ${a.timestamp}${sigTag}`);
    if (a.failingItemKey) {
      lines.push(`- **Failing item:** \`${a.failingItemKey}\``);
    }
    lines.push(`- **Triage decision:** ${truncateReason(a.resetReason)}`);
    if (a.errorPreview) {
      lines.push(`- **Resulting error preview:**`);
      lines.push("  ```");
      for (const line of a.errorPreview.split(/\r?\n/).slice(0, 10)) {
        lines.push(`  ${line}`);
      }
      lines.push("  ```");
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncatePreview(s: string, max = 400): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + " …";
}

function truncateReason(s: string, max = 240): string {
  const singleLine = s.replace(/\s+/g, " ").trim();
  if (singleLine.length <= max) return singleLine;
  return singleLine.slice(0, max) + " …";
}
