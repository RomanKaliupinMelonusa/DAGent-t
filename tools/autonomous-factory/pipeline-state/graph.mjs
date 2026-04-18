/**
 * pipeline-state/graph.mjs — DAG graph utilities.
 *
 * Pure functions that operate on pipeline state — no I/O, no side effects.
 * Used by mutations (resetNodes, salvageForDraft, resetScripts) to compute
 * upstream/downstream cascades.
 */

/**
 * Compute all transitive downstream dependents of the given seed keys.
 * Uses the reverse of state.dependencies (i.e., for each key, which keys
 * transitively depend on it). Returns the seed keys + all downstream.
 */
export function getDownstream(state, seedKeys) {
  const reverse = {};
  for (const [key, deps] of Object.entries(state.dependencies)) {
    for (const dep of deps) {
      if (!reverse[dep]) reverse[dep] = [];
      reverse[dep].push(key);
    }
  }
  const result = new Set(seedKeys);
  const queue = [...seedKeys];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const child of (reverse[current] || [])) {
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
export function getUpstream(state, seedKeys) {
  const result = new Set(seedKeys);
  const queue = [...seedKeys];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const dep of (state.dependencies[current] || [])) {
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
 * Barrier nodes (type "barrier") are pure sync points with no real work.
 * When ANY of a barrier's dependencies is being reset, the barrier must also
 * reset — its "done" status is no longer valid. This is recursive: if
 * cascading a barrier causes another barrier's dep to be in the set, that
 * barrier cascades too.
 *
 * @param {object} state - Pipeline state (needs dependencies, nodeTypes)
 * @param {Set<string>} keysToReset - Mutable set; barrier keys are added in-place
 * @returns {Set<string>} The same set, expanded with cascaded barrier keys
 */
export function cascadeBarriers(state, keysToReset) {
  const nodeTypes = state.nodeTypes || {};
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, deps] of Object.entries(state.dependencies)) {
      if (nodeTypes[key] !== "barrier") continue;
      if (keysToReset.has(key)) continue;
      if (deps.some(dep => keysToReset.has(dep))) {
        keysToReset.add(key);
        changed = true;
      }
    }
  }
  return keysToReset;
}
