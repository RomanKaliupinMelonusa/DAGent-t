/**
 * state.ts — JSON persistence of RunState. No mutation behind the scenes;
 * callers explicitly call `saveState` after every node attempt.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NodeId, NodeOutput, RunState } from "./types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_ROOT = path.resolve(__dirname, ".runs");

export function runDir(slug: string): string {
  return path.join(RUNS_ROOT, slug);
}

export function logsDir(slug: string): string {
  return path.join(runDir(slug), "logs");
}

export function snapshotsDir(slug: string): string {
  return path.join(runDir(slug), "snapshots");
}

export function statePath(slug: string): string {
  return path.join(runDir(slug), "state.json");
}

export function ensureRunDirs(slug: string): void {
  fs.mkdirSync(logsDir(slug), { recursive: true });
  fs.mkdirSync(snapshotsDir(slug), { recursive: true });
}

export function saveState(state: RunState): void {
  ensureRunDirs(state.slug);
  fs.writeFileSync(statePath(state.slug), JSON.stringify(state, null, 2));
}

/**
 * Append a numbered snapshot of the just-completed node for human inspection.
 * Files named `00-<nodeId>.json`, `01-<nodeId>.json`, ... in order of completion.
 */
export function snapshotNode(state: RunState, nodeId: NodeId): void {
  const dir = snapshotsDir(state.slug);
  fs.mkdirSync(dir, { recursive: true });
  const idx = fs.readdirSync(dir).length;
  const seq = String(idx).padStart(2, "0");
  const file = path.join(dir, `${seq}-${nodeId}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ nodeId, output: state.outputs[nodeId] }, null, 2),
  );
}

export function loadState(slug: string): RunState | null {
  const p = statePath(slug);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as RunState;
}

export function initOutput(): NodeOutput {
  return { status: "pending", attempts: [] };
}
