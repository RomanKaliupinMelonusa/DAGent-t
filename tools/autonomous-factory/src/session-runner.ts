/**
 * session-runner.ts — Orchestration kernel for individual pipeline items.
 *
 * This module is the thin dispatcher that routes each DAG step to a
 * registered NodeHandler via the handler plugin system. All heavyweight
 * logic lives in handler implementations under `handlers/`:
 *   - handlers/local-exec.ts      — Generic local script execution (push, publish, tests)
 *   - handlers/github-ci-poll.ts  — CI workflow polling with transient retry
 *   - handlers/copilot-agent.ts   — Full Copilot SDK agent session lifecycle
 *
 * Supporting modules:
 *   - session/shared.ts           — Workflow node helpers, reporting utilities
 *   - session/readiness-probe.ts  — Data-plane readiness polling and validation hooks
 *   - session/triage-dispatcher.ts — Post-deploy failure triage and rerouting
 *
 * Retained here:
 *   - PipelineRunState / PipelineRunConfig / SessionResult interfaces
 *   - runItemSession()  — Unified dispatch (auto-skip, readiness, handler routing, state transitions)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { CopilotClient } from "@github/copilot-sdk";
import { getStatus, failItem, completeItem, salvageForDraft } from "./state.js";
import type { ApmCompiledOutput, CompiledTriageProfile } from "./apm-types.js";
import type { NextAction, ItemSummary } from "./types.js";
import type { PipelineLogger } from "./logger.js";
import { writeFlightData } from "./reporting.js";
import {
  computeEffectiveDevAttempts,
} from "./context-injection.js";

// ── Submodule imports ──────────────────────────────────────────────────────
import {
  getWorkflowNode,
  shouldSkipRetry,
  flushReports,
  finishItem,
} from "./session/shared.js";
import { pollReadiness } from "./session/readiness-probe.js";
import { handleTriageReroute } from "./session/triage-dispatcher.js";
import { resolveHandler, inferHandler, evaluateAutoSkip } from "./handlers/index.js";
import type { NodeContext, NodeResult } from "./handlers/index.js";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Resolve compiled triage profile for a workflow node (v2 path). */
function resolveTriageProfile(
  apmContext: ApmCompiledOutput,
  itemKey: string,
): CompiledTriageProfile | undefined {
  const node = getWorkflowNode(apmContext, itemKey);
  if (!node?.triage) return undefined;
  // Key convention: "<workflowName>.<profileName>" — currently always "default"
  return apmContext.triage_profiles?.[`default.${node.triage}`];
}

// ── Backward-compatible re-exports ─────────────────────────────────────────
// External consumers (watchdog.ts, tests) import these from session-runner.
export { normalizeDiagnosticTrace, shouldSkipRetry } from "./session/shared.js";
export { appendToToolResult } from "./session/session-events.js";

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
   * Last pushed commit SHA per push-item key (e.g. "push-<scope>").
   * Captured by kernel after deploy-category script nodes complete,
   * consumed by github-ci-poll handler for SHA-pinned CI polling.
   * Scoped per-item to prevent cross-contamination if multiple push items ever
   * run in the same batch.
   */
  lastPushedShas: Record<string, string>;
  /**
   * Accumulated handler output from all preceding items in this pipeline run.
   * Keyed by item key. The kernel propagates the full bag into handlerData
   * so downstream handlers can access output from any upstream handler.
   */
  handlerOutputs: Record<string, Record<string, unknown>>;
  /** Per-item flag: whether force_run_if_changed dirs had changes (set by evaluateAutoSkip, consumed by copilot-agent handler via ctx.forceRunChanges). Keyed by item key to prevent cross-contamination in parallel batches. */
  forceRunChangesDetected: Record<string, boolean>;
}

/** Immutable config for the pipeline run */
export interface PipelineRunConfig {
  slug: string;
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
}

// ---------------------------------------------------------------------------
// Unified dispatch — single entry point for all pipeline items
// ---------------------------------------------------------------------------

/**
 * Run a single pipeline item — the core of each DAG step.
 *
 * Flow: circuit breaker → auto-skip → readiness probe → infer handler →
 *       resolve handler → build context → shouldSkip → execute → state transitions
 */
