/**
 * session-runner.ts — Orchestration kernel for individual pipeline items.
 *
 * This module is the thin dispatcher that routes each DAG step to a
 * registered NodeHandler via the handler plugin system. All heavyweight
 * logic lives in handler implementations under `handlers/`:
 *   - handlers/git-push.ts        — Deterministic git commit + push
 *   - handlers/github-ci-poll.ts  — CI workflow polling with transient retry
 *   - handlers/github-pr-publish.ts — Draft PR → Ready for Review
 *   - handlers/copilot-agent.ts   — Full Copilot SDK agent session lifecycle
 *
 * Supporting modules:
 *   - session/shared.ts           — Workflow node helpers, reporting utilities
 *   - session/readiness-probe.ts  — Data-plane readiness polling and validation hooks
 *   - session/triage-dispatcher.ts — Post-deploy failure triage and rerouting
 *
 * Retained here:
 *   - PipelineRunState / PipelineRunConfig / SessionResult interfaces
 *   - runItemSession()  — Main dispatch (auto-skip, readiness, handler routing)
 *   - runViaHandler()   — Handler execution kernel (state transitions, triage)
 *   - tryAutoSkip()     — Data-driven auto-skip logic
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { CopilotClient } from "@github/copilot-sdk";
import { getStatus, failItem, completeItem, salvageForDraft } from "./state.js";
import type { ApmCompiledOutput } from "./apm-types.js";
import type { NextAction, ItemSummary } from "./types.js";
import { parseTriageDiagnostic } from "./triage.js";
import { getAutoSkipBaseRef, getGitChangedFiles, getDirectoryPrefixes, getGitDeletions, hasDeletedFiles } from "./auto-skip.js";
import { writeFlightData } from "./reporting.js";
import {
  computeEffectiveDevAttempts,
} from "./context-injection.js";

// ── Submodule imports ──────────────────────────────────────────────────────
import {
  getWorkflowNode,
  findUpstreamDevKeys,
  shouldSkipRetry,
  flushReports,
  finishItem,
} from "./session/shared.js";
import { pollReadiness, runValidateInfra } from "./session/readiness-probe.js";
import { handleFailureReroute } from "./session/triage-dispatcher.js";
import { resolveHandler } from "./handlers/index.js";
import type { NodeContext, NodeResult } from "./handlers/index.js";

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
   * Captured by git-push handler, consumed by github-ci-poll handler for SHA-pinned CI polling.
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
    return runViaHandler("git-push", next, config, state, itemSummary, stepStart, client);
  }
  if (node?.script_type === "poll") {
    return runViaHandler("github-ci-poll", next, config, state, itemSummary, stepStart, client);
  }
  if (node?.script_type === "publish") {
    return runViaHandler("github-pr-publish", next, config, state, itemSummary, stepStart, client);
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
  return runViaHandler("copilot-agent", next, config, state, itemSummary, stepStart, client);
}

// ---------------------------------------------------------------------------
// Handler-based dispatch (kernel owns state transitions)
// ---------------------------------------------------------------------------

/**
 * Execute a pipeline item through the NodeHandler plugin interface.
 * The kernel assembles NodeContext, calls handler.execute(), and maps
 * the NodeResult back to pipeline state transitions and SessionResult.
 *
 * Handlers are OBSERVERS — they never call completeItem/failItem.
 * This function is the sole state mutator for handler-dispatched items.
 */
