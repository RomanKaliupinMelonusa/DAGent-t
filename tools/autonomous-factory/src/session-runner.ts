/**
 * session-runner.ts — Orchestration kernel for individual pipeline items.
 *
 * This module is the thin dispatcher that routes each DAG step to a
 * registered NodeHandler via the handler plugin system. All heavyweight
 * logic lives in handler implementations under `handlers/`:
 *   - handlers/local-exec.ts      — Generic local script execution (push, publish, tests)
 *   - handlers/github-ci-poll.ts  — CI workflow polling with transient retry
 *   - handlers/copilot-agent.ts   — Full Copilot SDK agent session lifecycle
 *   - handlers/triage.ts          — Failure classification (RAG + LLM)
 *
 * Supporting modules:
 *   - session/shared.ts           — Workflow node helpers, reporting utilities
 *   - session/readiness-probe.ts  — Data-plane readiness polling and validation hooks
 *
 * Retained here:
 *   - PipelineRunState / PipelineRunConfig / SessionResult interfaces
 *   - runItemSession()  — Unified dispatch (auto-skip, readiness, handler routing, state transitions)
 *   - resolveTriageActivation() — Builds TriageActivation payload for watchdog dispatch
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CopilotClient } from "@github/copilot-sdk";
import { getStatus, failItem, completeItem, salvageForDraft } from "./state.js";
import type { ApmCompiledOutput } from "./apm-types.js";
import type { NextAction, ItemSummary } from "./types.js";
import type { PipelineLogger } from "./logger.js";
import { writeFlightData } from "./reporting.js";

// ── Submodule imports ──────────────────────────────────────────────────────
import {
  getWorkflow,
  getWorkflowNode,
  getHeadSha,
  resolveCircuitBreaker,
  flushReports,
  finishItem,
  mergeTelemetry,
} from "./session/shared.js";
import { pollReadiness } from "./session/readiness-probe.js";
import { runPreHook, runPostHook, captureHeadSha } from "./session/lifecycle-hooks.js";
import type { HookContext } from "./session/lifecycle-hooks.js";
import { resolveHandler, inferHandler, evaluateAutoSkip } from "./handlers/index.js";
import type { NodeContext, NodeResult, DagCommand } from "./handlers/index.js";
import type { TriageRecord } from "./types.js";
import { RESET_OPS } from "./types.js";
import { computeErrorSignature } from "./triage/error-fingerprint.js";
import { isOrchestratorTimeout, isUnfixableError } from "./triage.js";
import { checkRetryDedup } from "./triage/context-builder.js";
import { createNodeWrapper } from "./node-wrapper.js";
import { executeCommands } from "./command-executor.js";


// ---------------------------------------------------------------------------
// Shared mutable state passed from the orchestrator
// ---------------------------------------------------------------------------

/** All mutable state that persists across pipeline iterations */
export interface PipelineRunState {
  /** Collected summaries across the whole pipeline run */
  pipelineSummaries: ItemSummary[];
  /** Track attempt number per item key across retries */
  attemptCounts: Record<string, number>;
  /** Track git commit SHA before each dev step for reliable change detection */
  preStepRefs: Record<string, string>;
  /**
   * Telemetry from a prior session's _SUMMARY.md, parsed once at boot time.
   * Guarantees monotonic metric accumulation across sessions — every flush
   * simply adds baseTelemetry to the current session's totals.
   */
  baseTelemetry: import("./reporting.js").PreviousSummaryTotals | null;
  /**
   * Accumulated handler output from all preceding items in this pipeline run.
   * Keyed by item key. The kernel propagates the full bag into handlerData
   * so downstream handlers can access output from any upstream handler.
   * Also stores `lastPushedSha` for deploy nodes (previously in a separate map).
   */
  handlerOutputs: Record<string, Record<string, unknown>>;
  /** Per-item flag: whether force_run_if_changed dirs had changes (set by evaluateAutoSkip, consumed by copilot-agent handler via ctx.forceRunChanges). Keyed by item key to prevent cross-contamination in parallel batches. */
  forceRunChangesDetected: Record<string, boolean>;
  /**
   * Temporary payload for triage dispatch through the standard pipeline.
   * Set by the watchdog before calling runItemSession for a triage node,
   * consumed by stepResolve to populate failure context on NodeContext.
   * Cleared by the watchdog after the triage session completes.
   */
  pendingTriageActivation?: TriageActivation | undefined;
}

/** Immutable config for the pipeline run */
export interface PipelineRunConfig {
  slug: string;
  workflowName: string;
  appRoot: string;
  repoRoot: string;
  baseBranch: string;
  apmContext: ApmCompiledOutput;
  roamAvailable: boolean;
  logger: PipelineLogger;
}

