/**
 * session-runner.ts — Orchestrator for individual pipeline items.
 *
 * This module is the slim dispatcher that routes each DAG step to the
 * appropriate handler. Specialized logic has been extracted into:
 *   - session/shared.ts          — Workflow node helpers, circuit breaker, reporting
 *   - session/readiness-probe.ts — Data-plane readiness polling and validation hooks
 *   - session/session-events.ts  — SDK session event wiring (tool/playwright/intent/usage)
 *   - session/script-executor.ts — Deterministic push/poll/publish handlers
 *   - session/triage-dispatcher.ts — Post-deploy failure triage and rerouting
 *
 * Retained here:
 *   - PipelineRunState / PipelineRunConfig / SessionResult interfaces
 *   - runItemSession()  — Main dispatch (auto-skip, readiness, deterministic bypass, agent)
 *   - tryAutoSkip()     — Data-driven auto-skip logic
 *   - runAgentSession() — Full SDK session lifecycle
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { approveAll } from "@github/copilot-sdk";
import type { CopilotClient, MCPServerConfig } from "@github/copilot-sdk";
import { getStatus, failItem, completeItem, salvageForDraft } from "./state.js";
import { getAgentConfig, buildTaskPrompt } from "./agents.js";
import type { AgentContext } from "./agents.js";
import type { ApmCompiledOutput } from "./apm-types.js";
import type { NextAction, ItemSummary } from "./types.js";
import { parseTriageDiagnostic } from "./triage.js";
import { getAutoSkipBaseRef, getGitChangedFiles, getDirectoryPrefixes, getGitDeletions, hasDeletedFiles } from "./auto-skip.js";
import { writePlaywrightLog, writeFlightData } from "./reporting.js";
import {
  buildRetryContext,
  buildDownstreamFailureContext,
  buildInfraRollbackContext,
  buildRevertWarning,
  computeEffectiveDevAttempts,
  writeChangeManifest,
} from "./context-injection.js";
import { buildSessionHooks, buildCustomTools } from "./tool-harness.js";
import { resolveAgentSandbox } from "./agent-sandbox.js";

// ── Submodule imports ──────────────────────────────────────────────────────
import {
  getWorkflowNode,
  getTimeout,
  findUpstreamDevKeys,
  getAgentDirectoryPrefixes,
  shouldSkipRetry,
  flushReports,
  finishItem,
} from "./session/shared.js";
import { pollReadiness, runValidateInfra } from "./session/readiness-probe.js";
import {
  TOOL_LIMIT_FALLBACK_SOFT,
  TOOL_LIMIT_FALLBACK_HARD,
  TOOL_CATEGORIES,
  SessionCircuitBreaker,
  wireToolLogging,
  wireMcpTelemetry,
  wireIntentLogging,
  wireMessageCapture,
  wireUsageTracking,
} from "./session/session-events.js";
import { runPushCode, runPollCi, runPublishPr } from "./session/script-executor.js";
import { handleFailureReroute } from "./session/triage-dispatcher.js";

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
   * Captured by runPushCode(), consumed by runPollCi() for SHA-pinned CI polling.
   * Scoped per-item to prevent cross-contamination if multiple push items ever
   * run in the same batch.
   */
  lastPushedShas: Record<string, string>;
  /** Per-item flag: whether force_run_if_changed dirs had changes (set by tryAutoSkip, consumed by runAgentSession). Keyed by item key to prevent cross-contamination in parallel batches. */
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
}

export interface SessionResult {
  summary: ItemSummary;
  halt: boolean;
  createPr: boolean;
}

// ---------------------------------------------------------------------------
// Main session runner
// ---------------------------------------------------------------------------

/**
 * Run a single pipeline item — the core of each DAG step.
 * Handles auto-skip, deterministic bypasses, SDK sessions, and triage.
 */