export async function runItemSession(
  client: CopilotClient,
  next: NextAction & { key: string },
  config: PipelineRunConfig,
  state: PipelineRunState,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext, roamAvailable, logger } = config;
  const { pipelineSummaries, attemptCounts, circuitBreakerBypassed, preStepRefs } = state;

  attemptCounts[next.key] = (attemptCounts[next.key] ?? 0) + 1;

  // --- Circuit breaker: skip if identical error + no code changed since last attempt ---
  if (attemptCounts[next.key] > 2 && shouldSkipRetry(repoRoot, next.key, pipelineSummaries)) {
    const nodeForBreaker = getWorkflowNode(apmContext, next.key);
    if (nodeForBreaker?.category === "dev" && !circuitBreakerBypassed.has(next.key)) {
      logger.event("item.skip", next.key, { skip_type: "circuit_breaker", reason: "deferred — granting clean-slate revert opportunity" });
      circuitBreakerBypassed.add(next.key);
    } else {
      logger.event("item.skip", next.key, { skip_type: "circuit_breaker", reason: "identical error with no code changes since last attempt" });
      const skipSummary: ItemSummary = {
        key: next.key,
        label: next.label,
        agent: next.agent ?? "unknown",
        phase: next.phase ?? "unknown",
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
      try { skipSummary.headAfterAttempt = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8", timeout: 5_000 }).trim(); } catch { /* non-fatal */ }
      pipelineSummaries.push(skipSummary);
      flushReports(config, state);

      const lastError = pipelineSummaries
        .filter((s) => s.key === next.key && s.outcome !== "completed")
        .pop()?.errorMessage ?? "";
      const isTimeoutLoop = lastError.toLowerCase().includes("timeout");

      if (nodeForBreaker?.category === "dev" && isTimeoutLoop) {
        logger.event("state.salvage", next.key, { reason: `timeout loop after ${attemptCounts[next.key]} attempts` });
        try {
          await failItem(slug, next.key, "Circuit breaker: timeout loop — salvaging to Draft PR");
          await salvageForDraft(slug, next.key);
          const draftFlagPath = path.join(appRoot, "in-progress", `${slug}.blocked-draft`);
          fs.writeFileSync(draftFlagPath, `Circuit breaker: ${next.key} timeout loop after ${attemptCounts[next.key]} attempts`, "utf-8");
        } catch (e) {
          logger.event("item.end", next.key, { outcome: "error", halted: true, error_preview: `Failed to salvage pipeline state: ${e instanceof Error ? e.message : String(e)}` });
          return { summary: skipSummary, halt: true, createPr: false };
        }
        return { summary: skipSummary, halt: false, createPr: false };
      }

      return { summary: skipSummary, halt: true, createPr: false };
    }
  }

  // --- Early node lookup (needed for barrier short-circuit before heavy banner) ---
  const node = getWorkflowNode(apmContext, next.key);

  // --- Barrier node: zero-execution sync point (auto-complete immediately) ---
  // Checked before the banner/HEAD-snapshot to avoid noisy logs for zero-work nodes.
  if (node?.type === "barrier") {
    const stepStart = Date.now();
    const barrierSummary: ItemSummary = {
      key: next.key,
      label: next.label,
      agent: "barrier",
      phase: next.phase ?? "unknown",
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
    await completeItem(slug, next.key);
    logger.event("item.barrier", next.key, { upstream_resolved: [] });
    return finishItem(barrierSummary, "completed", stepStart, config, state, {
      intents: ["barrier-sync: all upstream dependencies resolved"],
    });
  }

  logger.setAttempt(next.key, attemptCounts[next.key]);
  logger.event("item.start", next.key, {
    label: next.label,
    agent: next.agent,
    phase: next.phase,
    node_type: node?.type ?? "agent",
    category: node?.category ?? "unknown",
  });

  // Snapshot HEAD before ALL items for accurate filesChanged tracking
  if (!preStepRefs[next.key]) {
    try {
      preStepRefs[next.key] = execSync("git rev-parse HEAD", {
        cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
      }).trim();
    } catch { /* non-fatal */ }
  }

  const stepStart = Date.now();
  const itemSummary: ItemSummary = {
    key: next.key,
    label: next.label,
    agent: next.agent ?? "unknown",
    phase: next.phase ?? "unknown",
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

  // --- Auto-skip evaluation ---
  const skipDecision = evaluateAutoSkip(next.key, apmContext, repoRoot, baseBranch, appRoot, preStepRefs);
  state.forceRunChangesDetected[next.key] = skipDecision.forceRunChanges;
  if (skipDecision.skip) {
    await completeItem(slug, next.key);
    logger.event("item.skip", next.key, { skip_type: "auto_skip", reason: skipDecision.skip.reason });
    return finishItem(itemSummary, "completed", stepStart, config, state, {
      intents: [skipDecision.skip.reason],
    });
  }

  // --- Readiness probe ---
  if (node?.requires_data_plane_ready) {
    await pollReadiness(config);
  }

  // --- Resolve handler via manifest or inference ---
  const handlerRef = node?.handler ?? inferHandler(node?.type ?? "agent", node?.script_type);
  if (!handlerRef) {
    throw new Error(
      node?.type === "script"
        ? `BUG: Script item "${next.key}" has type "script" but no script_type or handler declared. Never route script items to LLM sessions.`
        : `Could not resolve handler for "${next.key}" (type=${node?.type}, script_type=${node?.script_type})`,
    );
  }
  const handler = await resolveHandler(handlerRef, appRoot, repoRoot);

  // --- Build handler context ---
  const currentState = await getStatus(slug);
  const effectiveAttempts = await computeEffectiveDevAttempts(
    next.key, attemptCounts[next.key], slug, node?.category,
  );

  const previousAttempt = attemptCounts[next.key] > 1
    ? [...pipelineSummaries].reverse().find((s) => s.key === next.key)
    : undefined;

  const downstreamFailures = pipelineSummaries.filter(
    (s) => s.outcome !== "completed" && s.key !== next.key &&
      getWorkflowNode(apmContext, s.key)?.category === "test",
  );

  let lastHeartbeat = 0;
  const onHeartbeat = () => {
    if (Date.now() - lastHeartbeat < 1500) return;
    lastHeartbeat = Date.now();
    const liveSummaries = [...pipelineSummaries, { ...itemSummary, outcome: "in-progress" as const }];
    writeFlightData(appRoot, slug, liveSummaries, true);
  };

  const handlerData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(state.lastPushedShas)) {
    handlerData[`lastPushedSha:${k}`] = v;
  }
  for (const [itemKey, outputs] of Object.entries(state.handlerOutputs)) {
    for (const [k, v] of Object.entries(outputs)) {
      handlerData[`${itemKey}:${k}`] = v;
    }
  }
  if (preStepRefs[next.key]) {
    handlerData["preStepRef"] = preStepRefs[next.key];
  }

  const ctx: NodeContext = {
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

  // --- Handler-specific shouldSkip ---
  if (handler.shouldSkip) {
    const skipResult = await handler.shouldSkip(ctx);
    if (skipResult) {
      logger.event("item.skip", next.key, { skip_type: "handler_skip", reason: skipResult.reason });
      await completeItem(slug, next.key);
      if (skipResult.filesChanged) {
        for (const f of skipResult.filesChanged) {
          if (!itemSummary.filesChanged.includes(f)) itemSummary.filesChanged.push(f);
        }
      }
      return finishItem(itemSummary, "completed", stepStart, config, state, {
        intents: [skipResult.reason],
      });
    }
  }

  // --- Execute handler ---
  let result: NodeResult;
  try {
    result = await handler.execute(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.event("item.end", next.key, { outcome: "error", error_preview: message, handler: handler.name });
    result = { outcome: "error", errorMessage: message, summary: {} };
  }

  // --- K2: Non-retryable detection for deterministic handlers ---
  // If a deterministic (script) handler fails with the same error as the previous
  // attempt AND no code has changed (HEAD unchanged), halt immediately instead of
  // exhausting all retries. Retrying an identical command with identical input is futile.
  if (
    result.outcome !== "completed" &&
    node?.type === "script" &&
    previousAttempt?.errorMessage &&
    result.errorMessage === previousAttempt.errorMessage
  ) {
    let headUnchanged = false;
    try {
      const currentHead = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8", timeout: 5_000 }).trim();
      headUnchanged = currentHead === previousAttempt.headAfterAttempt;
    } catch { /* non-fatal — skip optimization */ }
    if (headUnchanged) {
      logger.event("item.skip", next.key, { skip_type: "non_retryable", reason: `deterministic handler "${handler.name}" produced identical error with no code changes` });
      itemSummary.outcome = result.outcome;
      itemSummary.errorMessage = `Non-retryable: identical error on attempt ${attemptCounts[next.key]} with no code changes. ${result.errorMessage}`;
      try {
        await failItem(slug, next.key, itemSummary.errorMessage);
      } catch { /* best-effort — pipeline is halting anyway */ }
      return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
    }
  }

  // --- Merge handler telemetry into kernel summary ---
  if (result.summary.intents) itemSummary.intents.push(...result.summary.intents);
  if (result.summary.filesChanged) {
    for (const f of result.summary.filesChanged) {
      if (!itemSummary.filesChanged.includes(f)) itemSummary.filesChanged.push(f);
    }
  }
  if (result.summary.filesRead) itemSummary.filesRead.push(...result.summary.filesRead);
  if (result.summary.shellCommands) itemSummary.shellCommands.push(...result.summary.shellCommands);
  if (result.summary.toolCounts) {
    for (const [k, v] of Object.entries(result.summary.toolCounts)) {
      itemSummary.toolCounts[k] = (itemSummary.toolCounts[k] ?? 0) + v;
    }
  }
  if (result.summary.inputTokens) itemSummary.inputTokens += result.summary.inputTokens;
  if (result.summary.outputTokens) itemSummary.outputTokens += result.summary.outputTokens;
  if (result.summary.cacheReadTokens) itemSummary.cacheReadTokens += result.summary.cacheReadTokens;
  if (result.summary.cacheWriteTokens) itemSummary.cacheWriteTokens += result.summary.cacheWriteTokens;
  if (result.summary.messages) itemSummary.messages.push(...result.summary.messages);

  // Store cross-handler output for downstream access
  if (result.handlerOutput) {
    state.handlerOutputs[next.key] = {
      ...(state.handlerOutputs[next.key] ?? {}),
      ...result.handlerOutput,
    };
    const sha = result.handlerOutput.lastPushedSha;
    if (typeof sha === "string") {
      state.lastPushedShas[next.key] = sha;
    }
    logger.event("handoff.emit", next.key, {
      channel: "handler_data",
      keys: Object.keys(result.handlerOutput),
    });
  }

  // Record HEAD for circuit breaker
  try {
    itemSummary.headAfterAttempt = execSync("git rev-parse HEAD", {
      cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
    }).trim();
  } catch { /* non-fatal */ }

  // --- State transitions ---
  if (result.stateManaged) {
    if (result.outcome === "completed") {
      logger.event("item.end", next.key, { outcome: "completed", note: "state managed by handler" });
    } else {
      itemSummary.outcome = result.outcome;
      itemSummary.errorMessage = result.errorMessage;
      const triageProfile1 = resolveTriageProfile(config.apmContext, next.key);
      if (triageProfile1) {
        const rawError = result.errorMessage ?? "Unknown failure";
        pipelineSummaries.push(itemSummary);
        flushReports(config, state);
        return handleTriageReroute(slug, next.key, rawError, triageProfile1, config, itemSummary, roamAvailable, client);
      }
      logger.event("item.end", next.key, { outcome: result.outcome, error_preview: result.errorMessage });
    }
  } else if (result.outcome === "completed") {
    await completeItem(slug, next.key);
    logger.event("item.end", next.key, { outcome: "completed" });
  } else {
    itemSummary.outcome = result.outcome;
    itemSummary.errorMessage = result.errorMessage;
    try {
      const failResult = await failItem(slug, next.key, result.errorMessage ?? "Unknown failure");
      if (failResult.halted) {
        logger.event("item.end", next.key, { outcome: result.outcome, halted: true, error_preview: `failed ${failResult.failCount} times` });
        return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
      }
    } catch {
      logger.event("item.end", next.key, { outcome: "error", halted: true, error_preview: "Could not record failure in pipeline state" });
      return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
    }
    const triageProfile2 = resolveTriageProfile(config.apmContext, next.key);
    if (triageProfile2) {
      const rawError = result.errorMessage ?? "Unknown failure";
      pipelineSummaries.push(itemSummary);
      flushReports(config, state);
      return handleTriageReroute(slug, next.key, rawError, triageProfile2, config, itemSummary, roamAvailable, client);
    }
    logger.event("item.end", next.key, { outcome: result.outcome, error_preview: result.errorMessage });
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
      await salvageForDraft(slug, next.key);
      const draftFlagPath = path.join(appRoot, "in-progress", `${slug}.blocked-draft`);
      fs.writeFileSync(draftFlagPath, result.errorMessage ?? "Handler signaled salvage", "utf-8");
    } catch (e) {
      logger.event("item.end", next.key, { outcome: "error", halted: true, error_preview: "Failed to salvage pipeline state" });
      return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
    }
    return finishItem(itemSummary, result.outcome, stepStart, config, state);
  }

  // Post-run hook (driven by workflow manifest "post" field)
  if (result.outcome === "completed" && node?.post) {
    logger.event("item.start", next.key, { agent: "post-hook", phase: next.phase ?? "unknown", node_type: "hook", category: node.category ?? "unknown" });
    try {
      execSync(node.post, {
        cwd: appRoot,
        stdio: "pipe",
        timeout: 120_000,
        env: {
          ...process.env,
          SLUG: slug,
          APP_ROOT: appRoot,
          REPO_ROOT: repoRoot,
          BASE_BRANCH: baseBranch,
        },
      });
      logger.event("item.end", next.key, { outcome: "completed", note: `post-hook passed for ${next.key}` });
    } catch (postErr: unknown) {
      const execErr = postErr as { stderr?: Buffer; message?: string };
      const postFailure = execErr.stderr?.toString().trim() || execErr.message || "post-hook failed";
      logger.event("state.fail", next.key, { error_signature: null, error_preview: `post-hook: ${postFailure}` });
      const failMsg = `post-hook: ${postFailure}`;
      try { await failItem(slug, next.key, failMsg); } catch { /* best-effort */ }
      itemSummary.outcome = "failed";
      itemSummary.errorMessage = failMsg;
      flushReports(config, state);
      const triageProfile3 = resolveTriageProfile(config.apmContext, next.key);
      if (triageProfile3) {
        return handleTriageReroute(slug, next.key, failMsg, triageProfile3, config, itemSummary, roamAvailable, client);
      }
      return finishItem(itemSummary, "failed", stepStart, config, state, { halt: true });
    }
  }

  // Auto-capture HEAD SHA for deploy-category script nodes (push → local-exec migration).
  // Placed AFTER the post-hook so that if the post-hook pushes additional commits
  // (e.g. deploy-trigger sentinels), the captured SHA reflects the final pushed state.
  // Downstream poll nodes use this for SHA-pinned CI filtering.
  if (
    result.outcome === "completed" &&
    node?.category === "deploy" &&
    node?.type === "script" &&
    !state.lastPushedShas[next.key]
  ) {
    try {
      const headSha = execSync("git rev-parse HEAD", {
        cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
      }).trim();
      if (headSha) {
        state.lastPushedShas[next.key] = headSha;
        state.handlerOutputs[next.key] = {
          ...(state.handlerOutputs[next.key] ?? {}),
          lastPushedSha: headSha,
        };
        logger.event("handoff.emit", next.key, {
          channel: "handler_data",
          keys: ["lastPushedSha"],
          auto_captured: true,
        });
      }
    } catch { /* non-fatal */ }
  }

  return finishItem(itemSummary, result.outcome === "completed" ? "completed" : result.outcome, stepStart, config, state);
}
