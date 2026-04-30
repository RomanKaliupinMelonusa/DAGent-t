/**
 * src/temporal/reporting/render-trans.ts — On-demand `_TRANS.md` renderer.
 *
 * Per locked decision **D-S4-2**, the legacy "write `_TRANS.md` along
 * the way" pattern is gone. Under Temporal the workflow itself is the
 * authoritative state; `_TRANS.md` becomes a *projection* that anyone
 * can render on demand by invoking the workflow's `stateQuery` and
 * (optionally) `summaryQuery`.
 *
 * This module is the pure renderer — input is a `StateSnapshot`
 * (`+ SummarySnapshot`); output is the markdown text. No I/O, no
 * Temporal client. The CLI in
 * [src/temporal/client/render-trans.ts](../client/render-trans.ts)
 * does the network round-trip.
 *
 * Contract:
 *   • Stable, line-oriented output suitable for diff-friendly review.
 *   • Status icons match the legacy renderer where reasonable.
 *   • Truncates `errorLog` messages at 240 chars to keep the report
 *     scannable; full messages remain in the workflow query.
 */

import type { StateSnapshot, SummarySnapshot, ItemProgress } from "../workflow/queries.js";

const STATUS_ICON: Record<ItemProgress["status"], string> = {
  done: "✓",
  failed: "✗",
  "in-progress": "⟳",
  pending: "·",
  na: "—",
  dormant: "z",
};

const ERROR_TRUNC = 240;

export interface RenderTransOptions {
  /** ISO-8601 timestamp injected into the header. Defaults to `new Date().toISOString()`. */
  readonly nowIso?: string;
  /** Optional summary projection — when provided, the header gains the
   *  status banner line and pending-approval count. */
  readonly summary?: SummarySnapshot;
}

export function renderTransMd(
  state: StateSnapshot,
  options: RenderTransOptions = {},
): string {
  const nowIso = options.nowIso ?? new Date().toISOString();
  const summary = options.summary;

  const lines: string[] = [
    `# Pipeline Transitions — ${state.feature}`,
    ``,
    `> Rendered on demand from Temporal workflow state at ${nowIso}.`,
    `> Workflow: \`${state.workflowName}\` · Started: ${state.started}`,
    ``,
  ];

  if (summary) {
    lines.push(
      `## Status: \`${summary.status}\` (batch ${summary.batchNumber})`,
      ``,
    );
  } else {
    const tags: string[] = [];
    if (state.cancelled) tags.push(`cancelled${state.cancelReason ? ` — ${state.cancelReason}` : ""}`);
    if (state.held) tags.push("held");
    lines.push(`## Status: ${tags.length > 0 ? tags.join(", ") : "running"}`, ``);
  }

  // ── Totals table ───────────────────────────────────────────────
  const totals = countByStatus(state.items);
  lines.push(
    `| Metric | Value |`,
    `|---|---|`,
    `| Total items | ${state.items.length} |`,
    `| Done | ${totals.done} |`,
    `| In-progress | ${totals["in-progress"]} |`,
    `| Failed | ${totals.failed} |`,
    `| Pending | ${totals.pending} |`,
    `| N/A | ${totals.na} |`,
    `| Dormant | ${totals.dormant} |`,
    ...(summary ? [`| Pending approvals | ${summary.pendingApprovals} |`] : []),
    ``,
  );

  // ── Per-item progression ───────────────────────────────────────
  lines.push(`## Items`, ``);
  for (const item of state.items) {
    const icon = STATUS_ICON[item.status];
    const agent = item.agent ? ` · agent=\`${item.agent}\`` : "";
    lines.push(`- ${icon} \`${item.key}\` — ${item.label}${agent} (${item.status})`);
  }
  lines.push(``);

  // ── Error log ──────────────────────────────────────────────────
  if (state.errorLog.length > 0) {
    lines.push(`## Errors`, ``);
    for (const err of state.errorLog) {
      const msg = err.message.length > ERROR_TRUNC
        ? `${err.message.slice(0, ERROR_TRUNC)}…`
        : err.message;
      lines.push(`- \`${err.itemKey}\` @ ${err.timestamp}`);
      lines.push(`  > ${msg.replace(/\n/g, " ")}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

function countByStatus(
  items: readonly ItemProgress[],
): Record<ItemProgress["status"], number> {
  const counts: Record<ItemProgress["status"], number> = {
    pending: 0,
    "in-progress": 0,
    done: 0,
    failed: 0,
    na: 0,
    dormant: 0,
  };
  for (const item of items) counts[item.status]++;
  return counts;
}
