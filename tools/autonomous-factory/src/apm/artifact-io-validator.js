/**
 * apm/artifact-io-validator.ts — Topological validation for Phase 3 artifact
 * declarations on workflow nodes.
 *
 * Every node may declare:
 *   - `consumes_kickoff: [ArtifactKind]` — read from `_kickoff/`.
 *   - `produces_artifacts: [ArtifactKind]` — write to its own invocation dir.
 *   - `consumes_artifacts: [{ from: NodeKey, kind: ArtifactKind, required? }]`
 *     — read from an upstream invocation dir.
 *
 * This validator enforces, at compile time:
 *   1. Every declared `ArtifactKind` exists in the catalog.
 *   2. Every declared `kind` supports the scope it's being used in
 *      (`kickoff` vs `node`).
 *   3. For each `consumes_artifacts[i] = { from, kind }`:
 *      a. `from` is a topological ancestor of the consumer (reachable via
 *         transitive `depends_on`).
 *      b. `from` declares `kind` in its `produces_artifacts` (when
 *         `required === true` — the default).
 *
 * Violations are raised as `ApmCompileError` so the compiler exits with the
 * same failure mode it uses for schema / token-budget problems.
 */
import { ApmCompileError } from "./types.js";
import { getArtifactPolicy, getArtifactSchemaVersion, isArtifactKind, kindSupportsScope, validateArtifactCatalogPolicy, } from "./artifact-catalog.js";
/** Build a reverse-reachability set (every transitive ancestor) for a node. */
function ancestorsOf(nodes, nodeKey) {
    const seen = new Set();
    const stack = [...(nodes[nodeKey]?.depends_on ?? [])];
    while (stack.length) {
        const cur = stack.pop();
        if (seen.has(cur))
            continue;
        seen.add(cur);
        const deps = nodes[cur]?.depends_on ?? [];
        for (const d of deps)
            if (!seen.has(d))
                stack.push(d);
    }
    return seen;
}
/**
 * Validate every node's artifact-bus declarations. Returns a list of soft
 * warnings (e.g. `required: false` edges whose producer doesn't declare the
 * kind). Throws `ApmCompileError` on any hard violation.
 *
 * @param workflowName — used only for error formatting.
 * @param workflow — compiled workflow (post schema merge).
 * @param opts.strictConsumesArtifacts — Phase 1.3: when true, promote the
 *   "agent node lacks consumes_artifacts" warning to a fatal
 *   `ApmCompileError`. When false (default), emit it as a soft warning.
 */
