/**
 * domain/scheduling.ts — Pure DAG scheduling logic.
 *
 * Determines which pipeline items are ready for execution based on
 * dependency resolution. Pure function — no I/O, no state file access.
 */

import type { DependencyGraph } from "./dag-graph.js";

/** Minimal item shape needed for scheduling decisions. */
export interface SchedulableItem {
  readonly key: string;
  readonly label: string;
  readonly agent: string | null;
  readonly status: "pending" | "done" | "failed" | "na" | "dormant";
}

/** Result of scheduling: ready items, or a terminal signal. */
export type ScheduleResult =
  | { readonly kind: "items"; readonly items: ReadonlyArray<SchedulableItem> }
  | { readonly kind: "complete" }
  | { readonly kind: "blocked" };

/**
 * Compute all currently dispatchable items from the DAG.
 *
 * An item is dispatchable if:
 * - Its status is "pending" or "failed"
 * - All of its dependencies have status "done" or "na"
 *
 * Returns "complete" if all items are done/na/dormant.
 * Returns "blocked" if pending items exist but none are dispatchable.
 */
export function schedule(
  items: readonly SchedulableItem[],
  dependencies: DependencyGraph,
): ScheduleResult {
  const statusMap = new Map(items.map((i) => [i.key, i.status]));
  const available: SchedulableItem[] = [];

  for (const item of items) {
    if (item.status !== "pending" && item.status !== "failed") continue;

    const deps = dependencies[item.key] ?? [];
    const depsResolved = deps.every((depKey) => {
      const depStatus = statusMap.get(depKey);
      return depStatus === "done" || depStatus === "na";
    });

    if (depsResolved) {
      available.push(item);
    }
  }

  if (available.length === 0) {
    const allDone = items.every(
      (i) => i.status === "done" || i.status === "na" || i.status === "dormant",
    );
    return allDone ? { kind: "complete" } : { kind: "blocked" };
  }

  return { kind: "items", items: available };
}
