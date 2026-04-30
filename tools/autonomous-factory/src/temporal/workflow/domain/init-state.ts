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

/** Subset of the compiled-context node fields used by initialization. */
export interface CompiledNode {
  agent?: string | null;
  type?: string;
  category?: string;
  depends_on?: string[];
  activation?: string;
  salvage_survivor?: boolean;
  /** Phase 1 hotfix — exempts the node from the deploy-orphan demotion sweep
   *  inside `salvageForDraft`. Only meaningful with `salvage_survivor: true`. */
  salvage_immune?: boolean;
  /** Phase 3 scheduling triggers. Missing or including "schedule" → normal pending init.
   *  Only-`"route"` → dormant at init (equivalent to activation: "triage-only"). */
  triggers?: ReadonlyArray<"schedule" | "route">;
  /** Phase 3 artifact-bus inputs. The salvage scheduler reads these to scope
   *  demotion: producers feeding a `required: true` edge of a surviving
   *  consumer are spared. Omitted `required` defaults to `true` to match
   *  the Zod schema and the artifact-io-validator. */
  consumes_artifacts?: ReadonlyArray<{ from: string; kind: string; required?: boolean }>;
}

export interface InitInputs {
  feature: string;
  workflowName: string;
  /** ISO timestamp for the `started` field. */
  started: string;
  /** Map of node key → compiled node spec. */
  nodes: Record<string, CompiledNode>;
}

/**
 * Item shape used in the seed state. Matches the runtime PipelineItem
 * structure but typed locally to keep the domain layer free of cross-file
 * imports beyond `dag-graph.js`.
 */
export interface SeedItem {
  key: string;
  label: string;
  agent: string | null;
  status: "pending" | "dormant";
  error: null;
}

/** Shape returned by `buildInitialState` — superset matches PipelineState. */
export interface InitialState {
  feature: string;
  workflowName: string;
  started: string;
  deployedUrl: null;
  implementationNotes: null;
  items: SeedItem[];
  errorLog: never[];
  cycleCounters: Record<string, number>;
  dependencies: Record<string, string[]>;
  nodeTypes: Record<string, string>;
  nodeCategories: Record<string, string>;
  jsonGated: Record<string, boolean>;
  naByType: string[];
  naBySalvage: string[];
  dormantByActivation: string[];
  salvageSurvivors: string[];
  /** Item keys exempt from the salvage deploy-orphan sweep — populated from
   *  `salvage_immune: true` on the node. Read by `salvageForDraft`. */
  salvageImmune: string[];
  /** Consumer-key → producer-keys for which the consumer declares a
   *  `consumes_artifacts` edge with `required: true`. Read by
   *  `salvageForDraft` to scope demotion. Omitted/empty when no node
   *  declares any required consumer edges. */
  requiredArtifactProducers: Record<string, string[]>;
}

/**
 * Pure seed-state builder. Topologically sorts the DAG (throws on cycle),
 * then projects each node into a pipeline item with the right initial status.
 */
export function buildInitialState(inputs: InitInputs): InitialState {
  const { feature, workflowName, started, nodes } = inputs;

  // Topological sort — items ordered by DAG dependency (execution order).
  const dependencyMap: Record<string, string[]> = {};
  for (const [key, node] of Object.entries(nodes)) {
    dependencyMap[key] = node.depends_on ?? [];
  }
  const topoOrder = topologicalSort(dependencyMap);

  const dependencies: Record<string, string[]> = {};
  const nodeTypes: Record<string, string> = {};
  const nodeCategories: Record<string, string> = {};
  const salvageSurvivors: string[] = [];
  const salvageImmune: string[] = [];
  const dormantByActivation: string[] = [];
  const requiredArtifactProducers: Record<string, string[]> = {};

  for (const key of topoOrder) {
    const node = nodes[key]!;
    dependencies[key] = node.depends_on ?? [];
    nodeTypes[key] = node.type ?? "agent";
    if (node.category) nodeCategories[key] = node.category;
    if (node.salvage_survivor) salvageSurvivors.push(key);
    if (node.salvage_immune) salvageImmune.push(key);
    // Required-artifact contract — omitted `required` defaults to true
    // (matches the Zod schema in apm/types.ts and artifact-io-validator).
    const consumes = node.consumes_artifacts;
    if (consumes && consumes.length > 0) {
      const producers: string[] = [];
      for (const edge of consumes) {
        const required = edge.required ?? true;
        if (required) producers.push(edge.from);
      }
      if (producers.length > 0) requiredArtifactProducers[key] = producers;
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

  const items: SeedItem[] = topoOrder.map((key) => {
    const node = nodes[key]!;
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