async function runViaHandler(
  handlerRef: string,
  next: NextAction & { key: string },
  config: PipelineRunConfig,
  state: PipelineRunState,
  itemSummary: ItemSummary,
  stepStart: number,
  client?: CopilotClient,
): Promise<SessionResult> {
  const { slug, appRoot, repoRoot, baseBranch, apmContext, roamAvailable } = config;
  const { pipelineSummaries, attemptCounts } = state;
  const node = getWorkflowNode(apmContext, next.key);

  // --- Resolve handler ---
  const handler = await resolveHandler(handlerRef, appRoot, repoRoot);

  // --- Build handler context ---
  const currentState = await getStatus(slug);
  const effectiveAttempts = await computeEffectiveDevAttempts(
    next.key, attemptCounts[next.key], slug, node?.category,
  );

  // Previous attempt (for retry context)
  const previousAttempt = attemptCounts[next.key] > 1
    ? [...pipelineSummaries].reverse().find((s) => s.key === next.key)
    : undefined;

  // Downstream failures (for redevelopment context)
  const downstreamFailures = pipelineSummaries.filter(
    (s) => s.outcome !== "completed" && s.key !== next.key &&
      getWorkflowNode(apmContext, s.key)?.category === "test",
  );

  // Heartbeat callback (throttled)
  let lastHeartbeat = 0;
  const onHeartbeat = () => {
    if (Date.now() - lastHeartbeat < 1500) return;
    lastHeartbeat = Date.now();
    const liveSummaries = [...pipelineSummaries, { ...itemSummary, outcome: "in-progress" as const }];
    writeFlightData(appRoot, slug, liveSummaries, true);
  };

  // Cross-handler data (e.g. lastPushedSha from push → poll)
  const handlerData: Record<string, unknown> = {};
  // Propagate lastPushedShas for poll handlers
  for (const [k, v] of Object.entries(state.lastPushedShas)) {
    handlerData[`lastPushedSha:${k}`] = v;
  }
  // Propagate all prior handler outputs for downstream access
  for (const [itemKey, outputs] of Object.entries(state.handlerOutputs)) {
    for (const [k, v] of Object.entries(outputs)) {
      handlerData[`${itemKey}:${k}`] = v;
    }
  }
  // Propagate pre-step git ref for git-diff fallback in agent handler
  if (state.preStepRefs[next.key]) {
    handlerData["preStepRef"] = state.preStepRefs[next.key];
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
  };

  // --- shouldSkip check ---
  if (handler.shouldSkip) {
    const skipResult = await handler.shouldSkip(ctx);
    if (skipResult) {
      console.log(`  ⏭ Handler skip: ${next.key} — ${skipResult.reason}`);
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
    console.error(`  ✖ Handler "${handler.name}" threw: ${message}`);
    result = {
      outcome: "error",
      errorMessage: message,
      summary: {},
    };
  }

  // --- Process result: kernel owns state transitions ---
  // Merge handler summary into itemSummary
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

  // Store cross-handler output (e.g. lastPushedSha for downstream poll)
  if (result.handlerOutput) {
    // Store full handler output for downstream access
    state.handlerOutputs[next.key] = {
      ...(state.handlerOutputs[next.key] ?? {}),
      ...result.handlerOutput,
    };
    // Backward compat: also store lastPushedSha in dedicated map
    const sha = result.handlerOutput.lastPushedSha;
    if (typeof sha === "string") {
      state.lastPushedShas[next.key] = sha;
    }
  }

  // Record HEAD for circuit breaker
  try {
    itemSummary.headAfterAttempt = execSync("git rev-parse HEAD", {
      cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
    }).trim();
  } catch { /* non-fatal */ }

  // --- State transitions (kernel is sole mutator) ---
  // When stateManaged is true, the handler (or agent running inside it)
  // already called completeItem/failItem. The kernel skips its own calls
  // to avoid duplicate state mutations.
  if (result.stateManaged) {
    // Just log the observed outcome — state was already updated by the agent.
    if (result.outcome === "completed") {
      console.log(`  ✅ ${next.key} complete (state managed by handler)`);
    } else {
      itemSummary.outcome = result.outcome;
      itemSummary.errorMessage = result.errorMessage;

      // Triage routing for test-category failures
      if (node?.category === "test") {
        const rawError = result.errorMessage ?? "Unknown failure";
        const diagnostic = parseTriageDiagnostic(rawError);
        const errorMsg = diagnostic ? diagnostic.diagnostic_trace : rawError;
        pipelineSummaries.push(itemSummary);
        flushReports(config, state);
        return handleFailureReroute(slug, next.key, rawError, errorMsg, config, itemSummary, roamAvailable);
      }

      console.log(`  ⚠ ${next.key} failed — retrying on next loop iteration`);
    }
  } else if (result.outcome === "completed") {
    await completeItem(slug, next.key);
    console.log(`  ✅ ${next.key} complete`);
  } else {
    // Failed or error
    itemSummary.outcome = result.outcome;
    itemSummary.errorMessage = result.errorMessage;

    try {
      const failResult = await failItem(slug, next.key, result.errorMessage ?? "Unknown failure");
      if (failResult.halted) {
        console.error(`  ✖ HALTED: ${next.key} failed ${failResult.failCount} times. Exiting.`);
        return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
      }
    } catch {
      console.error("  ✖ Could not record failure in pipeline state.");
      return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
    }

    // Triage routing for test-category failures
    if (node?.category === "test") {
      const rawError = result.errorMessage ?? "Unknown failure";
      const diagnostic = parseTriageDiagnostic(rawError);
      const errorMsg = diagnostic ? diagnostic.diagnostic_trace : rawError;
      pipelineSummaries.push(itemSummary);
      flushReports(config, state);
      return handleFailureReroute(slug, next.key, rawError, errorMsg, config, itemSummary, roamAvailable);
    }

    console.log(`  ⚠ ${next.key} failed — retrying on next loop iteration`);
  }

  // --- Signal handling ---
  if (result.signal === "halt") {
    return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
  }
  if (result.signal === "create-pr") {
    return finishItem(itemSummary, "completed", stepStart, config, state, { createPr: true });
  }
  if (result.signal === "salvage-draft") {
    try {
      await salvageForDraft(slug, next.key);
      const draftFlagPath = path.join(appRoot, "in-progress", `${slug}.blocked-draft`);
      fs.writeFileSync(draftFlagPath, result.errorMessage ?? "Handler signaled salvage", "utf-8");
    } catch (e) {
      console.error("  ✖ Failed to salvage pipeline state", e);
      return finishItem(itemSummary, result.outcome, stepStart, config, state, { halt: true });
    }
    return finishItem(itemSummary, result.outcome, stepStart, config, state);
  }

  // Post-run validation hook (driven by workflow manifest)
  if (result.outcome === "completed" && node?.post_run_hook === "validateInfra") {
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

  return finishItem(itemSummary, result.outcome === "completed" ? "completed" : result.outcome, stepStart, config, state);
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
