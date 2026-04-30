/**
 * session/dag-utils.ts — DAG traversal and workflow node resolution.
 *
 * Pure functions for querying the compiled APM workflow graph. No state
 * mutation, no I/O beyond a single `git rev-parse HEAD` in getHeadSha().
 */
import { execSync } from "node:child_process";
// ---------------------------------------------------------------------------
// Workflow node helpers
// ---------------------------------------------------------------------------
/** Resolve the workflow definition for a named workflow. */
export function getWorkflow(apmContext, workflowName) {
    return apmContext.workflows?.[workflowName];
}
/** Resolve the workflow node definition for an item key within a named workflow. */
export function getWorkflowNode(apmContext, workflowName, itemKey) {
    return apmContext.workflows?.[workflowName]?.nodes?.[itemKey];
}
/**
 * Get the current HEAD SHA. Returns null on failure (non-fatal).
 * Single abstraction for all git HEAD operations in the kernel.
 */
export function getHeadSha(repoRoot) {
    try {
        return execSync("git rev-parse HEAD", {
            cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
        }).trim() || null;
    }
    catch {
        return null;
    }
}
export function getTimeout(itemKey, apmContext, workflowName) {
    const wfName = workflowName ?? Object.keys(apmContext.workflows ?? {})[0] ?? "default";
    const node = getWorkflowNode(apmContext, wfName, itemKey);
    return (node?.timeout_minutes ?? 15) * 60_000;
}
// ---------------------------------------------------------------------------
// Circuit breaker / budget policy
// ---------------------------------------------------------------------------
/**
 * Resolve circuit breaker configuration for a workflow node.
 * @deprecated Use `resolveNodeBudgetPolicy()` for full budget resolution.
 */
export function resolveCircuitBreaker(node) {
    const cb = node?.circuit_breaker;
    return {
        minAttemptsBeforeSkip: cb?.min_attempts_before_skip ?? 3,
        allowsRevertBypass: cb?.allows_revert_bypass ?? false,
        allowsTimeoutSalvage: cb?.allows_timeout_salvage ?? false,
        haltOnIdentical: cb?.halt_on_identical ?? false,
        revertWarningAt: cb?.revert_warning_at ?? 3,
    };
}
/**
 * Resolve the full budget policy for a workflow node.
 *
 * Resolution order per field:
 *   1. Per-node `circuit_breaker.*` in workflows.yml
 *   2. Workflow/config-level defaults (`cycle_limits`, `max_same_error_cycles`)
 *   3. Code-level fallback constants
 */
export function resolveNodeBudgetPolicy(node, apmContext) {
    const cb = node?.circuit_breaker;
    const config = apmContext.config;
    return {
        minAttemptsBeforeSkip: cb?.min_attempts_before_skip ?? 3,
        allowsRevertBypass: cb?.allows_revert_bypass ?? false,
        allowsTimeoutSalvage: cb?.allows_timeout_salvage ?? false,
        haltOnIdentical: cb?.halt_on_identical ?? false,
        revertWarningAt: cb?.revert_warning_at ?? 3,
        maxItemFailures: cb?.max_item_failures ?? 10,
        maxSameError: config?.max_same_error_cycles ?? 3,
        maxRerouteCycles: config?.cycle_limits?.reroute ?? 5,
        maxScriptCycles: config?.cycle_limits?.scripts ?? 10,
    };
}
/**
 * Resolve the workflow-level `halt_on_identical` block, applied across the
 * entire run (feature-scoped) rather than per node. Returns `undefined`
 * when the workflow has no block configured — callers should treat this
 * as "disabled, no behaviour change".
 */
export function resolveWorkflowHaltPolicy(apmContext, workflowName) {
    const wf = apmContext.workflows?.[workflowName];
    const cfg = wf?.halt_on_identical;
    if (!cfg)
        return undefined;
    return {
        enabled: cfg.enabled ?? false,
        threshold: cfg.threshold ?? 3,
        excludedKeys: cfg.excluded_keys ?? [],
    };
}
// ---------------------------------------------------------------------------
// DAG traversal
// ---------------------------------------------------------------------------
/**
 * Walk the DAG backward from `startKey` to find all upstream nodes
 * matching any of the given categories. Uses BFS on inverted edges (predecessors).
 * Returns matching node keys in discovery order (nearest first).
 */
export function findUpstreamKeysByCategory(nodes, startKey, categories) {
    const categorySet = new Set(categories);
    // Build inverted adjacency list: child → parents
    const parents = {};
    for (const [key, node] of Object.entries(nodes)) {
        for (const dep of node.depends_on ?? []) {
            (parents[key] ??= []).push(dep);
        }
    }
    const visited = new Set();
    const queue = [...(parents[startKey] ?? [])];
    const matchedKeys = [];
    while (queue.length > 0) {
        const key = queue.shift();
        if (visited.has(key))
            continue;
        visited.add(key);
        const node = nodes[key];
        if (!node)
            continue;
        if (node.category && categorySet.has(node.category))
            matchedKeys.push(key);
        for (const parent of parents[key] ?? []) {
            if (!visited.has(parent))
                queue.push(parent);
        }
    }
    return matchedKeys;
}
/**
 * Map workflow nodes to their owned directory prefixes for scoped git-diff
 * attribution. Prevents cross-agent pollution when parallel dev agents
 * run in parallel. Returns empty array for nodes without diff_attribution_dirs.
 */
export function getAgentDirectoryPrefixes(node, appRel, directories) {
    if (!node?.diff_attribution_dirs?.length)
        return [];
    const prefix = appRel ? `${appRel}/` : "";
    return node.diff_attribution_dirs.map((dir) => {
        if (dir.endsWith("/"))
            return dir;
        const resolved = directories?.[dir] ?? dir;
        return `${prefix}${resolved}/`;
    });
}
//# sourceMappingURL=dag-utils.js.map