export interface SessionResult {
  summary: ItemSummary;
  halt: boolean;
  createPr: boolean;
  approvalPending?: boolean;
  /** When set, the kernel should dispatch a triage node for failure classification.
   *  The watchdog reads this after runItemSession returns and dispatches the
   *  triage node through the standard pipeline (runItemSession again). */
  triageActivation?: TriageActivation;
}

/**
 * Payload for activating a triage node via the standard dispatch pipeline.
 * Carries the failure context that the triage handler needs.
 */
export interface TriageActivation {
  /** Key of the triage node to dispatch. */
  triageNodeKey: string;
  /** Key of the node that failed. */
  failingKey: string;
  /** Raw error message from the failing node. */
  rawError: string;
  /** Stable error fingerprint (SHA-256 prefix). */
  errorSignature: string;
  /** Route map from the failing node's on_failure.routes. */
  failureRoutes: Record<string, string | null>;
  /** Summary snapshot of the failing node's last attempt. */
  failingNodeSummary: ItemSummary;
}

// ---------------------------------------------------------------------------
// Dispatch pipeline — composable middleware for item execution
// ---------------------------------------------------------------------------

import type { ApmWorkflowNode } from "./apm-types.js";
import type { NodeHandler } from "./handlers/index.js";
import type { ResolvedCircuitBreaker } from "./session/shared.js";

/**
 * Mutable context that flows through the dispatch pipeline.
 * Accumulated by each step — earlier steps populate fields that later
 * steps read. Avoids re-computation and makes each step independently testable.
 */
export interface DispatchContext {
  // ── Immutable inputs (set once at pipeline entry) ─────────────────
  readonly client: CopilotClient;
  readonly next: NextAction & { key: string };
  readonly config: PipelineRunConfig;
  readonly state: PipelineRunState;

  // ── Mutable fields (accumulated by steps) ─────────────────────────
  /** Resolved workflow node (populated by stepInit) */
  node: ApmWorkflowNode | undefined;
  /** Resolved circuit breaker config (populated by stepInit) */
  cb: ResolvedCircuitBreaker;
  /** Item telemetry summary (populated by stepInit) */
  itemSummary: ItemSummary;
  /** Step start timestamp in ms (populated by stepInit) */
  stepStart: number;
  /** Resolved handler (populated by stepResolve) */
  handler?: NodeHandler;
  /** Assembled NodeContext for the handler (populated by stepResolve) */
  handlerCtx?: NodeContext;
  /** Lifecycle hook context (populated by stepResolve) */
  hookCtx?: HookContext;
  /** Handler execution result (populated by stepExecute) */
  result?: NodeResult;
}

/**
 * A dispatch step is a named async function that may:
 * - Return a SessionResult to short-circuit the pipeline (early exit)
 * - Return undefined to continue to the next step
 * - Mutate the DispatchContext to pass data downstream
 */
export type DispatchStep = (dc: DispatchContext) => Promise<SessionResult | undefined | void>;

// ---------------------------------------------------------------------------
// Failure-edge dispatch — on_failure triage routing
// ---------------------------------------------------------------------------

/**
 * Resolve the on_failure target for a workflow node.
 * Resolution order:
 *   1. Node-level `on_failure.triage` (explicit per-node target)
 *   2. Node-level `on_failure` string (backward compat)
 *   3. Deprecated `triage` field shim (look up triage node by profile name)
 *   4. Workflow-level `default_triage` (catch-all for the entire workflow)
 *
 * Returns the triage node key, or undefined if no failure routing is configured
 * at any level.
 */
function resolveOnFailureTarget(
  apmContext: ApmCompiledOutput,
  workflowName: string,
  itemKey: string,
): string | undefined {
  const node = getWorkflowNode(apmContext, workflowName, itemKey);
  if (!node) return undefined;
  // New path: on_failure is an object with `.triage` pointing to the triage node
  if (node.on_failure && typeof node.on_failure === "object" && "triage" in node.on_failure) {
    return (node.on_failure as { triage: string }).triage;
  }
  // String form (backward compat for in-flight compiled contexts)
  if (typeof node.on_failure === "string") return node.on_failure;
  // Deprecated shim: triage → resolve to an implicit triage node key
  if (node.triage) {
    const workflow = getWorkflow(apmContext, workflowName);
    if (workflow) {
      for (const [key, n] of Object.entries(workflow.nodes)) {
        if (n.type === "triage" && n.triage_profile === node.triage) return key;
      }
    }
  }
  // Fallback: workflow-level default_triage (catch-all)
  const workflow = getWorkflow(apmContext, workflowName);
  if (workflow?.default_triage) return workflow.default_triage;
  return undefined;
}

/**
 * Extract the on_failure.routes map from a workflow node.
 * Falls back to workflow-level default_routes if node has none.
 * Returns the routes map or an empty object if not configured at any level.
 */
