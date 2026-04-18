/**
 * handlers/copilot-agent.ts — Copilot SDK agent session handler.
 *
 * Orchestrates a pipeline item's LLM agent run:
 * 1. Build AgentContext from NodeContext + APM config (+ upstream handoff artifacts)
 * 2. Resolve tool/harness limits with APM cascade
 * 3. Resolve sandbox (RBAC, write paths, tool allow-lists) and filter tools
 * 4. Delegate the session to `adapters/copilot-session-runner` (createSession,
 *    telemetry wiring, sendAndWait, disconnect, error classification)
 * 5. Post-process: record HEAD, git-diff fallback for filesChanged, budget utilization
 * 6. Observe post-state to decide final outcome
 *
 * This handler is an OBSERVER — it does not call completeItem/failItem.
 * The kernel is the sole authority on pipeline state transitions.
 * The SDK agent may call pipeline:complete/fail via bash during the session,
 * and the kernel's idempotent state transitions handle this gracefully.
 */

import path from "node:path";
import { execSync } from "node:child_process";
import { getStatus, readState } from "../state.js";
import { getAgentConfig, buildTaskPrompt } from "../agents.js";
import type { AgentContext } from "../agents.js";
import { extractDiagnosticTrace } from "../types.js";
import { getAgentDirectoryPrefixes } from "../session/shared.js";
import { writeChangeManifest } from "../reporting.js";
import {
  DEFAULT_FILE_READ_LINE_LIMIT,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_SHELL_OUTPUT_LIMIT,
  DEFAULT_SHELL_TIMEOUT_MS,
  buildCustomTools,
} from "../tool-harness.js";
import type { ResolvedHarnessLimits } from "../tool-harness.js";
import { resolveAgentSandbox } from "../agent-sandbox.js";
import { TOOL_LIMIT_FALLBACK_SOFT, TOOL_LIMIT_FALLBACK_HARD } from "../session/session-events.js";
import { runCopilotSession } from "../adapters/copilot-session-runner.js";
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

/** Collect validated handoff artifacts from upstream completed items. */
function collectUpstreamArtifacts(state: NodeContext["pipelineState"]): Record<string, unknown> {
  const upstream: Record<string, unknown> = {};
  for (const item of state.items) {
    if (item.status === "done" && item.handoffArtifact) {
      try { upstream[item.key] = JSON.parse(item.handoffArtifact); } catch { /* skip malformed */ }
    }
  }
  return upstream;
}

