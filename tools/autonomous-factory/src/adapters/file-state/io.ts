/**
 * adapters/file-state/io.ts — File I/O for the JSON file state adapter.
 *
 * TypeScript port of `pipeline-state/io.mjs`. The single source of truth for:
 *  - REPO_ROOT / APP_ROOT / IN_PROGRESS path resolution
 *  - state/TRANS path helpers
 *  - readState / writeState (sync; state files are small)
 *  - renderTrans (regenerates _TRANS.md from _STATE.json on every write)
 *  - backfillCycleCounters (one-release legacy migration)
 *
 * Synchronous on purpose — state files are tiny (<10 KB) and the adapter
 * must hold a lock across read→mutate→write cycles. Async would force
 * the lock primitive to be promise-aware for no real benefit.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { PipelineState } from "../../types.js";

// ─── Path constants ─────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Repo root: this file lives at tools/autonomous-factory/src/adapters/file-state/io.ts → repo is four levels up. */
export const REPO_ROOT = join(__dirname, "../../../../..");
/** App root: defaults to repo root unless APP_ROOT env var is set. */
export const APP_ROOT = process.env.APP_ROOT
  ? (isAbsolute(process.env.APP_ROOT) ? process.env.APP_ROOT : join(REPO_ROOT, process.env.APP_ROOT))
  : REPO_ROOT;
export const IN_PROGRESS = join(APP_ROOT, "in-progress");

// ─── Path helpers ───────────────────────────────────────────────────────────

export function statePath(slug: string): string {
  return join(IN_PROGRESS, `${slug}_STATE.json`);
}

export function transPath(slug: string): string {
  return join(IN_PROGRESS, `${slug}_TRANS.md`);
}

export function today(): string {
  return new Date().toISOString();
}

// ─── State I/O ──────────────────────────────────────────────────────────────

/**
 * Read state, throwing if the file does not exist.
 * Returns `null` callers should use `readStateOrNull` instead.
 */
export function readStateOrThrow(slug: string): PipelineState {
  const p = statePath(slug);
  if (!existsSync(p)) {
    throw new Error(`State file not found: ${p}`);
  }
  const raw = JSON.parse(readFileSync(p, "utf-8")) as PipelineState & { workflowType?: string };
  // Backward compat: alias workflowType → workflowName for in-flight state files.
  if (raw.workflowType && !raw.workflowName) {
    raw.workflowName = raw.workflowType;
  }
  backfillCycleCounters(raw);
  return raw;
}

/** Read state, returning `null` if the file does not exist. */
export function readStateOrNull(slug: string): PipelineState | null {
  const p = statePath(slug);
  if (!existsSync(p)) return null;
  return readStateOrThrow(slug);
}

/** Write state (atomically replaces the file) and regenerates TRANS.md. */
export function writeState(slug: string, state: PipelineState): void {
  writeFileSync(statePath(slug), JSON.stringify(state, null, 2) + "\n", "utf-8");
  renderTrans(slug, state);
}

// ─── Cycle counter back-fill ────────────────────────────────────────────────

/**
 * One-release backfill: older _STATE.json files encode reset cycle counts as
 * pseudo-entries in errorLog. New state carries a typed `cycleCounters` object.
 * Safe to call on fresh state — a no-op once `cycleCounters` exists.
 */
export function backfillCycleCounters(
  state: PipelineState & { cycleCounters?: Record<string, number> },
): void {
  if (state.cycleCounters) return;
  const counters: Record<string, number> = {};
  for (const entry of state.errorLog ?? []) {
    const k = entry.itemKey;
    if (
      k === "resume-elevated" ||
      k === "reset-nodes" ||
      k === "reset-for-dev" ||
      k === "reset-for-redeploy" ||
      k === "reset-phases" ||
      (typeof k === "string" && k.startsWith("reset-scripts:"))
    ) {
      counters[k] = (counters[k] ?? 0) + 1;
    }
  }
  state.cycleCounters = counters;
}

// ─── TRANS.md renderer ──────────────────────────────────────────────────────

/** Render the human-readable TRANS.md from state. */
function renderTrans(slug: string, state: PipelineState): void {
  const lines: string[] = [];
  lines.push(`# Transition Log — ${state.feature}`);
  lines.push("");
  lines.push("## Workflow");
  lines.push(`- **Workflow:** ${state.workflowName}`);
  lines.push(`- **Started:** ${state.started}`);
  lines.push(`- **Deployed URL:** ${state.deployedUrl || "[To be filled after deployment]"}`);
  lines.push("");
  lines.push("## Implementation Notes");
  lines.push(state.implementationNotes || "[To be filled by Dev agents during implementation]");
  lines.push("");
  lines.push("## Checklist");

  for (const item of state.items) {
    const box =
      item.status === "done"    ? "[x]" :
      item.status === "na"      ? "[x] [N/A]" :
      item.status === "failed"  ? "[ ] ⚠️" :
      item.status === "dormant" ? "[ ] 💤" :
      "[ ]";
    lines.push(`- ${box} ${item.label} (${item.agent})`);
  }

  lines.push("");
  lines.push("## Error Log");
  if (state.errorLog.length === 0) {
    lines.push("[No errors recorded]");
  } else {
    for (const entry of state.errorLog) {
      lines.push(`### ${entry.timestamp} — ${entry.itemKey}`);
      lines.push(entry.message);
      lines.push("");
    }
  }

  lines.push("");
  lines.push("> ⚠️ This file is auto-generated by `npm run pipeline:status`. Do not edit manually.");
  lines.push("");
  writeFileSync(transPath(slug), lines.join("\n"), "utf-8");
}
