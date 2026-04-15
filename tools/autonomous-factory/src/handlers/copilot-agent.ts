/**
 * handlers/copilot-agent.ts — Copilot SDK agent session handler.
 *
 * Manages the full lifecycle of a Copilot SDK agent session:
 * 1. Builds agent context from NodeContext + APM config
 * 2. Creates SDK session with tools, hooks, MCP servers
 * 3. Wires telemetry event listeners (circuit breaker, tool logging, etc.)
 * 4. Builds task prompt with context injection (retry, downstream failures, revert)
 * 5. Sends prompt and waits for completion
 * 6. Observes post-state to determine outcome
 *
 * This handler sets `stateManaged: true` because the SDK agent itself
 * manages pipeline state transitions via tool calls during the session.
 * The kernel skips its own completeItem/failItem calls for this handler.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { approveAll } from "@github/copilot-sdk";
import type { CopilotClient, MCPServerConfig } from "@github/copilot-sdk";
import { getStatus, failItem } from "../state.js";
import { getAgentConfig, buildTaskPrompt } from "../agents.js";
import type { AgentContext } from "../agents.js";
import { parseTriageDiagnostic } from "../triage.js";
import { getAgentDirectoryPrefixes } from "../session/shared.js";
import { writePlaywrightLog, writeFlightData } from "../reporting.js";
import {
  buildRetryContext,
  buildDownstreamFailureContext,
  buildInfraRollbackContext,
  buildRevertWarning,
  writeChangeManifest,
} from "../context-injection.js";
import { buildSessionHooks, buildCustomTools } from "../tool-harness.js";
import { resolveAgentSandbox } from "../agent-sandbox.js";
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
} from "../session/session-events.js";
import type { NodeHandler, NodeContext, NodeResult } from "./types.js";
import type { ItemSummary } from "../types.js";

// ---------------------------------------------------------------------------
// Workflow node helper
// ---------------------------------------------------------------------------

function getWorkflowNode(ctx: NodeContext) {
  return ctx.apmContext.workflows?.default?.nodes?.[ctx.itemKey];
}

function getTimeout(ctx: NodeContext): number {
  const node = getWorkflowNode(ctx);
  return (node?.timeout_minutes ?? 15) * 60_000;
}

// ---------------------------------------------------------------------------
// Handler implementation
// ---------------------------------------------------------------------------

const copilotAgentHandler: NodeHandler = {
  name: "copilot-agent",

  async execute(ctx: NodeContext): Promise<NodeResult> {
    const {
      itemKey, slug, appRoot, repoRoot, baseBranch, apmContext,
      attempt, effectiveAttempts, previousAttempt, pipelineSummaries,
    } = ctx;

    // Cast client — typed as `unknown` in NodeContext to keep interface SDK-agnostic
    const client = ctx.client as CopilotClient;
    if (!client) {
      return {
        outcome: "error",
        errorMessage: `BUG: copilot-agent handler requires a CopilotClient but ctx.client is undefined`,
        summary: {},
      };
    }

    // Build agent context — manifest-driven fields replace hardcoded constants
    const currentState = ctx.pipelineState;
    const agentContext: AgentContext = {
      featureSlug: slug,
      specPath: path.join(appRoot, "in-progress", `${slug}_SPEC.md`),
      deployedUrl: currentState.deployedUrl,
      workflowType: currentState.workflowType,
      repoRoot,
      appRoot,
      itemKey,
      baseBranch,
      ...(ctx.forceRunChanges && { forceRunChanges: true }),
      environment: apmContext.config?.environment as Record<string, string> | undefined,
      testCommands: apmContext.config?.testCommands as Record<string, string | null> | undefined,
      commitScopes: apmContext.config?.commitScopes,
    };

    const agentConfig = getAgentConfig(itemKey, agentContext, apmContext);
    const timeout = getTimeout(ctx);

    // Resolve tool limits
    const manifestDefaults = apmContext.config?.defaultToolLimits;
    const agentToolLimits = apmContext.agents[itemKey]?.toolLimits;
    const resolvedToolLimits = {
      soft: agentToolLimits?.soft ?? manifestDefaults?.soft ?? TOOL_LIMIT_FALLBACK_SOFT,
      hard: agentToolLimits?.hard ?? manifestDefaults?.hard ?? TOOL_LIMIT_FALLBACK_HARD,
    };

    // Telemetry collector — we build a local ItemSummary for the SDK event
    // wiring functions (they require a full ItemSummary reference), then
    // return it as NodeResult.summary for the kernel to merge.
    const telemetry: ItemSummary = {
      key: itemKey,
      label: itemKey,    // placeholder — kernel's itemSummary has the real label
      agent: itemKey,    // placeholder
      phase: "",         // placeholder
      attempt,
      outcome: "completed",
      startedAt: new Date().toISOString(),
      finishedAt: "",    // set after session
      durationMs: 0,     // set after session
      intents: [],
      filesChanged: [],
      filesRead: [],
      shellCommands: [],
      toolCounts: {},
      messages: [],
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    // Cognitive circuit breaker
    let isSessionActive = true;
    let session: Awaited<ReturnType<CopilotClient["createSession"]>>;

    const breaker = new SessionCircuitBreaker(
      resolvedToolLimits.soft,
      resolvedToolLimits.hard,
      (total) => {
        console.error(
          `\n  ✖ HARD LIMIT: Agent exceeded ${total} tool calls. ` +
          `Force-disconnecting session to prevent runaway compute waste.\n`,
        );
        telemetry.errorMessage = `Cognitive circuit breaker: exceeded ${total} tool calls`;
        telemetry.outcome = "error";
        session.disconnect().catch(() => { /* best-effort */ });
      },
    );

    // --- Resolve sandbox (RBAC, write paths, tool allow-lists) ---
    const sandbox = resolveAgentSandbox(itemKey, apmContext, appRoot);

    // Filter custom tools to the agent's allow-list
    const allCustomTools = buildCustomTools(repoRoot, sandbox, appRoot);
    const agentHasToolConfig = sandbox.allowedCoreTools.size > 0 || sandbox.allowedMcpTools.size > 0;
    const filteredTools = agentHasToolConfig
      ? allCustomTools.filter((t) => sandbox.allowedCoreTools.has(t.name))
      : allCustomTools;

    // Create SDK session
    session = await client.createSession({
      model: agentConfig.model,
      workingDirectory: repoRoot,
      onPermissionRequest: approveAll,
      systemMessage: { mode: "replace", content: agentConfig.systemMessage },
      tools: filteredTools,
      hooks: buildSessionHooks(repoRoot, sandbox, appRoot, (toolName) => {
        const category = TOOL_CATEGORIES[toolName] ?? toolName;
        breaker.recordCall(category, telemetry.toolCounts);
      }),
      ...(agentConfig.mcpServers
        ? { mcpServers: agentConfig.mcpServers as Record<string, MCPServerConfig> }
        : {}),
    });

    // Wire session event listeners
    let lastHeartbeat = 0;
    const triggerHeartbeat = () => {
      if (!isSessionActive) return;
      if (Date.now() - lastHeartbeat < 1500) return;
      lastHeartbeat = Date.now();
      const liveSummaries = [...pipelineSummaries, { ...telemetry, outcome: "in-progress" as const }];
      writeFlightData(appRoot, slug, liveSummaries, true);
    };

    wireToolLogging(session, telemetry, repoRoot, breaker, timeout, triggerHeartbeat);
    const mcpServers = (agentConfig.mcpServers as Record<string, unknown>) ?? {};
    const mcpTelemetryLog = wireMcpTelemetry(session, mcpServers, triggerHeartbeat);
    wireIntentLogging(session, telemetry);
    wireMessageCapture(session, telemetry);
    wireUsageTracking(session, telemetry, triggerHeartbeat);

    // Build task prompt with context injection
    const node = getWorkflowNode(ctx);
    let taskPrompt = buildTaskPrompt(
      { key: itemKey, label: (ctx.pipelineState.items.find((i) => i.key === itemKey) as { label?: string })?.label ?? itemKey },
      slug,
      appRoot,
      apmContext,
    );

    // Inject retry context from previous attempt
    if (attempt > 1 && previousAttempt) {
      const atRevertThreshold = node?.category === "dev" && effectiveAttempts >= 3;
      taskPrompt += buildRetryContext(previousAttempt, atRevertThreshold);
      console.log(`  📎 Injected retry context from attempt ${previousAttempt.attempt}`);
    }

    // Inject downstream failure context
    const downstreamCtx = buildDownstreamFailureContext(
      itemKey,
      pipelineSummaries as ItemSummary[],
      apmContext.config?.ciWorkflows?.filePatterns as string[] | undefined,
      node?.category,
      apmContext.config?.ci_scope_warning as string | undefined,
      slug,
    );
    if (downstreamCtx) {
      taskPrompt += downstreamCtx;
      const downstreamCount = (ctx.downstreamFailures ?? []).length;
      const involvesCicd = downstreamCtx.includes("Commit Scope Warning") || downstreamCtx.includes("scope");
      console.log(
        `  🔗 Injected downstream failure context from ${downstreamCount} post-deploy item(s)${involvesCicd ? " (with CI/CD scope guidance)" : ""}`,
      );
    }

    // Inject clean-slate revert warning
    const revertWarning = buildRevertWarning(itemKey, effectiveAttempts, node?.category);
    if (revertWarning) {
      taskPrompt += revertWarning;
      console.log(
        `  🚨 Injected clean-slate revert warning (effective: ${effectiveAttempts})`,
      );
    }

    // Inject infra rollback context for redevelopment (manifest-driven)
    if (node?.injects_infra_rollback) {
      const infraCtx = await buildInfraRollbackContext(slug);
      if (infraCtx) {
        taskPrompt += infraCtx;
        console.log(`  🏗 Injected infra rollback context from reset-phases error log`);
      }
    }

    // Write change manifest (manifest-driven)
    if (node?.generates_change_manifest) {
      await writeChangeManifest(slug, appRoot, repoRoot, pipelineSummaries as ItemSummary[]);
    }

    // --- Send prompt and wait ---
    let sessionError: string | undefined;
    let fatalError = false;
    try {
      await session.sendAndWait({ prompt: taskPrompt }, timeout);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✖ Session error: ${message}`);

      // Don't overwrite circuit breaker messages
      if (!telemetry.errorMessage?.includes("Cognitive circuit breaker")) {
        telemetry.outcome = "error";
        telemetry.errorMessage = message;
        sessionError = message;
      } else {
        sessionError = telemetry.errorMessage;
      }

      // Fast-fail for fatal SDK / authentication errors (non-retryable)
      const fatalPatterns = ["authentication info", "custom provider", "rate limit"];
      if (fatalPatterns.some((p) => message.toLowerCase().includes(p))) {
        console.error(`  ✖ FATAL: Non-retryable SDK/Auth error. Halting pipeline immediately.`);
        fatalError = true;
      }

      // Record failure in pipeline state
      try {
        const failResult = await failItem(slug, itemKey, message);
        if (failResult.halted) {
          console.error(`  ✖ HALTED: ${itemKey} failed ${failResult.failCount} times. Exiting.`);
          fatalError = true;
        }
      } catch {
        console.error("  ✖ Could not record failure in pipeline state. Exiting.");
        fatalError = true;
      }
    } finally {
      isSessionActive = false;
      await session.disconnect();
    }

    // Record HEAD for git-diff attribution
    let headAfterAttempt: string | undefined;
    try {
      headAfterAttempt = execSync("git rev-parse HEAD", {
        cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
      }).trim();
    } catch { /* non-fatal */ }
    telemetry.headAfterAttempt = headAfterAttempt;

    // Git-diff fallback for filesChanged tracking
    const preStepRef = ctx.handlerData["preStepRef"] as string | undefined;
    if (telemetry.filesChanged.length === 0 && preStepRef) {
      try {
        const diffOutput = execSync(
          `git diff --name-only ${preStepRef}..HEAD`,
          { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
        ).trim();
        if (diffOutput) {
          const appRel = path.relative(repoRoot, appRoot);
          const dirs = apmContext.config?.directories as Record<string, string | null> | undefined;
          const allowedPrefixes = getAgentDirectoryPrefixes(getWorkflowNode(ctx), appRel, dirs);
          const diffFiles = diffOutput.split("\n").filter(Boolean);
          const scopedFiles = allowedPrefixes.length > 0
            ? diffFiles.filter((f) => allowedPrefixes.some((p) => f.startsWith(p)))
            : diffFiles.filter((f) => !f.includes("in-progress/"));
          for (const f of scopedFiles) {
            if (!telemetry.filesChanged.includes(f)) {
              telemetry.filesChanged.push(f);
            }
          }
          if (scopedFiles.length > 0) {
            console.log(`  📂 Git-diff fallback: attributed ${scopedFiles.length} file(s) to ${itemKey}`);
          }
        }
      } catch { /* non-fatal — SDK tracking is the primary source */ }
    }

    // Write Playwright telemetry log if any
    if (mcpTelemetryLog.length > 0) {
      writePlaywrightLog(appRoot, repoRoot, slug, mcpTelemetryLog);
    }

    // --- Handle fatal errors (session catch block set fatalError) ---
    if (fatalError) {
      return {
        outcome: telemetry.outcome === "error" ? "error" : "failed",
        errorMessage: sessionError,
        summary: telemetry,
        signal: "halt",
        stateManaged: true,
      };
    }

    // If sendAndWait threw, the error is already handled above.
    // Return early with the error outcome.
    if (sessionError) {
      return {
        outcome: telemetry.outcome === "error" ? "error" : "failed",
        errorMessage: sessionError,
        summary: telemetry,
        stateManaged: true,
      };
    }

    // --- Observe post-state to determine outcome ---
    const postState = await getStatus(slug);
    const item = postState.items.find((i) => i.key === itemKey);

    if (item?.status === "failed") {
      telemetry.outcome = "failed";
      telemetry.errorMessage = item.error ?? "Unknown failure";
      const diagnostic = parseTriageDiagnostic(item.error ?? "");
      return {
        outcome: "failed",
        errorMessage: item.error ?? "Unknown failure",
        summary: telemetry,
        stateManaged: true,
        ...(diagnostic ? { diagnosticTrace: diagnostic.diagnostic_trace } : {}),
      };
    }

    console.log(`  ✅ ${itemKey} complete`);
    return {
      outcome: "completed",
      summary: telemetry,
      stateManaged: true,
    };
  },
};

export default copilotAgentHandler;
