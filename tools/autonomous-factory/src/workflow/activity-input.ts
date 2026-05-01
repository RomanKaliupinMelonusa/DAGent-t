/**
 * src/workflow/activity-input.ts — Pure projections from DagState +
 * PipelineInput to activity wire types.
 *
 * Extracted from `pipeline.workflow.ts` so the batch dispatcher and
 * triage driver can build activity inputs without re-importing the
 * workflow body. All three functions are pure (no I/O, no clock, no
 * mutation of inputs); they only read `DagState.snapshot()` and copy
 * fields into `NodeActivityInput` / `PipelineState` shapes.
 */

import type { DagState } from "./dag-state.js";
import type { TriageDispatch } from "./triage-cascade.js";
import type { NodeActivityInput } from "../activities/types.js";
import type { PipelineInput } from "./pipeline-types.js";
import type { PipelineState, PipelineItem } from "../types.js";

/**
 * Build the `PipelineState` that activities consume. Fold the current
 * DagState snapshot (items, errorLog, dependencies, …) plus the
 * invocation ledger so consumer nodes can resolve `consumes_artifacts`
 * via `pipelineState.artifacts` without falling through to disk.
 */
export function buildPipelineState(
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
): PipelineState {
  const snap = dag.snapshot();
  const items: PipelineItem[] = snap.state.items.map((i) => ({
    key: i.key,
    label: i.label,
    agent: i.agent ?? null,
    status: i.status,
    error: null,
  }));
  return {
    feature: input.slug,
    workflowName: input.workflowName,
    started: startedIso,
    deployedUrl: null,
    implementationNotes: null,
    items,
    errorLog: snap.state.errorLog.map((e) => ({
      timestamp: e.timestamp,
      itemKey: e.itemKey,
      message: e.message,
      errorSignature: e.errorSignature ?? null,
    })),
    dependencies: snap.state.dependencies,
    nodeTypes: snap.state.nodeTypes,
    nodeCategories: snap.state.nodeCategories,
    jsonGated: {},
    naByType: snap.state.naByType,
    salvageSurvivors: snap.state.salvageSurvivors,
    // Cause-A fix — surface the invocation ledger so `materializeUpstream`
    // (`activities/support/invocation-builder.ts`) can resolve completed
    // producer outputs from in-memory state.
    artifacts: { ...dag.getInvocationLedger() },
  };
}

/**
 * Build the activity input for a regular node dispatch (anything that
 * isn't a triage rerun). Failure-context fields stay empty — only the
 * triage variant populates those.
 */
export function buildActivityInput(
  itemKey: string,
  attempt: number,
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
  executionId: string,
): NodeActivityInput {
  const pipelineState = buildPipelineState(dag, input, startedIso);
  return {
    itemKey,
    executionId,
    slug: input.slug,
    appRoot: input.appRoot,
    repoRoot: input.repoRoot,
    baseBranch: input.baseBranch,
    specFile: input.specFile,
    attempt,
    effectiveAttempts: attempt,
    environment: { ...input.environment },
    apmContextPath: input.apmContextPath,
    workflowName: input.workflowName,
    pipelineState,
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    failureRoutes: {},
  } satisfies NodeActivityInput;
}

/**
 * Build the activity input for a triage dispatch. Mirrors
 * `buildActivityInput` but populates the failure-context fields
 * (`failingNodeKey`, `rawError`, `errorSignature`, …) the triage
 * handler reads to classify the upstream failure.
 */
export function buildTriageActivityInput(
  dispatch: TriageDispatch,
  attempt: number,
  dag: DagState,
  input: PipelineInput,
  startedIso: string,
  executionId: string,
): NodeActivityInput {
  const pipelineState = buildPipelineState(dag, input, startedIso);
  const base: NodeActivityInput = {
    itemKey: dispatch.triageNodeKey,
    executionId,
    slug: input.slug,
    appRoot: input.appRoot,
    repoRoot: input.repoRoot,
    baseBranch: input.baseBranch,
    specFile: input.specFile,
    attempt,
    effectiveAttempts: attempt,
    environment: { ...input.environment },
    apmContextPath: input.apmContextPath,
    workflowName: input.workflowName,
    pipelineState,
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
    failingNodeKey: dispatch.failingKey,
    ...(dispatch.failingInvocationId
      ? { failingInvocationId: dispatch.failingInvocationId }
      : {}),
    rawError: dispatch.rawError,
    errorSignature: dispatch.errorSignature,
    failingNodeSummary: dispatch.failingNodeSummary,
    failureRoutes: { ...dispatch.failureRoutes },
    ...(dispatch.structuredFailure !== undefined
      ? { structuredFailure: dispatch.structuredFailure }
      : {}),
  };
  return base;
}
