/**
 * dispatch/context-builder.ts — Builds NodeContext from kernel snapshots.
 *
 * Assembles the immutable NodeContext that every handler receives.
 * Replaces the mutable context assembly that was inline in session-runner.ts.
 */

import { randomUUID } from "node:crypto";
import type { NodeContext } from "../../handlers/types.js";
import type { PipelineState, ItemSummary } from "../../types.js";
import type { ApmCompiledOutput, ApmWorkflowNode } from "../../apm/types.js";
import type { RunState } from "../../kernel/types.js";
import type { AvailableItem, TriageActivation } from "../../app-types.js";
import type { PipelineLogger } from "../../telemetry/index.js";
import type { CopilotClient } from "@github/copilot-sdk";
import type { VersionControl } from "../../ports/version-control.js";
import type { StateStore } from "../../ports/state-store.js";
import type { Shell } from "../../ports/shell.js";
import type { FeatureFilesystem } from "../../ports/feature-filesystem.js";
import type { CopilotSessionRunner } from "../../ports/copilot-session-runner.js";
import type { TriageLlm } from "../../ports/triage-llm.js";
import type { TriageArtifactLoader } from "../../ports/triage-artifact-loader.js";
import type { BaselineLoader } from "../../ports/baseline-loader.js";

export interface ContextBuilderConfig {
  readonly slug: string;
  readonly appRoot: string;
  readonly repoRoot: string;
  readonly baseBranch: string;
  readonly apmContext: ApmCompiledOutput;
  readonly logger: PipelineLogger;
  readonly client?: CopilotClient;
  readonly triageLlm?: TriageLlm;
  readonly triageArtifacts?: TriageArtifactLoader;
  readonly baselineLoader?: BaselineLoader;
  readonly vcs: VersionControl;
  readonly stateReader: Pick<StateStore, "getStatus">;
  readonly shell: Shell;
  readonly filesystem: FeatureFilesystem;
  readonly copilotSessionRunner: CopilotSessionRunner;
}

/**
 * Build a frozen NodeContext for a handler invocation.
 *
 * @param item - The DAG item being dispatched
 * @param node - The workflow node definition (may be undefined for unknown items)
 * @param dagState - Frozen DAG state snapshot
 * @param runState - Frozen run state snapshot
 * @param config - Immutable pipeline configuration
 * @param previousAttempt - Summary from the most recent failed attempt, if any
 * @param downstreamFailures - Summaries from failed downstream items
 * @param triageActivation - When dispatching a triage node via activation,
 *                           carries the failing node's context (key, error,
 *                           signature, routes, summary) so the triage handler
 *                           can classify without consulting state.
 */
export function buildNodeContext(
  item: AvailableItem,
  node: ApmWorkflowNode | undefined,
  dagState: Readonly<PipelineState>,
  runState: Readonly<RunState>,
  config: ContextBuilderConfig,
  previousAttempt?: Readonly<ItemSummary>,
  downstreamFailures?: ReadonlyArray<Readonly<ItemSummary>>,
  triageActivation?: Readonly<TriageActivation>,
): NodeContext {
  const attempt = (runState.attemptCounts[item.key] ?? 0) + 1;
  const effectiveAttempts = attempt; // Can be enriched with persisted cycle counts

  // Aggregate handler data from all upstream handlers
  const handlerData: Record<string, unknown> = {};
  for (const [key, bag] of Object.entries(runState.handlerOutputs)) {
    for (const [k, v] of Object.entries(bag)) {
      handlerData[`${key}.${k}`] = v;
    }
    // Also expose flat keys for backward compat
    Object.assign(handlerData, bag);
  }

  return {
    itemKey: item.key,
    executionId: randomUUID(),
    slug: config.slug,
    appRoot: config.appRoot,
    repoRoot: config.repoRoot,
    baseBranch: config.baseBranch,
    attempt,
    effectiveAttempts,
    environment: config.apmContext.config?.environment ?? {},
    apmContext: config.apmContext,
    pipelineState: dagState,
    previousAttempt,
    downstreamFailures,
    pipelineSummaries: runState.pipelineSummaries,
    forceRunChanges: runState.forceRunChangesDetected[item.key],
    preStepRefs: runState.preStepRefs,
    handlerData,
    onHeartbeat: () => {}, // Placeholder — wired by the loop layer
    client: config.client,
    triageLlm: config.triageLlm,
    triageArtifacts: config.triageArtifacts,
    baselineLoader: config.baselineLoader,
    logger: config.logger,
    vcs: config.vcs,
    stateReader: config.stateReader,
    shell: config.shell,
    filesystem: config.filesystem,
    copilotSessionRunner: config.copilotSessionRunner,
    // Failure context — populated when dispatching a triage node via
    // activation, so the triage handler can classify without re-reading
    // state. Undefined for regular handlers.
    failingNodeKey: triageActivation?.failingKey,
    rawError: triageActivation?.rawError,
    errorSignature: triageActivation?.errorSignature,
    failingNodeSummary: triageActivation?.failingNodeSummary,
    failureRoutes: triageActivation?.failureRoutes,
    structuredFailure: triageActivation?.structuredFailure,
  };
}