export function validateArtifactIO(workflowName, workflow, opts = {}) {
    const warnings = [];
    const nodes = workflow.nodes;
    // Session R8 — catalog-level policy audit. Rethrow as an ApmCompileError
    // so callers see the same failure mode they use for every other compile
    // problem; ArtifactCatalogPolicyError bubbles out of the pure helper.
    try {
        validateArtifactCatalogPolicy();
    }
    catch (err) {
        throw new ApmCompileError(err.message);
    }
    for (const [nodeKey, node] of Object.entries(nodes)) {
        // ── Kind + scope checks ────────────────────────────────────────────────
        const kickoffKinds = node.consumes_kickoff ?? [];
        for (const kind of kickoffKinds) {
            if (!isArtifactKind(kind)) {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": consumes_kickoff references unknown artifact kind "${kind}". ` +
                    `Register it in tools/autonomous-factory/src/apm/artifact-catalog.ts.`);
            }
            if (!kindSupportsScope(kind, "kickoff")) {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": artifact kind "${kind}" is not valid in the kickoff scope.`);
            }
        }
        const producedKinds = node.produces_artifacts ?? [];
        for (const kind of producedKinds) {
            if (!isArtifactKind(kind)) {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": produces_artifacts references unknown artifact kind "${kind}".`);
            }
            if (!kindSupportsScope(kind, "node")) {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": artifact kind "${kind}" is not valid in the node scope.`);
            }
            // Session R8 — INTERNAL kinds should not cross declared node
            // boundaries. Warn, don't fail: an operator may deliberately wire one
            // up while migrating. See ArtifactPolicy doc in artifact-catalog.ts.
            if (getArtifactPolicy(kind) === "internal") {
                warnings.push({
                    node: nodeKey,
                    message: `produces_artifacts declares kind "${kind}" whose policy is "internal". ` +
                        `Internal artifacts are handler/kernel-private and should not appear ` +
                        `on declared DAG edges. Reclassify the kind in artifact-catalog.ts or ` +
                        `remove the declaration.`,
                });
            }
        }
        const consumed = node.consumes_artifacts ?? [];
        for (const edge of consumed) {
            if (!isArtifactKind(edge.kind)) {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": consumes_artifacts references unknown artifact kind "${edge.kind}".`);
            }
            if (!kindSupportsScope(edge.kind, "node")) {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": artifact kind "${edge.kind}" is not valid in the node scope (used in consumes_artifacts.from "${edge.from}").`);
            }
            if (getArtifactPolicy(edge.kind) === "internal") {
                warnings.push({
                    node: nodeKey,
                    message: `consumes_artifacts { from: "${edge.from}", kind: "${edge.kind}" } references an ` +
                        `"internal" policy kind. Internal artifacts are handler/kernel-private and should not ` +
                        `appear on declared DAG edges. Reclassify the kind in artifact-catalog.ts or remove the edge.`,
                });
            }
        }
        // ── Reroute-scoped consumes: kinds are injected only on triage-reroute.
        //    Validate the kind and scope; no topological check — any node in
        //    the workflow may receive a triage handoff, and the producer is
        //    implicit (the triage node). ─────────────────────────────────────
        const rerouted = node.consumes_reroute ?? [];
        for (const edge of rerouted) {
            if (!isArtifactKind(edge.kind)) {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": consumes_reroute references unknown artifact kind "${edge.kind}".`);
            }
            if (!kindSupportsScope(edge.kind, "node")) {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": artifact kind "${edge.kind}" is not valid in the node scope (used in consumes_reroute).`);
            }
        }
    }
    // ── Topological checks — every consumes_artifacts edge must be reachable
    //    and its producer must declare the kind. ───────────────────────────────
    for (const [nodeKey, node] of Object.entries(nodes)) {
        const consumed = node.consumes_artifacts ?? [];
        if (consumed.length === 0)
            continue;
        const ancestors = ancestorsOf(nodes, nodeKey);
        for (const edge of consumed) {
            // Self-references are allowed only when `pick: "previous"` (debug chains).
            const isSelf = edge.from === nodeKey;
            if (!isSelf && !ancestors.has(edge.from)) {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": consumes_artifacts.from "${edge.from}" is not a DAG ancestor. ` +
                    `Add it to \`depends_on\` or adjust the graph.`);
            }
            if (isSelf && edge.pick !== "previous") {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": self-referencing consumes_artifacts requires \`pick: "previous"\`.`);
            }
            const producer = nodes[edge.from];
            if (!producer) {
                throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": consumes_artifacts.from "${edge.from}" is not a known node in this workflow.`);
            }
            const produces = producer.produces_artifacts ?? [];
            if (!produces.includes(edge.kind)) {
                const message = `consumes_artifacts { from: "${edge.from}", kind: "${edge.kind}" } but ` +
                    `"${edge.from}" does not declare "${edge.kind}" in produces_artifacts (declares: ${produces.length === 0 ? "none" : produces.join(", ")}).`;
                if (edge.required) {
                    throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": ${message}`);
                }
                warnings.push({ node: nodeKey, message });
            }
            // Session A (Items 7/8) \u2014 compile-time schema-version pin. When a
            // consumer declares `expectSchemaVersion: N`, assert the producer's
            // catalog-level `schemaVersion` equals `N` so a payload-shape change
            // on the producer fails loudly at compile rather than silently
            // corrupting the consumer's materialized inputs.
            if (edge.expectSchemaVersion !== undefined && isArtifactKind(edge.kind)) {
                const producerVersion = getArtifactSchemaVersion(edge.kind);
                if (producerVersion === undefined) {
                    throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": consumes_artifacts ` +
                        `{ from: "${edge.from}", kind: "${edge.kind}" } pins ` +
                        `expectSchemaVersion=${edge.expectSchemaVersion}, but kind "${edge.kind}" ` +
                        `has no catalog-level schemaVersion. Remove the pin or register a ` +
                        `schemaVersion in apm/artifact-catalog.ts.`);
                }
                if (producerVersion !== edge.expectSchemaVersion) {
                    throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": consumes_artifacts ` +
                        `{ from: "${edge.from}", kind: "${edge.kind}" } expects ` +
                        `schemaVersion=${edge.expectSchemaVersion}, but the producer's ` +
                        `catalog advertises schemaVersion=${producerVersion}. Update the ` +
                        `consumer (or bump the pin) to match.`);
                }
            }
        }
    }
    // ── Phase 1.3 — strict `consumes_artifacts` declaration gate.
    //    When `strictConsumesArtifacts` is on, every agent node with
    //    `depends_on` must declare at least one `consumes_artifacts` edge.
    //
    //    Note: the Zod schema defaults `consumes_artifacts` to `[]`, so we
    //    cannot distinguish "author omitted the field" from "author wrote
    //    `[]` explicitly" at this layer. The gate therefore requires a
    //    non-empty list — an agent that genuinely has no typed upstream
    //    inputs (works from source diffs only) should stay off the strict
    //    gate at the app level rather than enable it globally.
    //
    //    Defaults to off because the production scope filter
    //    (`agent-context.ts`) already treats empty/omitted as "no upstream",
    //    so strict mode only adds a documentation requirement — it is not
    //    a safety property. ─────────────────────────────────────────────────
    if (opts.strictConsumesArtifacts) {
        for (const [nodeKey, node] of Object.entries(nodes)) {
            if (node.type !== "agent")
                continue;
            const deps = node.depends_on ?? [];
            if (deps.length === 0)
                continue;
            const hasUpstream = (node.consumes_artifacts ?? []).length > 0;
            if (hasUpstream)
                continue;
            throw new ApmCompileError(`Workflow "${workflowName}" node "${nodeKey}": agent node depends on ` +
                `[${deps.join(", ")}] but declares no consumes_artifacts edges. ` +
                `Add at least one upstream edge because ` +
                `\`config.strict_consumes_artifacts\` is enabled.`);
        }
    }
    return { warnings };
}
//# sourceMappingURL=artifact-io-validator.js.map