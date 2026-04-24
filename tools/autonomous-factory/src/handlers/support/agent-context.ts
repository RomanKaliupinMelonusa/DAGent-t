/**
 * handlers/support/agent-context.ts — Builds the AgentContext DTO passed to
 * the Copilot SDK session runner. Pure data assembly; no I/O.
 */

import type { NodeContext } from "../types.js";
import type { AgentContext } from "../../apm/agents.js";
import type { FeatureFilesystem } from "../../ports/feature-filesystem.js";
import type { InvocationRecord, PipelineState } from "../../types.js";
import type { ApmWorkflow } from "../../apm/types.js";
import { FileArtifactBus } from "../../adapters/file-artifact-bus.js";
import { featurePath } from "../../adapters/feature-paths.js";

/**
 * Pure predicate: does any node in this workflow declare
 * `produces_artifacts: [acceptance]`?
 *
 * Drives `AgentContext.acceptancePath` injection without coupling to any
 * specific node key (e.g. `spec-compiler`). Exported for targeted tests.
 */
export function workflowProducesAcceptance(
  workflow: ApmWorkflow | undefined,
): boolean {
  const nodes = workflow?.nodes;
  if (!nodes) return false;
  for (const node of Object.values(nodes)) {
    if ((node?.produces_artifacts ?? []).includes("acceptance")) return true;
  }
  return false;
}

/**
 * Collect validated handoff artifacts from upstream completed items.
 *
 * The canonical source is `state.artifacts` — the latest completed
 * invocation of each node, looking for `outputs` with `kind === "params"`
 * and reading the file through the ArtifactBus.
 *
 * `declaredConsumes` is the `consumes_artifacts` list from the current
 * node's workflow declaration. Scoping semantics:
 *   - list with entries → strict: expose only those producers.
 *   - empty list        → strict empty: expose nothing.
 *   - `undefined`       → legacy fallback: expose every done upstream.
 *
 * Phase 1.3 note: production callers (`buildAgentContext`) always pass an
 * array (never `undefined`), so the legacy fallback only survives for
 * direct test callers that deliberately omit the scope. Removing it
 * entirely would be a silent behaviour change; we keep it documented and
 * covered by a dedicated test so the migration boundary is explicit.
 *
 * Marked async because ArtifactBus reads hit the feature filesystem; callers
 * wire `ctx.appRoot` + `ctx.filesystem` through.
 */
export async function collectUpstreamArtifacts(
  state: PipelineState,
  appRoot?: string,
  filesystem?: FeatureFilesystem,
  declaredConsumes?: ReadonlyArray<{ from: string; kind: string }>,
): Promise<Record<string, unknown>> {
  const upstream: Record<string, unknown> = {};
  const bus = appRoot && filesystem ? new FileArtifactBus(appRoot, filesystem) : undefined;
  const byNode = indexLatestCompletedByNode(state);
  // `undefined` → legacy fallback (expose every done upstream).
  // `[]`        → strict empty (scope has zero entries → filter rejects all).
  // list        → strict to declared producers.
  const scope = declaredConsumes === undefined
    ? undefined
    : new Set(declaredConsumes.map((c) => c.from));
  for (const item of state.items) {
    if (item.status !== "done") continue;
    if (scope && !scope.has(item.key)) continue;
    const rec = byNode.get(item.key);
    if (!bus || !rec) continue;
    const paramsOut = rec.outputs.find((o) => o.kind === "params");
    if (!paramsOut) continue;
    try {
      const body = await bus.read({
        kind: "params",
        scope: "node",
        slug: paramsOut.slug ?? state.feature,
        nodeKey: paramsOut.nodeKey ?? item.key,
        invocationId: paramsOut.invocationId ?? rec.invocationId,
        path: paramsOut.path,
      });
      try { upstream[item.key] = JSON.parse(body); } catch { /* malformed — skip */ }
    } catch { /* missing on disk — skip */ }
  }
  return upstream;
}

/** Group completed invocation records by nodeKey, keeping the latest per node
 *  (lexicographic invocation id = chronological ULID order). */
function indexLatestCompletedByNode(state: PipelineState): Map<string, InvocationRecord> {
  const byNode = new Map<string, InvocationRecord>();
  const records = state.artifacts ? Object.values(state.artifacts) : [];
  for (const rec of records) {
    if (rec.outcome !== "completed") continue;
    const existing = byNode.get(rec.nodeKey);
    if (!existing || rec.invocationId > existing.invocationId) {
      byNode.set(rec.nodeKey, rec);
    }
  }
  return byNode;
}

/**
 * Build the AgentContext that the prompt factory consumes.
 * Returns both the context and the upstream-artifact map so the caller
 * can emit the handoff.inject telemetry event.
 */
export async function buildAgentContext(ctx: NodeContext): Promise<{
  agentContext: AgentContext;
  upstreamArtifacts: Record<string, unknown>;
}> {
  const { itemKey, slug, appRoot, repoRoot, baseBranch, apmContext } = ctx;
  const workflow = apmContext.workflows?.[ctx.pipelineState.workflowName];
  const currentNode = workflow?.nodes?.[itemKey];
  // Phase 1.3: always pass an array (never `undefined`) so production
  // dispatch is strictly scoped. Nodes that have not declared
  // `consumes_artifacts` receive an empty scope → zero upstream exposure,
  // which closes the "expose everything" fallback.
  const declaredConsumes = currentNode?.consumes_artifacts ?? [];
  const upstreamArtifacts = await collectUpstreamArtifacts(
    ctx.pipelineState as PipelineState,
    appRoot,
    ctx.filesystem,
    declaredConsumes,
  );
  const hasArtifacts = Object.keys(upstreamArtifacts).length > 0;

  // Expose the acceptance contract path when any node in this workflow
  // declares `produces_artifacts: [acceptance]`. Driven by the declared
  // contract, not by hard-coding a specific node key — so a workflow can
  // rename its contract producer (e.g. `spec-compiler` → `contract-compiler`)
  // without losing the path injection. Path-only plumbing: consumers read
  // the file themselves.
  const acceptancePath = workflowProducesAcceptance(workflow)
    ? featurePath(appRoot, slug, "acceptance")
    : undefined;

  const agentContext: AgentContext = {
    featureSlug: slug,
    specPath: featurePath(appRoot, slug, "spec"),
    ...(acceptancePath ? { acceptancePath } : {}),
    deployedUrl: ctx.pipelineState.deployedUrl,
    workflowName: ctx.pipelineState.workflowName,
    repoRoot,
    appRoot,
    itemKey,
    baseBranch,
    ...(ctx.forceRunChanges && { forceRunChanges: true }),
    environment: apmContext.config?.environment as Record<string, string> | undefined,
    testCommands: apmContext.config?.testCommands as Record<string, string | null> | undefined,
    commitScopes: apmContext.config?.commitScopes,
    ...(hasArtifacts && { upstreamArtifacts }),
    ...(ctx.pwaKitDriftReport ? { pwaKitDriftReport: ctx.pwaKitDriftReport } : {}),
  };

  return { agentContext, upstreamArtifacts };
}