export async function runItemSession(
  client: CopilotClient,
  next: NextAction & { key: string },
  config: PipelineRunConfig,
  state: PipelineRunState,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext, roamAvailable } = config;
  const { pipelineSummaries, attemptCounts, circuitBreakerBypassed, preStepRefs } = state;

  attemptCounts[next.key] = (attemptCounts[next.key] ?? 0) + 1;

  // --- Circuit breaker: skip if identical error + no code changed since last attempt ---
  if (attemptCounts[next.key] > 2 && shouldSkipRetry(repoRoot, next.key, pipelineSummaries)) {
    // For DEV items, grant one bypass so the clean-slate revert warning can fire.
    // The revert wipes ALL feature code (not just the delta between attempts),
    // so it may resolve the root cause even when shouldSkipRetry sees no change.
    const nodeForBreaker = getWorkflowNode(apmContext, next.key);
    if (nodeForBreaker?.category === "dev" && !circuitBreakerBypassed.has(next.key)) {
      console.log(`\n  ⚡ Circuit breaker deferred for ${next.key} — granting clean-slate revert opportunity`);
      circuitBreakerBypassed.add(next.key);
    } else {
      console.log(`\n  ⚡ Circuit breaker: skipping ${next.key} — identical error with no code changes since last attempt`);
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

      // For DEV items stuck in timeout loops, salvage to Draft PR instead of
      // halting — gives humans something to review rather than losing all work.
      const lastError = pipelineSummaries
        .filter((s) => s.key === next.key && s.outcome !== "completed")
        .pop()?.errorMessage ?? "";
      const isTimeoutLoop = lastError.toLowerCase().includes("timeout");

      if (nodeForBreaker?.category === "dev" && isTimeoutLoop) {
        console.log(`  📝 DEV item ${next.key} stuck in timeout loop — triggering Graceful Degradation to Draft PR`);
        try {
          await failItem(slug, next.key, "Circuit breaker: timeout loop — salvaging to Draft PR");
          await salvageForDraft(slug, next.key);
          const draftFlagPath = path.join(appRoot, "in-progress", `${slug}.blocked-draft`);
          fs.writeFileSync(draftFlagPath, `Circuit breaker: ${next.key} timeout loop after ${attemptCounts[next.key]} attempts`, "utf-8");
        } catch (e) {
          console.error("  ✖ Failed to salvage pipeline state", e);
          return { summary: skipSummary, halt: true, createPr: false };
        }
        return { summary: skipSummary, halt: false, createPr: false };
      }

      return { summary: skipSummary, halt: true, createPr: false };
    }
  }

  console.log(
    `\n${"═".repeat(70)}\n  Phase: ${next.phase} | Item: ${next.key} | Agent: ${next.agent}\n${"═".repeat(70)}`,
  );

  // Snapshot HEAD before dev steps (for auto-skip change detection)
  // Also snapshot before ALL items for accurate filesChanged tracking via git diff
  if (!preStepRefs[next.key]) {
    try {
      preStepRefs[next.key] = execSync("git rev-parse HEAD", {
        cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
      }).trim();
    } catch { /* non-fatal */ }
  }

  // Collect session-level summary
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

  // --- Auto-skip no-op test/post-deploy items ---
  const autoSkipResult = await tryAutoSkip(next, config, state, itemSummary, stepStart);
  if (autoSkipResult) return autoSkipResult;

  // ── Post-deploy readiness probe ────────────────────────────────────────
  // Replaces the fixed-duration sleep with a stack-agnostic readiness probe.
  // Delegates to the validateApp hook with exponential backoff, or falls
  // back to a 60s propagation delay if no hook is configured.
  const node = getWorkflowNode(config.apmContext, next.key);
  if (node?.requires_data_plane_ready) {
    await pollReadiness(config);
  }

  // ── Deterministic bypasses (no agent session) ─────────────────────────
  // Script-type items must NEVER create an LLM session. push-* and poll-*
  // are handled by shell scripts — zero tokens, deterministic, no hallucination.
  if (node?.script_type === "push") {
    return runPushCode(next.key, config, state, itemSummary, stepStart);
  }
  if (node?.script_type === "poll") {
    return runPollCi(next.key, config, state, itemSummary, stepStart, roamAvailable,
      node.poll_target!, node.ci_workflow_key ?? "app", node.post_run_hook);
  }
  if (node?.script_type === "publish") {
    return runPublishPr(config, state, itemSummary, stepStart);
  }
  // Safety: if a script item has no script_type, fail loudly rather than
  // falling through to an LLM session.
  if (node?.type === "script") {
    throw new Error(
      `BUG: Script item "${next.key}" has type "script" but no script_type declared. ` +
      `Never route script items to LLM sessions. Either add script_type or change its type.`,
    );
  }

  // ── Agent session ─────────────────────────────────────────────────────
  return runAgentSession(client, next, config, state, itemSummary, stepStart);
}

