/**
 * domain/pruning.ts — Workflow-type item pruning.
 *
 * Determines which DAG nodes should be marked N/A based on their activation
 * mode and type. Pure function — no I/O.
 */

/** Minimal node shape needed for pruning decisions. */
export interface PrunableNode {
  readonly key: string;
  readonly type?: string;
  readonly activation?: string;
}

/**
 * Compute which node keys should start as dormant (invisible to scheduler).
 *
 * Nodes with `activation: "triage-only"` and nodes with `type: "triage"`
 * start dormant — they are activated exclusively by triage dispatch, never
 * by the DAG scheduler.
 */
export function computeDormantKeys(nodes: readonly PrunableNode[]): string[] {
  return nodes
    .filter((n) => n.activation === "triage-only" || n.type === "triage")
    .map((n) => n.key);
}
