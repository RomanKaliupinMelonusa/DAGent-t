/**
 * domain/failure-routing.ts — Pure failure routing resolution.
 *
 * Resolves which triage node to dispatch and which failure routes apply
 * when a DAG node fails. Extracted from session-runner.ts.
 * Pure functions over workflow graph data — no I/O.
 */

/** Minimal workflow node shape needed for failure routing. */
export interface RoutableNode {
  readonly type?: string;
  readonly triage?: string;
  readonly triage_profile?: string;
  readonly on_failure?: string | { triage?: string; routes?: Record<string, string | null> };
}

/** Minimal workflow shape. */
export interface RoutableWorkflow {
  readonly nodes: Readonly<Record<string, RoutableNode>>;
  readonly default_triage?: string;
  readonly default_routes?: Record<string, string | null>;
}

/**
 * Resolve the triage target node key for a failing node.
 *
 * Resolution order:
 *   1. Node-level `on_failure.triage` (explicit per-node target)
 *   2. Node-level `on_failure` string (backward compat)
 *   3. Deprecated `triage` field shim (look up triage node by profile name)
 *   4. Workflow-level `default_triage` (catch-all)
 *
 * Returns undefined if no failure routing is configured.
 */
export function resolveFailureTarget(
  workflow: RoutableWorkflow,
  itemKey: string,
): string | undefined {
  const node = workflow.nodes[itemKey];
  if (!node) return undefined;

  // Path 1: on_failure is an object with .triage
  if (node.on_failure && typeof node.on_failure === "object" && "triage" in node.on_failure) {
    return node.on_failure.triage;
  }
  // Path 2: on_failure is a string (backward compat)
  if (typeof node.on_failure === "string") return node.on_failure;
  // Path 3: deprecated triage field → resolve implicit triage node key
  if (node.triage) {
    for (const [key, n] of Object.entries(workflow.nodes)) {
      if (n.type === "triage" && n.triage_profile === node.triage) return key;
    }
  }
  // Path 4: workflow-level default_triage
  return workflow.default_triage;
}

/**
 * Extract the failure routes map from a node's on_failure config.
 * Falls back to workflow-level default_routes.
 */
export function resolveFailureRoutes(
  workflow: RoutableWorkflow,
  itemKey: string,
): Record<string, string | null> {
  const node = workflow.nodes[itemKey];
  if (node?.on_failure && typeof node.on_failure === "object") {
    const routes = (node.on_failure as { routes?: Record<string, string | null> }).routes;
    if (routes && Object.keys(routes).length > 0) return routes;
  }
  return workflow.default_routes ?? {};
}
