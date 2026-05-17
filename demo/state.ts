/**
 * state.ts — JSON persistence of RunState.
 *
 * All run artifacts (state.json, logs/, snapshots/) live under the app's
 * `.dagent/<slug>/` directory — NOT under `demo/`. The `demo/` folder is
 * the pipeline engine and must remain unmodified by run artifacts.
 */

import fs from "node:fs";
import path from "node:path";
import type { NodeId, NodeOutput, RunState } from "./types.ts";

// ---------------------------------------------------------------------------
// Path helpers — all derive from RunState.dagentDir
// ---------------------------------------------------------------------------

export function logsDir(dagentDir: string): string {
  return path.join(dagentDir, "logs");
}

export function snapshotsDir(dagentDir: string): string {
  return path.join(dagentDir, "snapshots");
}

export function statePath(dagentDir: string): string {
  return path.join(dagentDir, "state.json");
}

export function ensureRunDirs(dagentDir: string): void {
  fs.mkdirSync(logsDir(dagentDir), { recursive: true });
  fs.mkdirSync(snapshotsDir(dagentDir), { recursive: true });
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function saveState(state: RunState): void {
  ensureRunDirs(state.dagentDir);
  fs.writeFileSync(statePath(state.dagentDir), JSON.stringify(state, null, 2));
}

/**
 * Append a numbered snapshot of the just-completed node for human inspection.
 * Files named `00-<nodeId>.json`, `01-<nodeId>.json`, ... in order of completion.
 */
export function snapshotNode(state: RunState, nodeId: NodeId): void {
  const dir = snapshotsDir(state.dagentDir);
  fs.mkdirSync(dir, { recursive: true });
  const idx = fs.readdirSync(dir).length;
  const seq = String(idx).padStart(2, "0");
  const file = path.join(dir, `${seq}-${nodeId}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ nodeId, output: state.outputs[nodeId] }, null, 2),
  );
}

/**
 * Resolve the dagentDir for a given app + slug pair. Used during init
 * and resume before a full RunState exists.
 */
export function resolveDagentDir(repoRoot: string, app: string, slug: string): string {
  return path.join(repoRoot, app, ".dagent", slug);
}

export function loadState(dagentDir: string): RunState | null {
  const p = statePath(dagentDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as RunState;
}

export function initOutput(): NodeOutput {
  return { status: "pending", attempts: [] };
}