function resolveOnFailureRoutes(
  apmContext: ApmCompiledOutput,
  workflowName: string,
  itemKey: string,
): Record<string, string | null> {
  const node = getWorkflowNode(apmContext, workflowName, itemKey);
  if (node?.on_failure && typeof node.on_failure === "object") {
    const nodeRoutes = (node.on_failure as { routes?: Record<string, string | null> }).routes;
    if (nodeRoutes && Object.keys(nodeRoutes).length > 0) return nodeRoutes;
  }
  // Fallback: workflow-level default_routes
  const workflow = getWorkflow(apmContext, workflowName);
  return workflow?.default_routes ?? {};
}

/**
 * Resolve the triage activation payload for a failing node.
 * Returns a TriageActivation if a triage target can be resolved,
 * or undefined if no failure routing is configured.
 *
 * This is the new path that replaces dispatchOnFailure — the watchdog
 * dispatches the triage node through the standard runItemSession pipeline.
 */
function resolveTriageActivation(
  failingKey: string,
  rawError: string,
  itemSummary: ItemSummary,
  config: PipelineRunConfig,
): TriageActivation | undefined {
  const { workflowName, apmContext, logger } = config;

  const triageNodeKey = resolveOnFailureTarget(apmContext, workflowName, failingKey);
  if (!triageNodeKey) {
    logger.event("item.end", failingKey, {
      outcome: "error",
      halted: true,
      error_preview: `No triage target found for "${failingKey}" (no on_failure, no default_triage, no triage-type node in workflow "${workflowName}")`,
    });
    return undefined;
  }

  const failureRoutes = resolveOnFailureRoutes(apmContext, workflowName, failingKey);
  const errorSig = computeErrorSignature(rawError);

  return {
    triageNodeKey,
    failingKey,
    rawError,
    errorSignature: errorSig,
    failureRoutes,
    failingNodeSummary: { ...itemSummary },
  };
}

// ---------------------------------------------------------------------------
// Unified kernel state transitions — single authority
// ---------------------------------------------------------------------------

/**
 * Idempotent kernel completion. Checks pipeline state before mutating to
 * gracefully handle the case where the SDK agent already called
 * `pipeline:complete` during its session.
 */
async function kernelComplete(
  slug: string,
  key: string,
  logger: PipelineLogger,
): Promise<void> {
  const state = await getStatus(slug);
  const item = state.items.find((i) => i.key === key);
  if (item?.status === "done") {
    logger.event("item.end", key, { outcome: "completed", note: "already completed by handler/agent" });
    return;
  }
  await completeItem(slug, key);
  logger.event("item.end", key, { outcome: "completed" });
}

/**
 * Idempotent kernel failure. Checks pipeline state before mutating to
 * gracefully handle the case where the SDK agent already called
 * `pipeline:fail` during its session.
 * Returns `{ failCount, halted }` like `failItem()`.
 */
