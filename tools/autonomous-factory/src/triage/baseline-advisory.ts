/**
 * triage/baseline-advisory.ts — Render a compact "known pre-feature noise"
 * advisory for dispatch-time injection into agent task prompts.
 *
 * The baseline-analyzer node captures console / network / uncaught errors
 * on the feature's target pages BEFORE any code is written. That profile is
 * used in two places:
 *
 *   1. Triage (post-failure): `baseline-filter.ts` subtracts known-noise
 *      lines from structured failures and raw stdout.
 *
 *   2. Dispatch (pre-work, here): the dev agent is told up-front what
 *      warnings / errors pre-date its work, so it doesn't chase red
 *      herrings during its initial implementation pass.
 *
 * The advisory is intentionally short (bounded by `MAX_PATTERNS_PER_KIND`)
 * — it's context, not a log dump. The full baseline lives at
 * `<appRoot>/.dagent/<slug>_BASELINE.json` for agents that want to
 * inspect it directly.
 *
 * Pure — no I/O. Returns empty string when the baseline is absent so the
 * caller can unconditionally append the result.
 */

import type { BaselineProfile, BaselineEntry } from "../ports/baseline-loader.js";
import { featureRelPath } from "../adapters/feature-paths.js";

/** Cap per channel so the advisory stays compact. */
const MAX_PATTERNS_PER_KIND = 6;
/** Cap per-line length so a single pattern can't blow the block up. */
const MAX_PATTERN_CHARS = 140;

function clip(s: string, max = MAX_PATTERN_CHARS): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

function renderEntries(
  label: string,
  entries: ReadonlyArray<BaselineEntry> | undefined,
): string[] {
  if (!entries || entries.length === 0) return [];
  const lines: string[] = [`**${label}:**`];
  const shown = entries.slice(0, MAX_PATTERNS_PER_KIND);
  for (const e of shown) {
    const src = e.source_page ? ` _(${e.source_page})_` : "";
    lines.push(`- \`${clip(e.pattern)}\`${src}`);
  }
  if (entries.length > shown.length) {
    lines.push(`- _…and ${entries.length - shown.length} more_`);
  }
  return lines;
}

/**
 * Render a markdown block warning the agent about pre-feature platform
 * noise. Returns an empty string when the baseline is null or has no
 * entries across any channel (→ caller appends nothing).
 *
 * When `currentBaseSha` is supplied and does not match `baseline.base_sha`,
 * a staleness banner is appended to warn the agent that the noise profile
 * may not reflect the current state of the base branch.
 */
export function formatBaselineAdvisory(
  baseline: BaselineProfile | null | undefined,
  slug: string,
  currentBaseSha?: string,
): string {
  if (!baseline) return "";
  const totalEntries =
    (baseline.console_errors?.length ?? 0) +
    (baseline.network_failures?.length ?? 0) +
    (baseline.uncaught_exceptions?.length ?? 0);
  if (totalEntries === 0) return "";

  const parts: string[] = [];
  parts.push("\n\n## Known pre-feature platform noise");
  parts.push("");
  // Freshness banner — when the baseline was captured against a different
  // base-branch sha, warn the agent that the profile may be stale.
  if (
    currentBaseSha &&
    baseline.base_sha &&
    baseline.base_sha !== currentBaseSha
  ) {
    parts.push(
      `> ⚠️ **Baseline may be stale** — captured at \`${baseline.base_sha.slice(0, 12)}\`, ` +
      `base branch is now at \`${currentBaseSha.slice(0, 12)}\`. Some entries below ` +
      "may no longer exist on the target pages; treat them as *hints*, not absolutes.",
    );
    parts.push("");
  }
  parts.push(
    "The `baseline-analyzer` step captured the following errors on the target " +
    "pages **before** any code was written for this feature. Treat these as " +
    "background noise — they are **not** caused by your changes and do not " +
    "need to be fixed as part of this task.",
  );
  parts.push("");

  const console = renderEntries("Console errors", baseline.console_errors);
  const network = renderEntries("Network failures", baseline.network_failures);
  const uncaught = renderEntries("Uncaught exceptions", baseline.uncaught_exceptions);
  parts.push(...console);
  if (console.length && (network.length || uncaught.length)) parts.push("");
  parts.push(...network);
  if (network.length && uncaught.length) parts.push("");
  parts.push(...uncaught);

  parts.push("");
  parts.push(
    `> Full baseline: \`<appRoot>/${featureRelPath(slug, "baseline")}\`.`,
  );

  return parts.join("\n");
}
