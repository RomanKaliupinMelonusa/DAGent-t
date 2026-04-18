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
 * This handler is an OBSERVER — it does not call completeItem/failItem.
 * The kernel is the sole authority on pipeline state transitions.
 * The SDK agent may call pipeline:complete/fail via bash during the session,
 * and the kernel's idempotent state transitions handle this gracefully.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { approveAll } from "@github/copilot-sdk";
import type { CopilotClient, MCPServerConfig } from "@github/copilot-sdk";
import { getStatus, readState } from "../state.js";
import { getAgentConfig, buildTaskPrompt } from "../agents.js";
import type { AgentContext } from "../agents.js";
import { extractDiagnosticTrace } from "../types.js";
import { getAgentDirectoryPrefixes } from "../session/shared.js";
import { writeFlightData, writeChangeManifest } from "../reporting.js";
import {
  buildSessionHooks,
  buildCustomTools,
  DEFAULT_FILE_READ_LINE_LIMIT,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_SHELL_OUTPUT_LIMIT,
  DEFAULT_SHELL_TIMEOUT_MS,
} from "../tool-harness.js";
import type { ResolvedHarnessLimits } from "../tool-harness.js";
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
  return ctx.apmContext.workflows?.[ctx.pipelineState.workflowName]?.nodes?.[ctx.itemKey];
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
      attempt, pipelineSummaries,
    } = ctx;

    const client = ctx.client;
    if (!client) {
      return {
        outcome: "error",
        errorMessage: `BUG: copilot-agent handler requires a CopilotClient but ctx.client is undefined`,
        summary: {},
      };
    }

    // Build agent context — manifest-driven fields replace hardcoded constants
    const currentState = ctx.pipelineState;

    // Collect handoff artifacts from upstream completed items
    const upstreamArtifacts: Record<string, unknown> = {};
    for (const item of currentState.items) {
      if (item.status === "done" && item.handoffArtifact) {
        try { upstreamArtifacts[item.key] = JSON.parse(item.handoffArtifact); } catch { /* skip malformed */ }
      }
    }
    const hasArtifacts = Object.keys(upstreamArtifacts).length > 0;

    const agentContext: AgentContext = {
      featureSlug: slug,
      specPath: path.join(appRoot, "in-progress", `${slug}_SPEC.md`),
      deployedUrl: currentState.deployedUrl,
      workflowName: currentState.workflowName,
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

    if (hasArtifacts) {
      ctx.logger.event("handoff.inject", itemKey, {
        injection_types: ["upstream_artifacts"],
        artifact_sources: Object.keys(upstreamArtifacts),
      });
    }

    const agentConfig = getAgentConfig(itemKey, agentContext, apmContext);
    const timeout = getTimeout(ctx);

    // Resolve tool limits
    const manifestDefaults = apmContext.config?.defaultToolLimits;
    const agentToolLimits = apmContext.agents[itemKey]?.toolLimits;
    const resolvedToolLimits = {
      soft: agentToolLimits?.soft ?? manifestDefaults?.soft ?? TOOL_LIMIT_FALLBACK_SOFT,
      hard: agentToolLimits?.hard ?? manifestDefaults?.hard ?? TOOL_LIMIT_FALLBACK_HARD,
    };

    // Resolve per-agent harness limits (file read, shell output, etc.)
    const resolvedHarnessLimits: ResolvedHarnessLimits = {
      fileReadLineLimit: agentToolLimits?.fileReadLineLimit ?? manifestDefaults?.fileReadLineLimit ?? DEFAULT_FILE_READ_LINE_LIMIT,
      maxFileSize: agentToolLimits?.maxFileSize ?? manifestDefaults?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      shellOutputLimit: agentToolLimits?.shellOutputLimit ?? manifestDefaults?.shellOutputLimit ?? DEFAULT_SHELL_OUTPUT_LIMIT,
      shellTimeoutMs: agentToolLimits?.shellTimeoutMs ?? manifestDefaults?.shellTimeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS,
    };

    // Telemetry collector — we build a local ItemSummary for the SDK event
    // wiring functions (they require a full ItemSummary reference), then
    // return it as NodeResult.summary for the kernel to merge.
    const telemetry: ItemSummary = {
      key: itemKey,
      label: itemKey,    // placeholder — kernel's itemSummary has the real label
      agent: itemKey,    // placeholder
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
        ctx.logger.event("breaker.fire", itemKey, {
          type: "hard",
          tool_count: total,
          threshold: resolvedToolLimits.hard,
        });
        telemetry.errorMessage = `Cognitive circuit breaker: exceeded ${total} tool calls`;
        telemetry.outcome = "error";
        session.disconnect().catch(() => { /* best-effort */ });
      },
    );

    // --- Resolve sandbox (RBAC, write paths, tool allow-lists) ---
    const sandbox = resolveAgentSandbox(itemKey, apmContext, appRoot);

    // Filter custom tools to the agent's allow-list
    const allCustomTools = buildCustomTools(repoRoot, sandbox, appRoot, resolvedHarnessLimits);
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
      }, resolvedHarnessLimits),
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

    // Resolve per-agent tool limits with config-driven overrides
    const resolvedWriteThreshold = agentToolLimits?.writeThreshold ?? manifestDefaults?.writeThreshold;
    const resolvedPreTimeoutPercent = agentToolLimits?.preTimeoutPercent ?? manifestDefaults?.preTimeoutPercent;
    const resolvedRuntimeTokenBudget = agentToolLimits?.runtimeTokenBudget ?? manifestDefaults?.runtimeTokenBudget;

    wireToolLogging(session, telemetry, repoRoot, breaker, timeout, ctx.logger, triggerHeartbeat, resolvedWriteThreshold, resolvedPreTimeoutPercent);
    const mcpServers = (agentConfig.mcpServers as Record<string, unknown>) ?? {};
    const mcpTelemetryLog = wireMcpTelemetry(session, mcpServers, itemKey, ctx.logger, triggerHeartbeat);
    wireIntentLogging(session, telemetry, ctx.logger);
    wireMessageCapture(session, telemetry, ctx.logger);
    wireUsageTracking(session, telemetry, ctx.logger, triggerHeartbeat, resolvedRuntimeTokenBudget, (consumed, budget) => {
      telemetry.errorMessage = `Runtime token budget exceeded: ${consumed.toLocaleString()} / ${budget.toLocaleString()} tokens`;
      telemetry.outcome = "error";
      session.disconnect().catch(() => { /* best-effort */ });
    });

    // Build task prompt with context injection
    const node = getWorkflowNode(ctx);
    let taskPrompt = buildTaskPrompt(
      { key: itemKey, label: (ctx.pipelineState.items.find((i) => i.key === itemKey) as { label?: string })?.label ?? itemKey },
      slug,
      appRoot,
      apmContext,
    );

    // Inject pendingContext — the single entry point for all failure context.
    // The triage handler composes retry context, downstream failures, revert
    // warnings, and rejection narratives into a single pendingContext string
    // via setPendingContext. The copilot-agent handler only reads it.
    const pendingItem = ctx.pipelineState.items.find((i) => i.key === itemKey);
    if (pendingItem?.pendingContext) {
      taskPrompt += pendingItem.pendingContext;
      ctx.logger.event("handoff.inject", itemKey, {
        injection_types: ["pending_context"],
        context_length: pendingItem.pendingContext.length,
      });
    }

    // Write change manifest (manifest-driven)
    if (node?.generates_change_manifest) {
      await writeChangeManifest(slug, appRoot, repoRoot, pipelineSummaries as ItemSummary[], readState);
    }

    // --- Send prompt and wait ---
    let sessionError: string | undefined;
    let fatalError = false;
    try {
      await session.sendAndWait({ prompt: taskPrompt }, timeout);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.logger.event("state.fail", itemKey, { error_preview: message });

      // Don't overwrite circuit breaker messages
      if (!telemetry.errorMessage?.includes("Cognitive circuit breaker")) {
        telemetry.outcome = "error";
        telemetry.errorMessage = message;
        sessionError = message;
      } else {
        sessionError = telemetry.errorMessage;
      }

      // Fast-fail for fatal SDK / authentication errors (non-retryable)
      const defaultFatalPatterns = ["authentication info", "custom provider", "rate limit"];
      const fatalPatterns = apmContext.config?.fatal_sdk_errors ?? defaultFatalPatterns;
      if (fatalPatterns.some((p) => message.toLowerCase().includes(p))) {
        ctx.logger.event("item.end", itemKey, { outcome: "error", halted: true, error_preview: "Non-retryable SDK/Auth error" });
        fatalError = true;
      }

      // State transition deferred to kernel — handler is an observer.
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
            ctx.logger.event("handoff.emit", itemKey, {
              channel: "git_diff_fallback",
              file_count: scopedFiles.length,
            });
          }
        }
      } catch { /* non-fatal — SDK tracking is the primary source */ }
    }

    // --- Populate budget utilization for reporting ---
    const totalToolCalls = Object.values(telemetry.toolCounts).reduce((a, b) => a + b, 0);
    telemetry.budgetUtilization = {
      toolCallsUsed: totalToolCalls,
      toolCallLimit: resolvedToolLimits.hard,
      tokensConsumed: telemetry.inputTokens + telemetry.outputTokens,
      ...(resolvedRuntimeTokenBudget != null ? { tokenBudget: resolvedRuntimeTokenBudget } : {}),
    };

    // --- Handle fatal errors (session catch block set fatalError) ---
    if (fatalError) {
      return {
        outcome: telemetry.outcome === "error" ? "error" : "failed",
        errorMessage: sessionError,
        summary: telemetry,
        signal: "halt",
      };
    }

    // If sendAndWait threw, the error is already handled above.
    // Return early with the error outcome.
    if (sessionError) {
      return {
        outcome: telemetry.outcome === "error" ? "error" : "failed",
        errorMessage: sessionError,
        summary: telemetry,
      };
    }

    // --- Observe post-state to determine outcome ---
    const postState = await getStatus(slug);
    const item = postState.items.find((i) => i.key === itemKey);

    if (item?.status === "failed") {
      telemetry.outcome = "failed";
      telemetry.errorMessage = item.error ?? "Unknown failure";
      const diagTrace = extractDiagnosticTrace(item.error ?? "");
      return {
        outcome: "failed",
        errorMessage: item.error ?? "Unknown failure",
        summary: telemetry,
        ...(diagTrace ? { diagnosticTrace: diagTrace } : {}),
      };
    }

    ctx.logger.event("item.end", itemKey, { outcome: "completed" });
    return {
      outcome: "completed",
      summary: telemetry,
    };
  },
};

export default copilotAgentHandler;
