/**
 * pipeline-state/io.mjs — Path resolution, state file I/O, TRANS renderer.
 *
 * Single source of truth for:
 *  - REPO_ROOT / APP_ROOT / IN_PROGRESS constants
 *  - state/TRANS path helpers
 *  - readState / readStateOrThrow / writeState
 *  - renderTrans (regenerates _TRANS.md from _STATE.json on every write)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Path constants ─────────────────────────────────────────────────────────

/** Directory of this file (pipeline-state/io.mjs). */
const __dirname = dirname(fileURLToPath(import.meta.url));
/** Repo root: this file lives at tools/autonomous-factory/pipeline-state/io.mjs → repo is three levels up */
export const REPO_ROOT = join(__dirname, "../../..");
/** App root: defaults to repo root unless APP_ROOT env var is set. */
export const APP_ROOT = process.env.APP_ROOT
  ? (process.env.APP_ROOT.startsWith("/") ? process.env.APP_ROOT : join(REPO_ROOT, process.env.APP_ROOT))
  : REPO_ROOT;
export const IN_PROGRESS = join(APP_ROOT, "in-progress");

// ─── File path helpers ──────────────────────────────────────────────────────

export function statePath(slug) {
  return join(IN_PROGRESS, `${slug}_STATE.json`);
}

export function transPath(slug) {
  return join(IN_PROGRESS, `${slug}_TRANS.md`);
}

// ─── State I/O ──────────────────────────────────────────────────────────────

/** Read state, calling process.exit(1) if missing (CLI-friendly). */
export function readState(slug) {
  const p = statePath(slug);
  if (!existsSync(p)) {
    console.error(`ERROR: State file not found: ${p}`);
    process.exit(1);
  }
  const state = JSON.parse(readFileSync(p, "utf-8"));
  // Backward compat: alias workflowType → workflowName for in-flight state files
  if (state.workflowType && !state.workflowName) {
    state.workflowName = state.workflowType;
  }
  backfillCycleCounters(state);
  return state;
}

/** Like readState but throws instead of calling process.exit — for programmatic API use. */
export function readStateOrThrow(slug) {
  const p = statePath(slug);
  if (!existsSync(p)) {
    throw new Error(`State file not found: ${p}`);
  }
  const state = JSON.parse(readFileSync(p, "utf-8"));
  if (state.workflowType && !state.workflowName) {
    state.workflowName = state.workflowType;
  }
  backfillCycleCounters(state);
  return state;
}

/**
 * One-release backfill: older _STATE.json files encode reset cycle counts as
 * pseudo-entries in errorLog (itemKey === logKey like "reset-nodes",
 * "reset-for-dev", "resume-elevated", "reset-scripts:<cat>"). New state
 * carries a typed `cycleCounters` object. This helper populates the typed
 * field for legacy state so callers can read it uniformly.
 *
 * Safe to call on fresh state: a no-op once `cycleCounters` exists.
 */
function backfillCycleCounters(state) {
  if (state.cycleCounters) return;
  const counters = {};
  for (const entry of state.errorLog || []) {
    const k = entry.itemKey;
    // Only log keys that denote cycle ticks — skip real per-item errors.
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

/** Write state and regenerate TRANS.md. */
export function writeState(slug, state) {
  writeFileSync(statePath(slug), JSON.stringify(state, null, 2) + "\n", "utf-8");
  renderTrans(slug, state);
}

// ─── TRANS.md renderer ──────────────────────────────────────────────────────

/** Render the human-readable TRANS.md from state.json. */
function renderTrans(slug, state) {
  const lines = [];
  lines.push(`# Transition Log — ${state.feature}`);
  lines.push("");
  lines.push("## Workflow");
  lines.push(`- **Workflow:** ${state.workflowName}`);
  lines.push(`- **Started:** ${state.started}`);
  lines.push(`- **Deployed URL:** ${state.deployedUrl || "[To be filled after deployment]"}`);  lines.push("");
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

export function today() {
  return new Date().toISOString();
}
