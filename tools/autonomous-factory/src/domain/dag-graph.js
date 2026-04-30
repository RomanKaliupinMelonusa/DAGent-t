/**
 * domain/dag-graph.ts — Pure DAG graph traversal utilities.
 *
 * All functions operate on a dependency map (Record<string, string[]>)
 * where keys are node IDs and values are arrays of dependency node IDs.
 * No I/O, no pipeline state awareness — just graph operations.
 */
/**
 * Compute all transitive downstream dependents of the given seed keys.
 * Uses the reverse of the dependency graph (parent → children).
 * Returns the seed keys + all downstream.
 */
export function getDownstream(dependencies, seedKeys) {
    const reverse = {};
    for (const [key, deps] of Object.entries(dependencies)) {
        for (const dep of deps) {
            if (!reverse[dep])
                reverse[dep] = [];
            reverse[dep].push(key);
        }
    }
    const result = new Set(seedKeys);
    const queue = [...seedKeys];
    while (queue.length > 0) {
        const current = queue.shift();
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
export function getUpstream(dependencies, seedKeys) {
    const result = new Set(seedKeys);
    const queue = [...seedKeys];
    while (queue.length > 0) {
        const current = queue.shift();
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
export function cascadeBarriers(dependencies, nodeTypes, keysToReset) {
    let changed = true;
    while (changed) {
        changed = false;
        for (const [key, deps] of Object.entries(dependencies)) {
            if (nodeTypes[key] !== "barrier")
                continue;
            if (keysToReset.has(key))
                continue;
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
export function topologicalSort(dependencies) {
    const visited = new Set();
    const stack = new Set();
    const order = [];
    function visit(key) {
        if (stack.has(key))
            throw new Error(`Cycle detected in DAG involving node "${key}"`);
        if (visited.has(key))
            return;
        stack.add(key);
        for (const dep of dependencies[key] ?? [])
            visit(dep);
        stack.delete(key);
        visited.add(key);
        order.push(key);
    }
    for (const key of Object.keys(dependencies))
        visit(key);
    return order;
}
//# sourceMappingURL=dag-graph.js.map