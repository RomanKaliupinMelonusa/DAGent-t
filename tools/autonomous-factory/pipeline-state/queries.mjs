/**
 * pipeline-state/queries.mjs — Read-only state queries.
 *
 * Pure reads: getStatus, getNext, getNextAvailable. No locking required —
 * state.json is rewritten atomically by writeState.
 */

import { readStateOrThrow } from "./io.mjs";

/**
 * @returns {object} The state object
 * @throws {Error} if slug missing or state file not found
 */
export function getStatus(slug) {
  if (!slug) {
    throw new Error("getStatus requires slug");
  }
  return readStateOrThrow(slug);
}

/**
 * Get the next actionable item (topological order).
 * @returns {{ key: string|null, label: string, agent: string|null, status: string }}
 */
export function getNext(slug) {
  if (!slug) {
    throw new Error("getNext requires slug");
  }

  const state = readStateOrThrow(slug);

  for (const item of state.items) {
    if (item.status !== "done" && item.status !== "na" && item.status !== "dormant") {
      return { key: item.key, label: item.label, agent: item.agent, status: item.status };
    }
  }

  return { key: null, label: "Pipeline complete", agent: null, status: "complete" };
}

/**
 * Get ALL currently runnable items (items whose DAG dependencies are all done/na).
 * Returns an array of items that can execute in parallel.
 */
export function getNextAvailable(slug) {
  if (!slug) {
    throw new Error("getNextAvailable requires slug");
  }

  const state = readStateOrThrow(slug);

  const statusMap = new Map(state.items.map((i) => [i.key, i.status]));
  const available = [];

  for (const item of state.items) {
    if (item.status !== "pending" && item.status !== "failed") continue;

    const deps = (state.dependencies || {})[item.key] || [];
    const depsResolved = deps.every((depKey) => {
      const depStatus = statusMap.get(depKey);
      return depStatus === "done" || depStatus === "na";
    });

    if (depsResolved) {
      available.push({
        key: item.key,
        label: item.label,
        agent: item.agent,
        status: item.status,
      });
    }
  }

  if (available.length === 0) {
    const allDone = state.items.every((i) => i.status === "done" || i.status === "na" || i.status === "dormant");
    if (allDone) {
      return [{ key: null, label: "Pipeline complete", agent: null, status: "complete" }];
    }
    // Pending items exist but none are runnable — blocked by unresolved failures
    return [{ key: null, label: "Pipeline blocked", agent: null, status: "blocked" }];
  }

  return available;
}
