/**
 * dispatch/context-builder.ts — Builds NodeContext from kernel snapshots.
 *
 * Assembles the immutable NodeContext that every handler receives.
 * Replaces the mutable context assembly that was inline in session-runner.ts.
 */

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
import type { InvocationFilesystem } from "../../ports/invocation-filesystem.js";
import { FileInvocationLogger } from "../../adapters/file-invocation-logger.js";
import { MultiplexLogger } from "../../telemetry/multiplex-logger.js";
import type { SecretRedactor } from "../../adapters/secret-redactor.js";
import type { CopilotSessionRunner } from "../../ports/copilot-session-runner.js";
import type { TriageLlm } from "../../ports/triage-llm.js";
import type { TriageArtifactLoader } from "../../ports/triage-artifact-loader.js";
import type { BaselineLoader } from "../../ports/baseline-loader.js";
import type { ArtifactBus } from "../../ports/artifact-bus.js";
import { newInvocationId } from "../../kernel/invocation-id.js";

export interface ContextBuilderConfig {
  readonly slug: string;
  readonly appRoot: string;
  readonly repoRoot: string;
  readonly baseBranch: string;
  readonly specFile: string;
  readonly apmContext: ApmCompiledOutput;
  readonly logger: PipelineLogger;
  readonly client?: CopilotClient;
  readonly triageLlm?: TriageLlm;
  readonly triageArtifacts: TriageArtifactLoader;
  readonly baselineLoader?: BaselineLoader;
  readonly vcs: VersionControl;
  readonly stateReader: Pick<StateStore, "getStatus">;
  /**
   * Narrow ledger-mutation port forwarded into `NodeContext.ledger`. The
   * composition root passes the same `StateStore` instance it uses for
   * append/seal so middleware-side lineage writes hit the same lock and
   * JSONL tail as the dispatch hook.
   */
  readonly ledger: Pick<
    StateStore,
    "attachInvocationInputs" | "attachInvocationRoutedTo"
  >;
  readonly shell: Shell;
  readonly filesystem: FeatureFilesystem;
  readonly artifactBus: ArtifactBus;
  readonly invocation: InvocationFilesystem;
  readonly copilotSessionRunner: CopilotSessionRunner;
  /**
   * Track B3: optional secret redactor applied to per-invocation logs.
   * Built once per pipeline run from `apmContext.config.environment`
   * and reused across every invocation. When omitted, logs are written
   * verbatim (preserving Buffer fidelity for raw chunks).
   */
  readonly logRedactor?: SecretRedactor;
  /**
   * Session C: advisory PWA-Kit API-drift markdown produced by the pinned
   * dependency preflight. Forwarded into `NodeContext` so `buildAgentContext`
   * can surface it to the agents that consult the vendored reference
   * snapshot. Absent when no drift / no snapshot configured.
   */
  readonly pwaKitDriftReport?: string;
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

  // Resolve the item's currently-pointed-at invocation record (if any).
  // The dispatch hook stamps `startedAt` on a staged record when present;
  // otherwise it appends a fresh record using `executionId` allocated
  // below. When a staged record exists we adopt its invocationId so the
  // ledger and on-disk artifact tree share the same id end-to-end.
  const item_ = dagState.items.find((i) => i.key === item.key);
  const stagedRecord = item_?.latestInvocationId
    ? dagState.artifacts?.[item_.latestInvocationId]
    : undefined;
  const adoptStaged =
    stagedRecord !== undefined &&
    stagedRecord.sealed !== true &&
    !stagedRecord.startedAt;
  const executionId = adoptStaged ? stagedRecord!.invocationId : newInvocationId();

  // Phase 4 — per-invocation logger. Created from the canonical paths
  // (which `ensureInvocationDir` will create lazily on first write); the
  // logger itself never throws upward, so it's safe to instantiate eagerly.
  const handles = config.invocation.pathsFor(config.slug, item.key, executionId);
  const invocationLogger = new FileInvocationLogger(handles.logsDir, config.logRedactor);
  // Tee the global PipelineLogger into the per-invocation file sink so
  // every `ctx.logger.event(...)` call also lands in
  // `<inv>/logs/{events,tool-calls,messages}.jsonl`. See
  // `telemetry/multiplex-logger.ts` for the kind→sink mapping.
  const teedLogger = new MultiplexLogger(config.logger, invocationLogger);

  return {
    itemKey: item.key,
    // Artifact-bus invocation id (Phase 1 remainder). The `executionId`
    // field name is preserved for compatibility with the existing
    // `NodeContext` / `ExecutionRecord` surface; its *value* is now a
    // valid `inv_`-prefixed ULID that the ArtifactBus can use as the
    // per-dispatch directory key under
    // `in-progress/<slug>/<nodeKey>/<invocationId>/`.
    executionId,
    ...(adoptStaged ? { currentInvocation: stagedRecord } : {}),
    slug: config.slug,
    appRoot: config.appRoot,
    repoRoot: config.repoRoot,
    baseBranch: config.baseBranch,
    specFile: config.specFile,
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
    logger: teedLogger,
    vcs: config.vcs,
    stateReader: config.stateReader,
    ledger: config.ledger,
    shell: config.shell,
    filesystem: config.filesystem,
    artifactBus: config.artifactBus,
    invocation: config.invocation,
    invocationLogger,
    copilotSessionRunner: config.copilotSessionRunner,
    // Failure context — populated when dispatching a triage node via
    // activation, so the triage handler can classify without re-reading
    // state. Undefined for regular handlers.
    failingNodeKey: triageActivation?.failingKey,
    ...(triageActivation?.failingInvocationId
      ? { failingInvocationId: triageActivation.failingInvocationId }
      : {}),
    rawError: triageActivation?.rawError,
    errorSignature: triageActivation?.errorSignature,
    failingNodeSummary: triageActivation?.failingNodeSummary,
    failureRoutes: triageActivation?.failureRoutes,
    structuredFailure: triageActivation?.structuredFailure,
    ...(config.pwaKitDriftReport ? { pwaKitDriftReport: config.pwaKitDriftReport } : {}),
  };
}
