/**
 * handlers/support/agent-context.ts — Builds the AgentContext DTO passed to
 * the Copilot SDK session runner. Pure data assembly; no I/O.
 */

import path from "node:path";
import type { NodeContext } from "../types.js";
import type { AgentContext } from "../../apm/agents.js";

/** Collect validated handoff artifacts from upstream completed items. */
export function collectUpstreamArtifacts(
  state: NodeContext["pipelineState"],
): Record<string, unknown> {
  const upstream: Record<string, unknown> = {};
  for (const item of state.items) {
    if (item.status === "done" && item.handoffArtifact) {
      try { upstream[item.key] = JSON.parse(item.handoffArtifact); } catch { /* skip malformed */ }
    }
  }
  return upstream;
}

/**
 * Build the AgentContext that the prompt factory consumes.
 * Returns both the context and the upstream-artifact map so the caller
 * can emit the handoff.inject telemetry event.
 */
export function buildAgentContext(ctx: NodeContext): {
  agentContext: AgentContext;
  upstreamArtifacts: Record<string, unknown>;
} {
  const { itemKey, slug, appRoot, repoRoot, baseBranch, apmContext } = ctx;
  const upstreamArtifacts = collectUpstreamArtifacts(ctx.pipelineState);
  const hasArtifacts = Object.keys(upstreamArtifacts).length > 0;

  // Expose the acceptance contract path when the workflow has a
  // `spec-compiler` node — i.e. when the contract exists (or is expected to
  // exist) for this feature run. Consumers that need the contract's contents
  // should read the file themselves; this is path-only plumbing.
  const workflow = apmContext.workflows?.[ctx.pipelineState.workflowName];
  const hasSpecCompiler = !!workflow?.nodes?.["spec-compiler"];
  const acceptancePath = hasSpecCompiler
    ? path.join(appRoot, "in-progress", `${slug}_ACCEPTANCE.yml`)
    : undefined;

  const agentContext: AgentContext = {
    featureSlug: slug,
    specPath: path.join(appRoot, "in-progress", `${slug}_SPEC.md`),
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
  };

  return { agentContext, upstreamArtifacts };
}
