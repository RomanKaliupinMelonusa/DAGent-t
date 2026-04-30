/**
 * domain/init-state.ts — Pure DAG-seed math for pipeline initialization.
 *
 * Given a compiled workflow's node map, compute the initial pipeline state:
 * topologically sort the items, derive dependency/type/category maps, and
 * decide which nodes start dormant vs pending.
 *
 * Pure — zero I/O. The adapter wraps this with the file-system orchestration
 * (read context.json, write _STATE.json).
 */
import { topologicalSort } from "./dag-graph.js";
/**
 * Pure seed-state builder. Topologically sorts the DAG (throws on cycle),
 * then projects each node into a pipeline item with the right initial status.
 */
export function buildInitialState(inputs) {
    const { feature, workflowName, started, nodes } = inputs;
    // Topological sort — items ordered by DAG dependency (execution order).
    const dependencyMap = {};
    for (const [key, node] of Object.entries(nodes)) {
        dependencyMap[key] = node.depends_on ?? [];
    }
    const topoOrder = topologicalSort(dependencyMap);
    const dependencies = {};
    const nodeTypes = {};
    const nodeCategories = {};
    const salvageSurvivors = [];
    const salvageImmune = [];
    const dormantByActivation = [];
    const requiredArtifactProducers = {};
    for (const key of topoOrder) {
        const node = nodes[key];
        dependencies[key] = node.depends_on ?? [];
        nodeTypes[key] = node.type ?? "agent";
        if (node.category)
            nodeCategories[key] = node.category;
        if (node.salvage_survivor)
            salvageSurvivors.push(key);
        if (node.salvage_immune)
            salvageImmune.push(key);
        // Required-artifact contract — omitted `required` defaults to true
        // (matches the Zod schema in apm/types.ts and artifact-io-validator).
        const consumes = node.consumes_artifacts;
        if (consumes && consumes.length > 0) {
            const producers = [];
            for (const edge of consumes) {
                const required = edge.required ?? true;
                if (required)
                    producers.push(edge.from);
            }
            if (producers.length > 0)
                requiredArtifactProducers[key] = producers;
        }
        // A node starts dormant when any of the following hold:
        //   - Legacy `activation: "triage-only"` field is set
        //   - `type === "triage"` (triage classifier nodes always dormant)
        //   - `triggers` is declared and does NOT include "schedule" (route-only)
        const triggers = node.triggers;
        const scheduleOnly = !triggers || triggers.includes("schedule");
        if (node.activation === "triage-only" || node.type === "triage" || !scheduleOnly) {
            dormantByActivation.push(key);
        }
    }
    const items = topoOrder.map((key) => {
        const node = nodes[key];
        const triggers = node.triggers;
        const scheduleOnly = !triggers || triggers.includes("schedule");
        const dormant = node.activation === "triage-only" || node.type === "triage" || !scheduleOnly;
        return {
            key,
            label: key,
            agent: node.agent ?? null,
            status: dormant ? "dormant" : "pending",
            error: null,
        };
    });
    return {
        feature,
        workflowName,
        started,
        deployedUrl: null,
        implementationNotes: null,
        items,
        errorLog: [],
        cycleCounters: {},
        dependencies,
        nodeTypes,
        nodeCategories,
        jsonGated: {},
        naByType: [],
        naBySalvage: [],
        dormantByActivation,
        salvageSurvivors,
        salvageImmune,
        requiredArtifactProducers,
    };
}
//# sourceMappingURL=init-state.js.map