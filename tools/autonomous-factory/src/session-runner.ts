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
 *   - dispatchOnFailure()  — Failure-edge dispatch to triage nodes via on_failure
 *   - handleTriageResult() — Post-triage DAG reset and state persistence
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { CopilotClient } from "@github/copilot-sdk";
import { getStatus, failItem, completeItem, salvageForDraft, resetNodes, setLastTriageRecord } from "./state.js";
import type { ApmCompiledOutput } from "./apm-types.js";
import type { NextAction, ItemSummary, TriageRecord } from "./types.js";
import { RESET_OPS } from "./types.js";
import type { PipelineLogger } from "./logger.js";
import { writeFlightData } from "./reporting.js";
import {
  computeEffectiveDevAttempts,
} from "./context-injection.js";

// ── Submodule imports ──────────────────────────────────────────────────────
import {
  getWorkflow,
  getWorkflowNode,
  getHeadSha,
  resolveCircuitBreaker,
  shouldSkipRetry,
  flushReports,
  finishItem,
  mergeTelemetry,
} from "./session/shared.js";
import { pollReadiness } from "./session/readiness-probe.js";
import { runPreHook, runPostHook, captureHeadSha } from "./session/lifecycle-hooks.js";
import type { HookContext } from "./session/lifecycle-hooks.js";
import { resolveHandler, inferHandler, evaluateAutoSkip } from "./handlers/index.js";
import type { NodeContext, NodeResult, TriageHandlerOutput } from "./handlers/index.js";
import { computeErrorSignature } from "./triage/error-fingerprint.js";


// ---------------------------------------------------------------------------
// Shared mutable state passed from the orchestrator
// ---------------------------------------------------------------------------

/** All mutable state that persists across pipeline iterations */
export interface PipelineRunState {
  /** Collected summaries across the whole pipeline run */
  pipelineSummaries: ItemSummary[];
  /** Track attempt number per item key across retries */
  attemptCounts: Record<string, number>;
  /** One-time circuit breaker bypass for DEV items eligible for clean-slate revert */
  circuitBreakerBypassed: Set<string>;
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
 * on_failure is an object `{ triage: string, routes: Record<string, string | null> }`.
 * Supports deprecated `triage` field (shim) for backward compat.
 * Returns the triage node key, or undefined if no failure routing is configured.
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
  return undefined;
}

/**
 * Extract the on_failure.routes map from a workflow node.
 * Returns the routes map or an empty object if not configured.
 */
function resolveOnFailureRoutes(
  apmContext: ApmCompiledOutput,
  workflowName: string,
  itemKey: string,
): Record<string, string | null> {
  const node = getWorkflowNode(apmContext, workflowName, itemKey);
  if (!node?.on_failure || typeof node.on_failure !== "object") return {};
  return (node.on_failure as { routes?: Record<string, string | null> }).routes ?? {};
}

/**
 * Dispatch failure to a triage node via the on_failure edge.
 * Returns a SessionResult if triage handled the failure, or null if no
 * on_failure target is configured (caller continues with normal failure flow).
 */