/** Initialize a blank ItemSummary for telemetry collection. */
function initTelemetry(itemKey: string, attempt: number): ItemSummary {
  return {
    key: itemKey,
    label: itemKey,
    agent: itemKey,
    attempt,
    outcome: "completed",
    startedAt: new Date().toISOString(),
    finishedAt: "",
    durationMs: 0,
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

    // ── 1. Build agent context ──────────────────────────────────────────────
    const upstreamArtifacts = collectUpstreamArtifacts(ctx.pipelineState);
    const hasArtifacts = Object.keys(upstreamArtifacts).length > 0;

    const agentContext: AgentContext = {
      featureSlug: slug,
      specPath: path.join(appRoot, "in-progress", `${slug}_SPEC.md`),
      deployedUrl: ctx.pipelineState.deployedUrl,
      workflowName: ctx.pipelineState.workflowName,
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

    // ── 2. Resolve tool + harness limits ────────────────────────────────────
    const manifestDefaults = apmContext.config?.defaultToolLimits;
    const agentToolLimits = apmContext.agents[itemKey]?.toolLimits;
    const resolvedToolLimits = {
      soft: agentToolLimits?.soft ?? manifestDefaults?.soft ?? TOOL_LIMIT_FALLBACK_SOFT,
      hard: agentToolLimits?.hard ?? manifestDefaults?.hard ?? TOOL_LIMIT_FALLBACK_HARD,
    };
    const resolvedHarnessLimits: ResolvedHarnessLimits = {
      fileReadLineLimit: agentToolLimits?.fileReadLineLimit ?? manifestDefaults?.fileReadLineLimit ?? DEFAULT_FILE_READ_LINE_LIMIT,
      maxFileSize: agentToolLimits?.maxFileSize ?? manifestDefaults?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE,
      shellOutputLimit: agentToolLimits?.shellOutputLimit ?? manifestDefaults?.shellOutputLimit ?? DEFAULT_SHELL_OUTPUT_LIMIT,
      shellTimeoutMs: agentToolLimits?.shellTimeoutMs ?? manifestDefaults?.shellTimeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS,
    };
    const resolvedWriteThreshold = agentToolLimits?.writeThreshold ?? manifestDefaults?.writeThreshold;
    const resolvedPreTimeoutPercent = agentToolLimits?.preTimeoutPercent ?? manifestDefaults?.preTimeoutPercent;
    const resolvedRuntimeTokenBudget = agentToolLimits?.runtimeTokenBudget ?? manifestDefaults?.runtimeTokenBudget;

    // ── 3. Resolve sandbox + filter tools ──────────────────────────────────
    const sandbox = resolveAgentSandbox(itemKey, apmContext, appRoot);
    const allCustomTools = buildCustomTools(repoRoot, sandbox, appRoot, resolvedHarnessLimits);
    const agentHasToolConfig = sandbox.allowedCoreTools.size > 0 || sandbox.allowedMcpTools.size > 0;
    const filteredTools = agentHasToolConfig
      ? allCustomTools.filter((t) => sandbox.allowedCoreTools.has(t.name))
      : allCustomTools;

    // ── 4. Build task prompt (with pendingContext injection) ────────────────
    const node = getWorkflowNode(ctx);
    let taskPrompt = buildTaskPrompt(
      { key: itemKey, label: (ctx.pipelineState.items.find((i) => i.key === itemKey) as { label?: string })?.label ?? itemKey },
      slug,
      appRoot,
      apmContext,
    );

    // The triage handler composes retry context, downstream failures, revert
    // warnings, and rejection narratives into a single pendingContext string.
    const pendingItem = ctx.pipelineState.items.find((i) => i.key === itemKey);
    if (pendingItem?.pendingContext) {
      taskPrompt += pendingItem.pendingContext;
      ctx.logger.event("handoff.inject", itemKey, {
        injection_types: ["pending_context"],
        context_length: pendingItem.pendingContext.length,
      });
    }

    if (node?.generates_change_manifest) {
      await writeChangeManifest(slug, appRoot, repoRoot, pipelineSummaries as ItemSummary[], readState);
    }

    // ── 5. Run the SDK session via adapter ──────────────────────────────────
    const telemetry = initTelemetry(itemKey, attempt);
    const defaultFatalPatterns = ["authentication info", "custom provider", "rate limit"];
    const fatalPatterns = apmContext.config?.fatal_sdk_errors ?? defaultFatalPatterns;

    const { sessionError, fatalError } = await runCopilotSession(client, {
      slug, itemKey, appRoot, repoRoot,
      model: agentConfig.model,
      systemMessage: agentConfig.systemMessage,
      taskPrompt,
      timeout,
      tools: filteredTools,
      mcpServers: agentConfig.mcpServers as Record<string, unknown> | undefined,
      sandbox,
      harnessLimits: resolvedHarnessLimits,
      toolLimits: resolvedToolLimits,
      telemetry,
      pipelineSummaries,
      fatalPatterns,
      writeThreshold: resolvedWriteThreshold,
      preTimeoutPercent: resolvedPreTimeoutPercent,
      runtimeTokenBudget: resolvedRuntimeTokenBudget,
      logger: ctx.logger,
    });

    // ── 6. Post-session telemetry ───────────────────────────────────────────
    // Record HEAD for git-diff attribution
    try {
      telemetry.headAfterAttempt = execSync("git rev-parse HEAD", {
        cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
      }).trim();
    } catch { /* non-fatal */ }

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
            if (!telemetry.filesChanged.includes(f)) telemetry.filesChanged.push(f);
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

    // Budget utilization for reporting
    const totalToolCalls = Object.values(telemetry.toolCounts).reduce((a, b) => a + b, 0);
    telemetry.budgetUtilization = {
      toolCallsUsed: totalToolCalls,
      toolCallLimit: resolvedToolLimits.hard,
      tokensConsumed: telemetry.inputTokens + telemetry.outputTokens,
      ...(resolvedRuntimeTokenBudget != null ? { tokenBudget: resolvedRuntimeTokenBudget } : {}),
    };

    // ── 7. Classify outcome ─────────────────────────────────────────────────
    if (fatalError) {
      return {
        outcome: telemetry.outcome === "error" ? "error" : "failed",
        errorMessage: sessionError,
        summary: telemetry,
        signal: "halt",
      };
    }

    if (sessionError) {
      return {
        outcome: telemetry.outcome === "error" ? "error" : "failed",
        errorMessage: sessionError,
        summary: telemetry,
      };
    }

    // Observe post-state to determine outcome
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
    return { outcome: "completed", summary: telemetry };
  },
};

export default copilotAgentHandler;
