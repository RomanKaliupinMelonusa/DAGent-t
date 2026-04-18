/**
 * handlers/copilot-agent.ts — Copilot SDK agent session handler.
 *
 * Orchestrates a pipeline item's LLM agent run:
 * 1. Build AgentContext from NodeContext + APM config (+ upstream handoff artifacts)
 * 2. Resolve tool/harness limits + sandbox with APM cascade (support/agent-limits)
 * 3. Build task prompt (with pendingContext injection)
 * 4. Delegate the session to `adapters/copilot-session-runner`
 * 5. Post-session: record HEAD, git-diff fallback, budget utilization
 *    (support/agent-post-session — all git I/O via ctx.vcs port)
 * 6. Classify outcome from `reportedOutcome` (Phase A: kernel-sole-writer).
 *    The agent must terminate by calling the `report_outcome` SDK tool;
 *    a missing outcome is treated as a failure.
 *
 * This handler is an OBSERVER — it does not call completeItem/failItem.
 * The kernel is the sole authority on pipeline state transitions.
 *
 * All I/O flows through ctx ports. No direct child_process / filesystem /
 * state-module imports are permitted in this file.
 */

import { getAgentConfig, buildTaskPrompt } from "../apm/agents.js";
import { extractDiagnosticTrace } from "../types.js";
import { writeChangeManifest } from "../reporting.js";
import { runCopilotSession } from "../adapters/copilot-session-runner.js";
import { buildAgentContext } from "./support/agent-context.js";
import { resolveAgentLimits } from "./support/agent-limits.js";
import { enrichPostSessionTelemetry } from "./support/agent-post-session.js";
import type { NodeHandler, NodeContext, NodeResult } from "./types.js";
import type { ItemSummary } from "../types.js";

// ---------------------------------------------------------------------------
// Workflow node helpers
// ---------------------------------------------------------------------------

function getWorkflowNode(ctx: NodeContext) {
  return ctx.apmContext.workflows?.[ctx.pipelineState.workflowName]?.nodes?.[ctx.itemKey];
}

function getTimeout(ctx: NodeContext): number {
  const node = getWorkflowNode(ctx);
  return (node?.timeout_minutes ?? 15) * 60_000;
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
    const { itemKey, slug, appRoot, repoRoot, apmContext, attempt, pipelineSummaries } = ctx;

    const client = ctx.client;
    if (!client) {
      return {
        outcome: "error",
        errorMessage: `BUG: copilot-agent handler requires a CopilotClient but ctx.client is undefined`,
        summary: {},
      };
    }

    // ── 1. Build agent context ──────────────────────────────────────────────
    const { agentContext, upstreamArtifacts } = buildAgentContext(ctx);
    const hasArtifacts = Object.keys(upstreamArtifacts).length > 0;

    if (hasArtifacts) {
      ctx.logger.event("handoff.inject", itemKey, {
        injection_types: ["upstream_artifacts"],
        artifact_sources: Object.keys(upstreamArtifacts),
      });
    }

    const agentConfig = getAgentConfig(itemKey, agentContext, apmContext);
    const timeout = getTimeout(ctx);

    // ── 2. Resolve tool + harness limits + sandbox ──────────────────────────
    const limits = resolveAgentLimits(ctx);

    // ── 3. Build task prompt (with pendingContext injection) ────────────────
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
      await writeChangeManifest(
        slug,
        appRoot,
        repoRoot,
        pipelineSummaries as ItemSummary[],
        (s) => ctx.stateReader.getStatus(s),
      );
    }

    // ── 4. Run the SDK session via adapter ──────────────────────────────────
    const telemetry = initTelemetry(itemKey, attempt);
    const defaultFatalPatterns = ["authentication info", "custom provider", "rate limit"];
    const fatalPatterns = apmContext.config?.fatal_sdk_errors ?? defaultFatalPatterns;

    const { sessionError, fatalError, reportedOutcome } = await runCopilotSession(client, {
      slug, itemKey, appRoot, repoRoot,
      model: agentConfig.model,
      systemMessage: agentConfig.systemMessage,
      taskPrompt,
      timeout,
      tools: limits.filteredTools,
      mcpServers: agentConfig.mcpServers as Record<string, unknown> | undefined,
      sandbox: limits.sandbox,
      harnessLimits: limits.harnessLimits,
      toolLimits: limits.toolLimits,
      telemetry,
      pipelineSummaries,
      fatalPatterns,
      writeThreshold: limits.writeThreshold,
      preTimeoutPercent: limits.preTimeoutPercent,
      runtimeTokenBudget: limits.runtimeTokenBudget,
      logger: ctx.logger,
    });

    // ── 5. Post-session telemetry (via ctx.vcs port) ────────────────────────
    await enrichPostSessionTelemetry(ctx, {
      telemetry,
      toolLimitsHard: limits.toolLimits.hard,
      runtimeTokenBudget: limits.runtimeTokenBudget,
    });

    // ── 6. Classify outcome ─────────────────────────────────────────────────
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

    // Phase A: the agent must report its terminal outcome via the
    // `report_outcome` SDK tool. The static guard in arch-check.mjs locks
    // every prompt onto this contract; the bash mutation verbs no longer
    // exist (Phase A.6). A missing reportedOutcome here means the agent
    // ended its session without signalling — treat as a failure.
    if (reportedOutcome) {
      if (reportedOutcome.status === "failed") {
        const message = reportedOutcome.message;
        telemetry.outcome = "failed";
        telemetry.errorMessage = message;
        const diagTrace = extractDiagnosticTrace(message);
        ctx.logger.event("item.end", itemKey, { outcome: "failed", source: "report_outcome" });
        return {
          outcome: "failed",
          errorMessage: message,
          summary: telemetry,
          ...(diagTrace ? { diagnosticTrace: diagTrace } : {}),
        };
      }
      ctx.logger.event("item.end", itemKey, { outcome: "completed", source: "report_outcome" });
      return { outcome: "completed", summary: telemetry };
    }

    const missingOutcomeMsg =
      "Agent session ended without calling report_outcome. " +
      "Every agent prompt must terminate by invoking the report_outcome SDK tool " +
      "with status: 'completed' or 'failed'.";
    telemetry.outcome = "failed";
    telemetry.errorMessage = missingOutcomeMsg;
    ctx.logger.event("item.end", itemKey, { outcome: "failed", source: "missing_outcome" });
    return {
      outcome: "failed",
      errorMessage: missingOutcomeMsg,
      summary: telemetry,
    };
  },
};

export default copilotAgentHandler;