async function dispatchOnFailure(
  failingKey: string,
  rawError: string,
  itemSummary: ItemSummary,
  config: PipelineRunConfig,
  state: PipelineRunState,
  client: CopilotClient,
): Promise<SessionResult | null> {
  const { slug, workflowName, appRoot, repoRoot, apmContext, roamAvailable, logger } = config;

  const triageNodeKey = resolveOnFailureTarget(apmContext, workflowName, failingKey);
  if (!triageNodeKey) return null;

  // Resolve failure routes from the failing node's on_failure.routes
  const failureRoutes = resolveOnFailureRoutes(apmContext, workflowName, failingKey);

  // Push summary and flush before triage dispatch
  state.pipelineSummaries.push(itemSummary);
  flushReports(config, state);

  const errorSig = computeErrorSignature(rawError);

  // Resolve the triage handler
  const triageNode = getWorkflowNode(apmContext, workflowName, triageNodeKey);
  const handlerRef = triageNode?.handler ?? inferHandler(triageNode?.type ?? "triage", triageNode?.script_type, apmContext.config?.handler_defaults);
  if (!handlerRef) {
    logger.event("item.end", failingKey, { outcome: "error", error_preview: `on_failure target "${triageNodeKey}" has no resolvable handler` });
    return { summary: itemSummary, halt: true, createPr: false };
  }
  const handler = await resolveHandler(handlerRef, appRoot, repoRoot, apmContext.config?.handlers);

  // Build triage context with failure-specific fields
  const currentState = await getStatus(slug);
  const triageCtx: NodeContext = {
    itemKey: triageNodeKey,
    slug,
    appRoot,
    repoRoot,
    baseBranch: config.baseBranch,
    attempt: 1,
    effectiveAttempts: 1,
    environment: (apmContext.config?.environment as Record<string, string>) ?? {},
    apmContext,
    pipelineState: currentState,
    pipelineSummaries: [...state.pipelineSummaries],
    handlerData: {},
    onHeartbeat: () => {},
    client,
    logger,
    // Failure context — populated for on_failure dispatch
    failingNodeKey: failingKey,
    rawError,
    errorSignature: errorSig,
    failingNodeSummary: { ...itemSummary },
    failureRoutes,
  };

  logger.event("triage.evaluate", failingKey, {
    triage_node: triageNodeKey,
    handler: handler.name,
    error_signature: errorSig,
    dispatch: true,
  });

  // Execute the triage handler
  let triageResult: NodeResult;
  try {
    triageResult = await handler.execute(triageCtx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.event("item.end", triageNodeKey, { outcome: "error", error_preview: message });
    return { summary: itemSummary, halt: true, createPr: false };
  }

  // Process the triage handler's output — execute DAG mutations
  return handleTriageResult(triageResult, failingKey, rawError, itemSummary, config, state);
}

/**
 * Process triage handler output — execute DAG resets and persist records.
 * The kernel owns DAG mutations; the triage handler only classifies and recommends.
 */
async function handleTriageResult(
  triageResult: NodeResult,
  failingKey: string,
  rawError: string,
  itemSummary: ItemSummary,
  config: PipelineRunConfig,
  state: PipelineRunState,
): Promise<SessionResult> {
  const { slug, repoRoot, apmContext, roamAvailable, logger } = config;

  if (triageResult.outcome !== "completed" || !triageResult.handlerOutput) {
    logger.event("item.end", failingKey, { outcome: "error", error_preview: triageResult.errorMessage ?? "Triage handler failed" });
    return { summary: itemSummary, halt: true, createPr: false };
  }

  const output = triageResult.handlerOutput as unknown as TriageHandlerOutput;
  const { routeToKey, triageRecord } = output;

  // --- Graceful degradation: routeToKey is null ---
  if (routeToKey === null) {
    return triggerGracefulDegradation(slug, failingKey, rawError, config, itemSummary, triageRecord);
  }

  // --- Execute DAG reset: target node + all downstream dependents ---
  // Resolve max_reroutes from the triage node's profile
  const triageNodeKey = resolveOnFailureTarget(apmContext, config.workflowName, failingKey);
  const triageNode = triageNodeKey ? getWorkflowNode(apmContext, config.workflowName, triageNodeKey) : undefined;
  const profileName = triageNode?.triage_profile;
  const profile = profileName ? apmContext.triage_profiles?.[`${config.workflowName}.${profileName}`] : undefined;
  const maxReroutes = profile?.max_reroutes ?? 5;

  const taggedReason = `[domain:${output.domain}] [source:${output.source}] ${output.reason}`;
  try {
    const result = await resetNodes(slug, routeToKey, taggedReason, maxReroutes, RESET_OPS.RESET_FOR_REROUTE);
    if (result.halted) {
      logger.event("item.end", failingKey, { outcome: "failed", halted: true, error_preview: `${result.cycleCount} reroute cycles exhausted` });
      return { summary: itemSummary, halt: true, createPr: false };
    }

    // Enrich triage record with cascade info from resetNodes
    const enrichedRecord: TriageRecord = {
      ...triageRecord,
      cascade: result.state.items
        .filter((it) => it.status === "pending" && it.key !== routeToKey)
        .map((it) => it.key),
      cycle_count: result.cycleCount,
    };

    // Persist the triage record for downstream context injection
    try { await setLastTriageRecord(slug, enrichedRecord); } catch { /* non-fatal */ }

    // Re-index semantic graph after reroute if target category is in reindex_categories
    if (roamAvailable) {
      const targetCat = getWorkflowNode(apmContext, config.workflowName, routeToKey)?.category;
      const reindexCats = new Set(apmContext.config?.reindex_categories ?? ["dev", "test"]);
      if (targetCat && reindexCats.has(targetCat)) {
        logger.event("tool.call", routeToKey, { tool: "roam", category: "index", detail: " → re-indexing after reroute", is_write: false });
        try {
          execSync("roam index", { cwd: repoRoot, stdio: "inherit", timeout: 120_000 });
        } catch { /* non-fatal */ }
      }
    }
  } catch {
    logger.event("item.end", failingKey, { outcome: "error", halted: true, error_preview: "Could not execute reroute" });
    return { summary: itemSummary, halt: true, createPr: false };
  }

  return { summary: itemSummary, halt: false, createPr: false };
}

/**
 * Trigger graceful degradation — salvage partial work to a Draft PR.
 * Unified salvage helper used by:
 * - on_failure dispatch (triage handler returns routeToKey=null)
 * - circuit breaker timeout-salvage
 * - handler "salvage-draft" signal
 *
 * Calls kernelFail (unless failState="skip"), then salvageForDraft, writes
 * the `.blocked-draft` sentinel, and optionally persists a triage record.
 */
async function kernelSalvage(
  slug: string,
  itemKey: string,
  errorMsg: string,
  config: PipelineRunConfig,
  opts?: { skipFail?: boolean; triageRecord?: TriageRecord },
): Promise<void> {
  config.logger.event("state.salvage", itemKey, { reason: errorMsg.slice(0, 500) });
  if (!opts?.skipFail) {
    await kernelFail(slug, itemKey, `BLOCKED: ${errorMsg}`, config.logger);
  }
  await salvageForDraft(slug, itemKey);
  const draftFlagPath = path.join(config.appRoot, "in-progress", `${slug}.blocked-draft`);
  fs.writeFileSync(draftFlagPath, errorMsg, "utf-8");
  if (opts?.triageRecord) {
    try { await setLastTriageRecord(slug, opts.triageRecord); } catch { /* non-fatal */ }
  }
}

/**
 * Trigger graceful degradation from triage — delegates to `kernelSalvage`.
 * Generic kernel capability: any on_failure handler returning routeToKey=null triggers this.
 */
async function triggerGracefulDegradation(
  slug: string,
  itemKey: string,
  errorMsg: string,
  config: PipelineRunConfig,
  itemSummary: ItemSummary,
  triageRecord?: TriageRecord,
): Promise<SessionResult> {
  try {
    await kernelSalvage(slug, itemKey, errorMsg, config, { triageRecord });
  } catch (e) {
    config.logger.event("item.end", itemKey, { outcome: "error", halted: true, error_preview: "Failed to salvage pipeline state" });
    return { summary: itemSummary, halt: true, createPr: false };
  }
  return { summary: itemSummary, halt: false, createPr: false };
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
 * Step 1: Circuit breaker — skip if identical error + no code changed.
 * Handles revert bypass, timeout salvage, and hard-halt on repeated errors.
 */
const stepCircuitBreaker: DispatchStep = async (dc) => {
  const { next, config, state } = dc;
  const { slug, repoRoot, logger } = config;
  const { pipelineSummaries, attemptCounts, circuitBreakerBypassed } = state;
  const { cb } = dc;

  if (attemptCounts[next.key] < cb.minAttemptsBeforeSkip) return;
  if (!shouldSkipRetry(repoRoot, next.key, pipelineSummaries)) return;

  // Grant one bypass for clean-slate revert
  if (cb.allowsRevertBypass && !circuitBreakerBypassed.has(next.key)) {
    logger.event("item.skip", next.key, { skip_type: "circuit_breaker", reason: "deferred — granting clean-slate revert opportunity" });
    circuitBreakerBypassed.add(next.key);
    return;
  }

  logger.event("item.skip", next.key, { skip_type: "circuit_breaker", reason: "identical error with no code changes since last attempt" });
  const skipSummary: ItemSummary = {
    key: next.key,
    label: next.label,
    agent: next.agent ?? "unknown",
    attempt: attemptCounts[next.key],
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    outcome: "failed",
    intents: ["Circuit breaker: identical error, no code changes — skipped"],
    messages: [],
    filesRead: [],
    filesChanged: [],
    shellCommands: [],
    toolCounts: {},
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    errorMessage: "Circuit breaker: identical error repeated without code changes",
  };
  try { skipSummary.headAfterAttempt = getHeadSha(repoRoot) ?? undefined; } catch { /* non-fatal */ }
  pipelineSummaries.push(skipSummary);
  flushReports(config, state);

  // Timeout-salvage path
  const lastError = pipelineSummaries
    .filter((s) => s.key === next.key && s.outcome !== "completed")
    .pop()?.errorMessage ?? "";
  if (cb.allowsTimeoutSalvage && lastError.toLowerCase().includes("timeout")) {
    const salvageMsg = `Circuit breaker: ${next.key} timeout loop after ${attemptCounts[next.key]} attempts`;
    try {
      await kernelSalvage(slug, next.key, salvageMsg, config);
    } catch (e) {
      logger.event("item.end", next.key, { outcome: "error", halted: true, error_preview: `Failed to salvage pipeline state: ${e instanceof Error ? e.message : String(e)}` });
      return { summary: skipSummary, halt: true, createPr: false };
    }
    return { summary: skipSummary, halt: false, createPr: false };
  }

  return { summary: skipSummary, halt: true, createPr: false };
};

/**
 * Step 2: Init — logging, HEAD snapshot, create ItemSummary.
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
  const effectiveAttempts = await computeEffectiveDevAttempts(
    next.key, attemptCounts[next.key], slug, cb.allowsRevertBypass,
  );

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
    slug,
    appRoot,
    repoRoot,
    baseBranch,
    attempt: attemptCounts[next.key],
    effectiveAttempts,
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

  // --- Execute handler ---
  let result: NodeResult;
  try {
    result = await handler.execute(handlerCtx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.event("item.end", next.key, { outcome: "error", error_preview: message, handler: handler.name });
    result = { outcome: "error", errorMessage: message, summary: {} };
  }
  dc.result = result;

  // --- Non-retryable detection for deterministic handlers ---
  const previousAttempt = handlerCtx.previousAttempt;
  if (
    result.outcome !== "completed" &&
    cb.haltOnIdentical &&
    previousAttempt?.errorMessage &&
    result.errorMessage === previousAttempt.errorMessage
  ) {
    const currentHead = getHeadSha(repoRoot);
    if (currentHead !== null && currentHead === previousAttempt.headAfterAttempt) {
      logger.event("item.skip", next.key, { skip_type: "non_retryable", reason: `deterministic handler "${handler.name}" produced identical error with no code changes` });
      itemSummary.outcome = result.outcome;
      itemSummary.errorMessage = `Non-retryable: identical error on attempt ${attemptCounts[next.key]} with no code changes. ${result.errorMessage}`;
      try {
        await kernelFail(slug, next.key, itemSummary.errorMessage, logger);
      } catch { /* best-effort */ }
      return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
    }
  }

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

  // Record HEAD for circuit breaker
  itemSummary.headAfterAttempt = getHeadSha(repoRoot) ?? undefined;

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
    const onFailureResult = await dispatchOnFailure(next.key, result.errorMessage ?? "Unknown failure", itemSummary, config, state, client);
    if (onFailureResult) return onFailureResult;
  }

  // --- Signal handling ---
  if (result.signal === "halt") {
    return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
  }
  if (result.signal === "create-pr" || (result.outcome === "completed" && node?.signals_create_pr)) {
    return finishItem(itemSummary, "completed", stepStart, config, state, { createPr: true });
  }
  if (result.signal === "salvage-draft") {
    try {
      await kernelSalvage(slug, next.key, result.errorMessage ?? "Handler signaled salvage", config, { skipFail: true });
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
      const triageResult3 = await dispatchOnFailure(next.key, failMsg, itemSummary, config, state, client);
      if (triageResult3) return triageResult3;
      return finishItem(itemSummary, "failed", stepStart, config, state, { halt: true });
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

  return finishItem(itemSummary, result.outcome === "completed" ? "completed" : result.outcome, stepStart, config, state);
};

/**
 * The ordered dispatch pipeline. Each step runs in sequence.
 * A step returning a SessionResult short-circuits the pipeline.
 */
const DISPATCH_PIPELINE: readonly DispatchStep[] = [
  stepCircuitBreaker,
  stepInit,
  stepAutoSkip,
  stepReadiness,
  stepResolve,
  stepHandlerSkip,
  stepPreHook,
  stepExecute,
];

// ---------------------------------------------------------------------------
// Unified dispatch — single entry point for all pipeline items
// ---------------------------------------------------------------------------

/**
 * Run a single pipeline item — the core of each DAG step.
 *
 * Executes a linear pipeline of named steps:
 * circuit breaker → init → auto-skip → readiness → resolve → handler-skip → pre-hook → execute
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