// ---------------------------------------------------------------------------
// Auto-skip logic
// ---------------------------------------------------------------------------


async function tryAutoSkip(
  next: NextAction & { key: string },
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
): Promise<SessionResult | null> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext } = config;
  const { pipelineSummaries, preStepRefs } = state;

  // Reset per-item
  delete state.forceRunChangesDetected[next.key];

  const node = getWorkflowNode(apmContext, next.key);
  if (!node) return null; // No workflow node → no auto-skip

  const autoSkipRef = getAutoSkipBaseRef(repoRoot, baseBranch, preStepRefs);
  const appRel = path.relative(repoRoot, appRoot);
  const dirPrefixes = getDirectoryPrefixes(appRel, apmContext.config?.directories as Record<string, string | null> | undefined);

  const completeSkip = async (intent: string): Promise<SessionResult> => {
    await completeItem(slug, next.key);
    const result = finishItem(itemSummary, "completed", stepStart, config, state, { intents: [intent] });
    console.log(`  ✅ ${next.key} complete (auto-skipped)`);
    return result;
  };

  // ── Data-driven auto-skip: check directory changes ────────────────────
  if (node.auto_skip_if_no_changes_in && node.auto_skip_if_no_changes_in.length > 0) {
    // Find the best base ref — walk DAG backward to find nearest upstream dev node
    const workflow = apmContext.workflows?.default;
    const upstreamDevKeys = workflow ? findUpstreamDevKeys(workflow.nodes, next.key) : [];
    let devRef: string | null = null;
    for (const dk of upstreamDevKeys) {
      devRef = autoSkipRef(dk);
      if (devRef) break;
    }
    if (devRef) {
      const gitChanged = getGitChangedFiles(repoRoot, devRef);
      if (gitChanged === null) return null; // Fail-closed: abort skip on git error

      // Build union of prefixes from all declared directory keys
      const allPrefixes: string[] = [];
      for (const dirKey of node.auto_skip_if_no_changes_in) {
        const prefixSet = dirPrefixes[dirKey];
        if (prefixSet) {
          allPrefixes.push(...prefixSet);
        }
      }

      const hasChanges = gitChanged.some((f) => allPrefixes.some((p) => f.startsWith(p)));

      // Dynamic force-run: if force_run_if_changed dirs have changes but primary dirs don't,
      // force the node to run anyway (driven by workflow manifest)
      if (node.force_run_if_changed && node.force_run_if_changed.length > 0) {
        const forceRunPrefixes = node.force_run_if_changed.flatMap((k: string) => dirPrefixes[k] || []);
        const hasForceRunChanges = gitChanged.some((f) => forceRunPrefixes.some((p) => f.startsWith(p)));
        state.forceRunChangesDetected[next.key] = hasForceRunChanges;
        if (hasForceRunChanges) {
          const nonForceKeys = node.auto_skip_if_no_changes_in.filter((k: string) => !node.force_run_if_changed!.includes(k));
          const nonForcePrefixes = nonForceKeys.flatMap((k: string) => dirPrefixes[k] || []);
          if (!gitChanged.some((f) => nonForcePrefixes.some((p) => f.startsWith(p)))) {
            console.log(`  ▶ Running ${next.key} — force_run_if_changed dirs [${node.force_run_if_changed.join(", ")}] have changes`);
            return null; // Do NOT auto-skip
          }
        }
      }

      if (!hasChanges) {
        console.log(`  ⏭ Auto-skipping ${next.key} — no changes in [${node.auto_skip_if_no_changes_in.join(", ")}] since ${devRef.slice(0, 8)}`);
        return completeSkip(`Auto-skipped: no changes in [${node.auto_skip_if_no_changes_in.join(", ")}] detected (git diff)`);
      }
    }
  }

  // ── Data-driven auto-skip: check deletions ────────────────────────────
  if (node.auto_skip_if_no_deletions) {
    const deletions = getGitDeletions(repoRoot, baseBranch);
    const deleted = hasDeletedFiles(repoRoot, baseBranch);
    if (deletions === 0 && !deleted) {
      console.log(`  ⏭ Auto-skipping ${next.key} — feature is purely additive (0 deletions, 0 deleted files)`);
      return completeSkip(
        "Auto-skipped: Feature is purely additive (0 deletions detected in git diff). No architectural dead code possible.",
      );
    }
  }

  return null; // No auto-skip — continue to session
}