async function kernelFail(
  slug: string,
  key: string,
  error: string,
  logger: PipelineLogger,
): Promise<{ failCount: number; halted: boolean }> {
  const state = await getStatus(slug);
  const item = state.items.find((i) => i.key === key);
  if (item?.status === "failed") {
    // Already failed by agent — derive count from existing error log
    const failCount = state.errorLog.filter((e: { itemKey: string }) => e.itemKey === key).length;
    const halted = failCount >= 10;
    logger.event("item.end", key, { outcome: "failed", note: "already failed by handler/agent", fail_count: failCount });
    return { failCount, halted };
  }
  const result = await failItem(slug, key, error);
  return { failCount: result.failCount, halted: result.halted };
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Dispatch steps — composable middleware for runItemSession
// ---------------------------------------------------------------------------

/**
 * Step 1: Init — logging, HEAD snapshot, create ItemSummary.
 */
const stepInit: DispatchStep = async (dc) => {
  const { next, config, state } = dc;
  const { repoRoot, logger } = config;
  const { attemptCounts, preStepRefs } = state;

  logger.setAttempt(next.key, attemptCounts[next.key]);
  logger.event("item.start", next.key, {
    label: next.label,
    agent: next.agent,
    node_type: dc.node?.type ?? "agent",
    category: dc.node?.category ?? "unknown",
  });

  if (!preStepRefs[next.key]) {
    const ref = getHeadSha(repoRoot);
    if (ref) preStepRefs[next.key] = ref;
  }

  dc.stepStart = Date.now();
  dc.itemSummary = {
    key: next.key,
    label: next.label,
    agent: next.agent ?? "unknown",
    attempt: attemptCounts[next.key],
    startedAt: new Date().toISOString(),
    finishedAt: "",
    durationMs: 0,
    outcome: "completed",
    intents: [],
    messages: [],
    filesRead: [],
    filesChanged: [],
    shellCommands: [],
    toolCounts: {},
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  return;
};

/**
 * Step 3: Auto-skip — skip if no changes in declared directories.
 */
const stepAutoSkip: DispatchStep = async (dc) => {
  const { next, config, state } = dc;
  const { slug, appRoot, repoRoot, baseBranch, apmContext, logger } = config;
  const { preStepRefs } = state;

  const skipDecision = evaluateAutoSkip(next.key, apmContext, repoRoot, baseBranch, appRoot, preStepRefs, config.workflowName);
  state.forceRunChangesDetected[next.key] = skipDecision.forceRunChanges;
  if (skipDecision.skip) {
    await kernelComplete(slug, next.key, logger);
    logger.event("item.skip", next.key, { skip_type: "auto_skip", reason: skipDecision.skip.reason });
    return finishItem(dc.itemSummary, "completed", dc.stepStart, config, state, {
      intents: [skipDecision.skip.reason],
    });
  }
  return;
};

/**
 * Step 4: Readiness probe — poll data-plane health if required.
 */
const stepReadiness: DispatchStep = async (dc) => {
  if (dc.node?.requires_data_plane_ready) {
    await pollReadiness(dc.config);
  }
  return;
};

/**
 * Step 5: Resolve handler + build NodeContext.
 * Populates dc.handler, dc.handlerCtx, dc.hookCtx.
 */
const stepResolve: DispatchStep = async (dc) => {
  const { next, config, state, node, cb, client } = dc;
  const { slug, appRoot, repoRoot, baseBranch, apmContext, logger } = config;
  const { pipelineSummaries, attemptCounts, preStepRefs } = state;

  // Resolve handler
  const handlerRef = node?.handler ?? inferHandler(node?.type ?? "agent", node?.script_type, apmContext.config?.handler_defaults);
  if (!handlerRef) {
    throw new Error(
      node?.type === "script"
        ? `BUG: Script item "${next.key}" has type "script" but no script_type or handler declared. Never route script items to LLM sessions.`
        : `Could not resolve handler for "${next.key}" (type=${node?.type}, script_type=${node?.script_type})`,
    );
  }
  dc.handler = await resolveHandler(handlerRef, appRoot, repoRoot, apmContext.config?.handlers);

  // Build handler context
  const currentState = await getStatus(slug);
  const executionId = randomUUID();

  // Wrap the handler with the node wrapper for execution tracking
  dc.handler = createNodeWrapper(dc.handler, {
    circuitBreaker: cb,
    attempt: attemptCounts[next.key],
    slug,
    repoRoot,
    headBefore: state.preStepRefs[next.key],
  });

  const previousAttempt = attemptCounts[next.key] > 1
    ? [...pipelineSummaries].reverse().find((s) => s.key === next.key)
    : undefined;

  const redevCategories = new Set(apmContext.config?.redevelopment_categories ?? ["test"]);
  const downstreamFailures = pipelineSummaries.filter(
    (s) => s.outcome !== "completed" && s.key !== next.key &&
      redevCategories.has(getWorkflowNode(apmContext, config.workflowName, s.key)?.category ?? ""),
  );

  let lastHeartbeat = 0;
  const onHeartbeat = () => {
    if (Date.now() - lastHeartbeat < 1500) return;
    lastHeartbeat = Date.now();
    const liveSummaries = [...pipelineSummaries, { ...dc.itemSummary, outcome: "in-progress" as const }];
    writeFlightData(appRoot, slug, liveSummaries, true);
  };

  const handlerData: Record<string, unknown> = {};
  for (const [itemKey, outputs] of Object.entries(state.handlerOutputs)) {
    for (const [k, v] of Object.entries(outputs)) {
      handlerData[`${itemKey}:${k}`] = v;
    }
  }
  if (preStepRefs[next.key]) {
    handlerData["preStepRef"] = preStepRefs[next.key];
  }

  dc.handlerCtx = {
    itemKey: next.key,
    executionId,
    slug,
    appRoot,
    repoRoot,
    baseBranch,
    attempt: attemptCounts[next.key],
    effectiveAttempts: attemptCounts[next.key],
    environment: (apmContext.config?.environment as Record<string, string>) ?? {},
    apmContext,
    pipelineState: currentState,
    previousAttempt,
    downstreamFailures: downstreamFailures.length > 0 ? downstreamFailures : undefined,
    pipelineSummaries: [...pipelineSummaries],
    forceRunChanges: state.forceRunChangesDetected[next.key] || undefined,
    handlerData,
    onHeartbeat,
    client,
    logger,
  };

  // ── Triage activation: inject failure context from pendingTriageActivation ──
  // When the watchdog dispatches a triage node through the standard pipeline,
  // it stores the activation payload in state.pendingTriageActivation.
  // stepResolve populates the failure-specific NodeContext fields from it.
  const triageActivation = state.pendingTriageActivation;
  if (triageActivation && next.key === triageActivation.triageNodeKey) {
    Object.assign(dc.handlerCtx, {
      failingNodeKey: triageActivation.failingKey,
      rawError: triageActivation.rawError,
      errorSignature: triageActivation.errorSignature,
      failingNodeSummary: triageActivation.failingNodeSummary,
      failureRoutes: triageActivation.failureRoutes,
    });
  }

  dc.hookCtx = { node, itemKey: next.key, slug, appRoot, repoRoot, baseBranch, logger };

  // ── Handoff contract validation ──────────────────────────────────────
  // Check `consumes` from workflows.yml and `metadata.inputs` from handler.
  // Warns on missing optional keys, fails on missing required keys.
  const consumeEntries = node?.consumes ?? [];
  const handlerInputs = dc.handler?.metadata?.inputs ?? {};

  // Merge: YAML consumes + handler metadata inputs (handler metadata is authoritative for "required" level)
  const allRequired: Array<{ key: string; from: string; required: boolean }> = [...consumeEntries];
  for (const [inputKey, level] of Object.entries(handlerInputs)) {
    // Only add if not already declared in YAML consumes
    if (!allRequired.some((c) => c.key === inputKey)) {
      allRequired.push({ key: inputKey, from: "*", required: level === "required" });
    }
  }

  const missingRequired: string[] = [];
  for (const entry of allRequired) {
    // Look up the key in handlerData: "from:key" if from is specific, any "*:key" suffix match if from is "*"
    let found = false;
    if (entry.from !== "*") {
      found = `${entry.from}:${entry.key}` in handlerData;
    } else {
      found = Object.keys(handlerData).some((k) => k.endsWith(`:${entry.key}`));
    }
    if (!found) {
      if (entry.required) {
        missingRequired.push(`${entry.key} (from: ${entry.from})`);
      } else {
        logger.event("handoff.inject", next.key, {
          injection_types: [`missing_optional:${entry.key}`],
          note: `Optional handoff key "${entry.key}" not available from upstream`,
        });
      }
    }
  }
  if (missingRequired.length > 0) {
    logger.event("handoff.inject", next.key, {
      injection_types: missingRequired.map((k) => `missing_required:${k}`),
      note: `Required handoff keys missing — upstream nodes may not have produced them`,
    });
    // Log warning but don't fail — handler may have fallback logic.
    // In strict mode (future), this could return an error result.
  }

  return;
};

/**
 * Step 6: Handler shouldSkip — handler-specific skip check.
 */
const stepHandlerSkip: DispatchStep = async (dc) => {
  const { next, config, state, handler, handlerCtx } = dc;
  const { slug, logger } = config;

  if (!handler?.shouldSkip || !handlerCtx) return;
  const skipResult = await handler.shouldSkip(handlerCtx);
  if (skipResult) {
    logger.event("item.skip", next.key, { skip_type: "handler_skip", reason: skipResult.reason });
    await kernelComplete(slug, next.key, logger);
    if (skipResult.filesChanged) {
      for (const f of skipResult.filesChanged) {
        if (!dc.itemSummary.filesChanged.includes(f)) dc.itemSummary.filesChanged.push(f);
      }
    }
    return finishItem(dc.itemSummary, "completed", dc.stepStart, config, state, {
      intents: [skipResult.reason],
    });
  }
  return;
};

/**
 * Step 7: Pre-hook — execute node.pre lifecycle hook.
 */
const stepPreHook: DispatchStep = async (dc) => {
  const { next, config, state, hookCtx } = dc;
  const { slug, logger } = config;

  if (!hookCtx) return;
  const preHookResult = runPreHook(hookCtx);
  if (!preHookResult.ok) {
    logger.event("item.end", next.key, { outcome: "failed", error_preview: preHookResult.errorMessage?.slice(0, 200) });
    dc.itemSummary.outcome = "failed";
    dc.itemSummary.errorMessage = preHookResult.errorMessage;
    try { await kernelFail(slug, next.key, preHookResult.errorMessage ?? "pre-hook failed", logger); } catch { /* best-effort */ }
    return finishItem(dc.itemSummary, "failed", dc.stepStart, config, state, { halt: false });
  }
  return;
};

// ---------------------------------------------------------------------------
// Pre-triage guards — kernel responsibility (Phase 5)
// ---------------------------------------------------------------------------

/** Build a TriageRecord for guard-terminated paths (no classification ran). */
function buildGuardRecord(
  failingItem: string,
  errorSig: string,
  guardResult: TriageRecord["guard_result"],
  guardDetail: string,
  domain: string,
  reason: string,
): TriageRecord {
  return {
    failing_item: failingItem,
    error_signature: errorSig,
    guard_result: guardResult,
    guard_detail: guardDetail,
    rag_matches: [],
    rag_selected: null,
    llm_invoked: false,
    domain,
    reason,
    source: "fallback",
    route_to: failingItem,
    cascade: [],
    cycle_count: 0,
    domain_retry_count: 0,
  };
}

/** Build DagCommands for graceful degradation (salvage to Draft PR). */
function buildSalvageCommands(
  failingKey: string,
  errorMsg: string,
  triageRecord: TriageRecord,
): DagCommand[] {
  return [
    { type: "set-triage-record", record: triageRecord },
    { type: "salvage-draft", failedItemKey: failingKey, reason: errorMsg },
  ];
}

/**
 * Step 7b: Triage guard — kernel pre-checks before the triage handler runs.
 * Only activates when the dispatch context carries a pendingTriageActivation
 * targeting this node. Four guards short-circuit classification:
 *   1. SDK timeout → transient retry (re-schedule $SELF)
 *   2. Unfixable signals → graceful degradation (salvage to Draft PR)
 *   3. Retry dedup (same error at same HEAD) → halt
 *   4. Death spiral (same error signature ≥ N times) → graceful degradation
 */
const stepTriageGuard: DispatchStep = async (dc) => {
  const { next, config, state } = dc;
  const { slug, appRoot, repoRoot, apmContext, logger } = config;
  const { itemSummary, stepStart } = dc;

  const activation = state.pendingTriageActivation;
  if (!activation || next.key !== activation.triageNodeKey) return;

  const { failingKey, rawError, errorSignature } = activation;
  const errorSig = errorSignature;

  // --- Guard 1: SDK timeout → transient retry ($SELF) ---
  if (isOrchestratorTimeout(rawError)) {
    const record = buildGuardRecord(
      failingKey, errorSig,
      "timeout_bypass", "SDK session timeout",
      "$SELF", "SDK timeout — transient retry",
    );
    const evId = logger.event("triage.evaluate", failingKey, { ...record });
    logger.blob(evId, "error_trace", rawError);
    const cmds: DagCommand[] = [{ type: "set-triage-record", record }];
    const reindexCats = new Set((apmContext.config?.reindex_categories as string[]) ?? ["dev", "test"]);
    await executeCommands(cmds, slug, appRoot, repoRoot, reindexCats, logger);
    return finishItem(itemSummary, "completed", stepStart, config, state, {
      intents: [`triage-guard: SDK timeout → retry ${failingKey}`],
    });
  }

  // --- Guard 2: Unfixable signals → graceful degradation ---
  const workflow = apmContext.workflows?.[config.workflowName];
  const unfixableSignals = workflow?.unfixable_signals ?? [];
  const unfixableReason = isUnfixableError(rawError, unfixableSignals);
  if (unfixableReason) {
    const record = buildGuardRecord(
      failingKey, errorSig,
      "unfixable_halt", unfixableReason,
      "blocked", `unfixable signal: ${unfixableReason}`,
    );
    const evId = logger.event("triage.evaluate", failingKey, { ...record });
    logger.blob(evId, "error_trace", rawError);
    const cmds = buildSalvageCommands(failingKey, rawError, record);
    const reindexCats = new Set((apmContext.config?.reindex_categories as string[]) ?? ["dev", "test"]);
    await executeCommands(cmds, slug, appRoot, repoRoot, reindexCats, logger);
    return finishItem(itemSummary, "completed", stepStart, config, state, {
      intents: [`triage-guard: unfixable signal "${unfixableReason}" → degradation`],
    });
  }

  // --- Guard 3: Retry dedup (same error at same HEAD → halt) ---
  try {
    const pipeState = await getStatus(slug);
    const executionLog = pipeState.executionLog ?? [];
    const failingNode = getWorkflowNode(apmContext, config.workflowName, failingKey);
    const cbConfig = resolveCircuitBreaker(failingNode);
    const failingRecords = executionLog.filter((r: { nodeKey: string }) => r.nodeKey === failingKey);
    const attemptCount = failingRecords.length > 0
      ? Math.max(...failingRecords.map((r: { attempt: number }) => r.attempt)) + 1
      : 1;
    const dedupResult = checkRetryDedup(
      failingKey, attemptCount, executionLog,
      repoRoot, cbConfig.allowsRevertBypass,
    );
    if (dedupResult?.halt) {
      const record = buildGuardRecord(
        failingKey, errorSig,
        "retry_dedup", dedupResult.reason,
        "blocked", dedupResult.reason,
      );
      const evId = logger.event("triage.evaluate", failingKey, { ...record });
      logger.blob(evId, "error_trace", rawError);
      const cmds = buildSalvageCommands(failingKey, rawError, record);
      const reindexCats = new Set((apmContext.config?.reindex_categories as string[]) ?? ["dev", "test"]);
      await executeCommands(cmds, slug, appRoot, repoRoot, reindexCats, logger);
      return finishItem(itemSummary, "completed", stepStart, config, state, {
        intents: [`triage-guard: retry dedup → halt (${dedupResult.reason})`],
      });
    }
  } catch { /* continue to next guard */ }

  // --- Guard 4: Death spiral (same error ≥N times) ---
  const deathSpiralThreshold = apmContext.config?.max_same_error_cycles ?? 3;
  try {
    const pipeState = await getStatus(slug);
    const sameSigCount = pipeState.errorLog.filter((e) => e.errorSignature === errorSig).length;
    if (sameSigCount >= deathSpiralThreshold) {
      const record = buildGuardRecord(
        failingKey, errorSig,
        "death_spiral", `signature ${errorSig} seen ${sameSigCount + 1}×`,
        "blocked", `death spiral — error signature ${errorSig} seen ${sameSigCount + 1} times`,
      );
      const evId = logger.event("triage.evaluate", failingKey, { ...record });
      logger.blob(evId, "error_trace", rawError);
      const cmds = buildSalvageCommands(failingKey, rawError, record);
      const reindexCats = new Set((apmContext.config?.reindex_categories as string[]) ?? ["dev", "test"]);
      await executeCommands(cmds, slug, appRoot, repoRoot, reindexCats, logger);
      return finishItem(itemSummary, "completed", stepStart, config, state, {
        intents: [`triage-guard: death spiral (${sameSigCount + 1}× same error) → degradation`],
      });
    }
  } catch { /* continue to triage handler */ }

  // All guards passed — continue to stepExecute (triage handler)
  return;
};

/**
 * Step 8: Execute handler + post-execute (telemetry, state transitions, signals, post-hook).
 */
const stepExecute: DispatchStep = async (dc) => {
  const { next, config, state, client, handler, handlerCtx, hookCtx, cb } = dc;
  const { slug, repoRoot, apmContext, logger } = config;
  const { pipelineSummaries, attemptCounts } = state;
  const { itemSummary, stepStart, node } = dc;

  if (!handler || !handlerCtx) {
    throw new Error(`BUG: stepExecute called without handler/context for "${next.key}"`);
  }

  // --- Execute handler (wrapped — exceptions caught by node wrapper) ---
  const result = await handler.execute(handlerCtx);
  dc.result = result;

  // --- Merge handler telemetry ---
  mergeTelemetry(itemSummary, result.summary);

  // Store cross-handler output
  if (result.handlerOutput) {
    state.handlerOutputs[next.key] = {
      ...(state.handlerOutputs[next.key] ?? {}),
      ...result.handlerOutput,
    };
    logger.event("handoff.emit", next.key, {
      channel: "handler_data",
      keys: Object.keys(result.handlerOutput),
    });
  }

  // Record HEAD for circuit breaker (from wrapper's handlerOutput if available)
  itemSummary.headAfterAttempt = (result.handlerOutput?.headAfterAttempt as string | undefined)
    ?? getHeadSha(repoRoot) ?? undefined;

  // --- State transitions ---
  if (result.signal === "approval-pending") {
    return finishItem(itemSummary, "completed", stepStart, config, state, { approvalPending: true });
  }

  if (result.outcome === "completed") {
    await kernelComplete(slug, next.key, logger);
  } else {
    itemSummary.outcome = result.outcome;
    itemSummary.errorMessage = result.errorMessage;
    try {
      const failResult = await kernelFail(slug, next.key, result.errorMessage ?? "Unknown failure", logger);
      if (failResult.halted) {
        return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
      }
    } catch {
      logger.event("item.end", next.key, { outcome: "error", halted: true, error_preview: "Could not record failure in pipeline state" });
      return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
    }
    // Resolve triage activation — watchdog will dispatch the triage node
    // through the standard pipeline on the next turn.
    const activation = resolveTriageActivation(next.key, result.errorMessage ?? "Unknown failure", itemSummary, config);
    if (!activation) {
      return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
    }
    return finishItem(itemSummary, result.outcome, stepStart, config, state, { triageActivation: activation });
  }

  // --- Signal handling ---
  if (result.signal === "halt" || result.signals?.halt) {
    return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
  }
  if (result.signal === "create-pr" || (result.outcome === "completed" && node?.signals_create_pr)) {
    return finishItem(itemSummary, "completed", stepStart, config, state, { createPr: true });
  }
  if (result.signal === "salvage-draft" || result.signals?.["salvage-draft"]) {
    try {
      logger.event("state.salvage", next.key, { reason: (result.errorMessage ?? "Handler signaled salvage").slice(0, 500) });
      await salvageForDraft(slug, next.key);
      const draftFlagPath = path.join(config.appRoot, "in-progress", `${slug}.blocked-draft`);
      fs.writeFileSync(draftFlagPath, result.errorMessage ?? "Handler signaled salvage", "utf-8");
    } catch {
      logger.event("item.end", next.key, { outcome: "error", halted: true, error_preview: "Failed to salvage pipeline state" });
      return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
    }
    return finishItem(itemSummary, result.outcome, stepStart, config, state);
  }

  // --- Post-hook + SHA capture ---
  if (result.outcome === "completed" && hookCtx) {
    const postHookResult = runPostHook(hookCtx);
    if (!postHookResult.ok) {
      const failMsg = postHookResult.errorMessage ?? "post-hook failed";
      logger.event("state.fail", next.key, { error_signature: null, error_preview: failMsg.slice(0, 200) });
      try { await kernelFail(slug, next.key, failMsg, logger); } catch { /* best-effort */ }
      itemSummary.outcome = "failed";
      itemSummary.errorMessage = failMsg;
      flushReports(config, state);
      // Resolve triage activation — watchdog dispatches triage through standard pipeline
      const postHookActivation = resolveTriageActivation(next.key, failMsg, itemSummary, config);
      if (!postHookActivation) {
        return finishItem(itemSummary, "failed", stepStart, config, state, { halt: true });
      }
      return finishItem(itemSummary, "failed", stepStart, config, state, { triageActivation: postHookActivation });
    }

    const existing = state.handlerOutputs[next.key]?.lastPushedSha;
    if (!existing) {
      const capturedSha = captureHeadSha(hookCtx);
      if (capturedSha) {
        state.handlerOutputs[next.key] = {
          ...(state.handlerOutputs[next.key] ?? {}),
          lastPushedSha: capturedSha,
        };
      }
    }
  }

  // Validate declared `produces` AFTER post-hook SHA capture so kernel-injected
  // keys (e.g. lastPushedSha from captures_head_sha) are already in handlerOutputs.
  const declaredProduces = node?.produces ?? [];
  if (declaredProduces.length > 0 && result.outcome === "completed") {
    const allOutputKeys = new Set(Object.keys(state.handlerOutputs[next.key] ?? {}));
    const missing = declaredProduces.filter((k: string) => !allOutputKeys.has(k));
    if (missing.length > 0) {
      logger.event("handoff.emit", next.key, {
        channel: "produces_missing",
        keys: missing,
        note: `Node declared produces [${missing.join(", ")}] but handler did not emit them`,
      });
    }
  }

  // --- Execute declarative DagCommands returned by handler ---
  if (result.commands && result.commands.length > 0) {
    const reindexCats = new Set((apmContext.config?.reindex_categories as string[]) ?? ["dev", "test"]);
    const cmdResult = await executeCommands(result.commands, slug, config.appRoot, repoRoot, reindexCats, logger);
    if (cmdResult.halt) {
      return finishItem(itemSummary, result.outcome === "completed" ? "completed" : result.outcome, stepStart, config, state, { halt: true });
    }
  }

  return finishItem(itemSummary, result.outcome === "completed" ? "completed" : result.outcome, stepStart, config, state);
};

/**
 * The ordered dispatch pipeline. Each step runs in sequence.
 * A step returning a SessionResult short-circuits the pipeline.
 */
const DISPATCH_PIPELINE: readonly DispatchStep[] = [
  stepInit,
  stepAutoSkip,
  stepReadiness,
  stepResolve,
  stepHandlerSkip,
  stepPreHook,
  stepTriageGuard,
  stepExecute,
];

// ---------------------------------------------------------------------------
// Unified dispatch — single entry point for all pipeline items
// ---------------------------------------------------------------------------

/**
 * Run a single pipeline item — the core of each DAG step.
 *
 * Executes a linear pipeline of named steps:
 * init → auto-skip → readiness → resolve → handler-skip → pre-hook → execute
 */
export async function runItemSession(
  client: CopilotClient,
  next: NextAction & { key: string },
  config: PipelineRunConfig,
  state: PipelineRunState,
): Promise<SessionResult> {
  state.attemptCounts[next.key] = (state.attemptCounts[next.key] ?? 0) + 1;

  // Bootstrap dispatch context with minimal fields — steps populate the rest
  const node = getWorkflowNode(config.apmContext, config.workflowName, next.key);
  const dc: DispatchContext = {
    client,
    next,
    config,
    state,
    node,
    cb: resolveCircuitBreaker(node),
    itemSummary: undefined as unknown as ItemSummary, // populated by stepInit
    stepStart: 0,
  };

  for (const step of DISPATCH_PIPELINE) {
    const earlyResult = await step(dc);
    if (earlyResult) return earlyResult;
  }

  // Pipeline exhausted without returning — this shouldn't happen (stepExecute always returns)
  throw new Error(`BUG: dispatch pipeline exhausted for "${next.key}" without producing a result`);
}
