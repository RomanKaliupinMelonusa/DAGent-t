/**
 * domain/dag-graph.ts — Pure DAG graph traversal utilities.
 *
 * All functions operate on a dependency map (Record<string, string[]>)
 * where keys are node IDs and values are arrays of dependency node IDs.
 * No I/O, no pipeline state awareness — just graph operations.
 */

/** Dependency graph: node key → keys it depends on. */
export type DependencyGraph = Readonly<Record<string, readonly string[]>>;

/**
 * Compute all transitive downstream dependents of the given seed keys.
 * Uses the reverse of the dependency graph (parent → children).
 * Returns the seed keys + all downstream.
 */
export function getDownstream(
  dependencies: DependencyGraph,
  seedKeys: readonly string[],
): string[] {
  const reverse: Record<string, string[]> = {};
  for (const [key, deps] of Object.entries(dependencies)) {
    for (const dep of deps) {
      if (!reverse[dep]) reverse[dep] = [];
      reverse[dep].push(key);
    }
  }
  const result = new Set<string>(seedKeys);
  const queue = [...seedKeys];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of reverse[current] ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return [...result];
}

/**
 * Compute all transitive upstream dependencies of the given seed keys.
 * Returns the seed keys + all upstream.
 */
export function getUpstream(
  dependencies: DependencyGraph,
  seedKeys: readonly string[],
): string[] {
  const result = new Set<string>(seedKeys);
  const queue = [...seedKeys];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dep of dependencies[current] ?? []) {
      if (!result.has(dep)) {
        result.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...result];
}

/**
 * Cascade barrier nodes into a reset set.
 * Barrier nodes are pure sync points — when ANY of a barrier's dependencies
 * is being reset, the barrier must also reset. Recursive: cascading a barrier
 * may trigger further barriers.
 *
 * @param dependencies - DAG dependency graph
 * @param nodeTypes - Map of node key → type string
 * @param keysToReset - Mutable set; barrier keys are added in-place
 * @returns The same set, expanded with cascaded barrier keys
 */
export function cascadeBarriers(
  dependencies: DependencyGraph,
  nodeTypes: Readonly<Record<string, string>>,
  keysToReset: Set<string>,
): Set<string> {
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, deps] of Object.entries(dependencies)) {
      if (nodeTypes[key] !== "barrier") continue;
      if (keysToReset.has(key)) continue;
      if (deps.some((dep) => keysToReset.has(dep))) {
        keysToReset.add(key);
        changed = true;
      }
    }
  }
  return keysToReset;
}

/**
 * Topological sort of the dependency graph.
 * Returns node keys in dependency-first order.
 * @throws Error if a cycle is detected
 */
export function topologicalSort(dependencies: DependencyGraph): string[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const order: string[] = [];

  function visit(key: string): void {
    if (stack.has(key)) throw new Error(`Cycle detected in DAG involving node "${key}"`);
    if (visited.has(key)) return;
    stack.add(key);
    for (const dep of dependencies[key] ?? []) visit(dep);
    stack.delete(key);
    visited.add(key);
    order.push(key);
  }

  for (const key of Object.keys(dependencies)) visit(key);
  return order;
}