// ---------------------------------------------------------------------------
// Agent session
// ---------------------------------------------------------------------------

async function runAgentSession(
  client: CopilotClient,
  next: NextAction & { key: string },
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext, roamAvailable } = config;
  const { pipelineSummaries, attemptCounts, preStepRefs } = state;

  // Build agent context — manifest-driven fields replace hardcoded constants
  const currentState = await getStatus(slug);
  const agentContext: AgentContext = {
    featureSlug: slug,
    specPath: path.join(appRoot, "in-progress", `${slug}_SPEC.md`),
    deployedUrl: currentState.deployedUrl,
    workflowType: currentState.workflowType,
    repoRoot,
    appRoot,
    itemKey: next.key,
    baseBranch,
    ...(state.forceRunChangesDetected[next.key] && { forceRunChanges: true }),
    environment: apmContext.config?.environment as Record<string, string> | undefined,
    testCommands: apmContext.config?.testCommands as Record<string, string | null> | undefined,
    commitScopes: apmContext.config?.commitScopes,
  };

  const agentConfig = getAgentConfig(next.key, agentContext, apmContext);
  const timeout = getTimeout(next.key, apmContext);

  // Resolve tool limits early so the onDenial callback can reference them.
  const manifestDefaults = apmContext.config?.defaultToolLimits;
  const agentToolLimits = apmContext.agents[next.key]?.toolLimits;
  // Resolution order: per-agent → manifest default → last-resort fallback
  const resolvedToolLimits = {
    soft: agentToolLimits?.soft ?? manifestDefaults?.soft ?? TOOL_LIMIT_FALLBACK_SOFT,
    hard: agentToolLimits?.hard ?? manifestDefaults?.hard ?? TOOL_LIMIT_FALLBACK_HARD,
  };

  // Cognitive circuit breaker — single object shared by wireToolLogging
  // and the onDenial callback. Eliminates the fragile hardLimitRef pattern.
  const breaker = new SessionCircuitBreaker(
    resolvedToolLimits.soft,
    resolvedToolLimits.hard,
    (total) => {
      console.error(
        `\n  ✖ HARD LIMIT: Agent exceeded ${total} tool calls. ` +
        `Force-disconnecting session to prevent runaway compute waste.\n`,
      );
      itemSummary.errorMessage = `Cognitive circuit breaker: exceeded ${total} tool calls`;
      itemSummary.outcome = "error";
      session.disconnect().catch(() => { /* best-effort */ });
    },
  );

  // --- Resolve sandbox (RBAC, write paths, tool allow-lists) ---
  const sandbox = resolveAgentSandbox(next.key, apmContext, appRoot);

  // Filter custom tools to the agent's allow-list (empty sets = migration fallback: allow all)
  const allCustomTools = buildCustomTools(repoRoot, sandbox, appRoot);
  const agentHasToolConfig = sandbox.allowedCoreTools.size > 0 || sandbox.allowedMcpTools.size > 0;
  const filteredTools = agentHasToolConfig
    ? allCustomTools.filter((t) => sandbox.allowedCoreTools.has(t.name))
    : allCustomTools;

  // Create SDK session
  const session = await client.createSession({
    model: agentConfig.model,
    workingDirectory: repoRoot,
    onPermissionRequest: approveAll,
    systemMessage: { mode: "replace", content: agentConfig.systemMessage },
    tools: filteredTools,
    hooks: buildSessionHooks(repoRoot, sandbox, appRoot, (toolName) => {
      // Bridge denied tool calls into the circuit breaker counters.
      // SDK hooks that deny a tool may not fire tool.execution_start,
      // so we increment manually to prevent infinite denial loops.
      const category = TOOL_CATEGORIES[toolName] ?? toolName;
      breaker.recordCall(category, itemSummary.toolCounts);
    }),
    ...(agentConfig.mcpServers
      ? { mcpServers: agentConfig.mcpServers as Record<string, MCPServerConfig> }
      : {}),
  });

  // Wire session event listeners

  // Throttled heartbeat — writes _FLIGHT_DATA.json at most every 1.5 s
  // without calling the heavy Markdown/Git reporting functions.
  let lastHeartbeat = 0;
  let isSessionActive = true;
  const triggerHeartbeat = () => {
    if (!isSessionActive) return;
    if (Date.now() - lastHeartbeat < 1500) return;
    lastHeartbeat = Date.now();
    const liveSummaries = [...state.pipelineSummaries, { ...itemSummary, outcome: "in-progress" as const }];
    writeFlightData(config.appRoot, config.slug, liveSummaries, true);
  };

  wireToolLogging(session, itemSummary, repoRoot, breaker, timeout, triggerHeartbeat);
  const mcpServers = (agentConfig.mcpServers as Record<string, unknown>) ?? {};
  const mcpTelemetryLog = wireMcpTelemetry(session, mcpServers, triggerHeartbeat);
  wireIntentLogging(session, itemSummary);
  wireMessageCapture(session, itemSummary);
  wireUsageTracking(session, itemSummary, triggerHeartbeat);

  // Build task prompt with context injection
  let taskPrompt = buildTaskPrompt(
    { key: next.key, label: next.label },
    slug,
    appRoot,
    apmContext,
  );

  const nodeForCtx = getWorkflowNode(apmContext, next.key);
  const effectiveDevAttempts = await computeEffectiveDevAttempts(
    next.key,
    attemptCounts[next.key],
    slug,
    nodeForCtx?.category,
  );

  // Inject retry context from previous attempt
  if (attemptCounts[next.key] > 1) {
    const prevAttempt = [...pipelineSummaries]
      .reverse()
      .find((s) => s.key === next.key);
    if (prevAttempt) {
      const nodeForRevert = getWorkflowNode(apmContext, next.key);
      const atRevertThreshold = nodeForRevert?.category === "dev" && effectiveDevAttempts >= 3;
      taskPrompt += buildRetryContext(prevAttempt, atRevertThreshold);
      console.log(`  📎 Injected retry context from attempt ${prevAttempt.attempt}`);
    }
  }

  // Inject downstream failure context
  const downstreamCtx = buildDownstreamFailureContext(
    next.key,
    pipelineSummaries,
    apmContext.config?.ciWorkflows?.filePatterns as string[] | undefined,
    nodeForCtx?.category,
    apmContext.config?.ci_scope_warning as string | undefined,
  );
  if (downstreamCtx) {
    taskPrompt += downstreamCtx;
    const downstreamCount = pipelineSummaries.filter(
      (s) => getWorkflowNode(apmContext, s.key)?.category === "test" && s.outcome !== "completed",
    ).length;
    const involvesCicd = downstreamCtx.includes("Commit Scope Warning") || downstreamCtx.includes("scope");
    console.log(
      `  🔗 Injected downstream failure context from ${downstreamCount} post-deploy item(s)${involvesCicd ? " (with CI/CD scope guidance)" : ""}`,
    );
  }

  // Inject clean-slate revert warning
  const revertWarning = buildRevertWarning(next.key, effectiveDevAttempts, nodeForCtx?.category);
  if (revertWarning) {
    taskPrompt += revertWarning;
    console.log(
      `  🚨 Injected clean-slate revert warning (attempts: ${attemptCounts[next.key]} in-memory, ${effectiveDevAttempts - attemptCounts[next.key] >= 0 ? effectiveDevAttempts - attemptCounts[next.key] : 0} from persisted cycles, effective: ${effectiveDevAttempts})`,
    );
  }

  // Inject infra rollback context for redevelopment (manifest-driven)
  if (nodeForCtx?.injects_infra_rollback) {
    const infraCtx = await buildInfraRollbackContext(slug);
    if (infraCtx) {
      taskPrompt += infraCtx;
      console.log(`  🏗 Injected infra rollback context from reset-phases error log`);
    }
  }

  // Write change manifest (manifest-driven)
  if (nodeForCtx?.generates_change_manifest) {
    await writeChangeManifest(slug, appRoot, repoRoot, pipelineSummaries);
  }

  // --- Send prompt and wait ---
  try {
    await session.sendAndWait({ prompt: taskPrompt }, timeout);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✖ Session error: ${message}`);

    // Only overwrite if the circuit breaker hasn't already claimed the error.
    // session.disconnect() causes the SDK to throw a generic "Session closed"
    // error — without this guard, that overwrites the descriptive circuit
    // breaker message and confuses downstream triage routing.
    if (!itemSummary.errorMessage?.includes("Cognitive circuit breaker")) {
      itemSummary.outcome = "error";
      itemSummary.errorMessage = message;
    }

    // Fast-fail for fatal SDK / authentication errors (non-retryable)
    const fatalPatterns = ["authentication info", "custom provider", "rate limit"];
    if (fatalPatterns.some((p) => message.toLowerCase().includes(p))) {
      console.error(`  ✖ FATAL: Non-retryable SDK/Auth error. Halting pipeline immediately.`);
      try { await failItem(slug, next.key, message); } catch { /* best-effort */ }
      return finishItem(itemSummary, itemSummary.outcome, stepStart, config, state, { halt: true });
    }

    try {
      const result = await failItem(slug, next.key, message);
      if (result.halted) {
        console.error(
          `  ✖ HALTED: ${next.key} failed ${result.failCount} times. Exiting.`,
        );
        return finishItem(itemSummary, itemSummary.outcome, stepStart, config, state, { halt: true });
      }
    } catch {
      console.error("  ✖ Could not record failure in pipeline state. Exiting.");
      itemSummary.finishedAt = new Date().toISOString();
      itemSummary.durationMs = Date.now() - stepStart;
      pipelineSummaries.push(itemSummary);
      return { summary: itemSummary, halt: true, createPr: false };
    }
  } finally {
    isSessionActive = false;
    await session.disconnect();
  }

  // Record timing
  itemSummary.finishedAt = new Date().toISOString();
  itemSummary.durationMs = Date.now() - stepStart;

  // Record HEAD for circuit breaker (identical-error dedup)
  try { itemSummary.headAfterAttempt = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf-8", timeout: 5_000 }).trim(); } catch { /* non-fatal */ }

  // Git-diff fallback for filesChanged tracking.
  // SDK tool.execution_start events (write_file, edit_file, create_file) are
  // the primary source, but they can miss files written by shell commands that
  // don't match SHELL_WRITE_PATTERNS (e.g. tool-generated code, npm scripts).
  //
  // To avoid cross-agent attribution pollution in parallel runs, the diff is
  // scoped to the agent's directories (from APM config.directories).
  if (itemSummary.filesChanged.length === 0 && preStepRefs[next.key]) {
    try {
      const diffOutput = execSync(
        `git diff --name-only ${preStepRefs[next.key]}..HEAD`,
        { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
      ).trim();
      if (diffOutput) {
        const appRel = path.relative(repoRoot, appRoot);
        const dirs = apmContext.config?.directories as Record<string, string | null> | undefined;
        // Build allowed directory prefixes for this agent to prevent cross-attribution
        const allowedPrefixes = getAgentDirectoryPrefixes(getWorkflowNode(apmContext, next.key), appRel, dirs);
        const diffFiles = diffOutput.split("\n").filter(Boolean);
        const scopedFiles = allowedPrefixes.length > 0
          ? diffFiles.filter((f) => allowedPrefixes.some((p) => f.startsWith(p)))
          : diffFiles.filter((f) => !f.includes("in-progress/"));
        for (const f of scopedFiles) {
          if (!itemSummary.filesChanged.includes(f)) {
            itemSummary.filesChanged.push(f);
          }
        }
        if (scopedFiles.length > 0) {
          console.log(`  📂 Git-diff fallback: attributed ${scopedFiles.length} file(s) to ${next.key}`);
        }
      }
    } catch { /* non-fatal — SDK tracking is the primary source */ }
  }

  pipelineSummaries.push(itemSummary);
  flushReports(config, state);

  if (mcpTelemetryLog.length > 0) {
    writePlaywrightLog(appRoot, repoRoot, slug, mcpTelemetryLog);
  }

  // After a publish-type script, signal the orchestrator to archive and exit.
  // (Defensive — publish scripts are normally handled by the deterministic bypass.)
  const postNode = getWorkflowNode(apmContext, next.key);
  if (postNode?.script_type === "publish") {
    return { summary: itemSummary, halt: false, createPr: true };
  }

  // Re-read state to check status
  const postState = await getStatus(slug);
  const item = postState.items.find((i) => i.key === next.key);

  if (item?.status === "failed") {
    itemSummary.outcome = "failed";
    itemSummary.errorMessage = item.error ?? "Unknown failure";
    // Post-deploy & unit test failure reroute
    const failedNode = getWorkflowNode(apmContext, next.key);
    if (failedNode?.category === "test") {
      const rawError = item.error ?? "Unknown failure";
      const diagnostic = parseTriageDiagnostic(rawError);
      const errorMsg = diagnostic ? diagnostic.diagnostic_trace : rawError;
      return handleFailureReroute(slug, next.key, rawError, errorMsg, config, itemSummary, roamAvailable);
    }
    // Infra-architect permission escalation → route to elevated deploy
    console.log(`  ⚠ ${next.key} failed — retrying on next loop iteration`);
  } else {
    // ── Declarative post-run validation hook ────────────────────────────
    // Runs a validation hook after the agent successfully completes.
    // Driven by post_run_hook in workflows.yml — no hardcoded item keys.
    const completedNode = getWorkflowNode(apmContext, next.key);
    if (completedNode?.post_run_hook === "validateInfra") {
      const infraFailure = runValidateInfra(config);
      if (infraFailure) {
        console.error(`  🚫 Infra validation failed after ${next.key}: ${infraFailure}`);
        const failMsg = JSON.stringify({ fault_domain: "infra", diagnostic_trace: `validateInfra hook: ${infraFailure}` });
        try { await failItem(slug, next.key, failMsg); } catch { /* best-effort */ }
        itemSummary.outcome = "failed";
        itemSummary.errorMessage = failMsg;
        flushReports(config, state);
        return handleFailureReroute(slug, next.key, failMsg, infraFailure, config, itemSummary, roamAvailable);
      }
    }
    console.log(`  ✅ ${next.key} complete`);
  }

  return { summary: itemSummary, halt: false, createPr: false };
}
