/**
 * adapters/copilot-session-runner.ts — SDK session lifecycle orchestrator.
 *
 * Encapsulates every direct interaction with `@github/copilot-sdk`:
 *   - createSession (with hooks, tools, MCP servers)
 *   - wire* event listeners (tool logging, MCP telemetry, intent, messages, usage)
 *   - sendAndWait + disconnect + error classification
 *   - cognitive circuit breaker (constructed here so its onTrip can
 *     disconnect the session it belongs to)
 *
 * The handler (`handlers/copilot-agent.ts`) calls `runCopilotSession(...)` and
 * focuses on orchestration — building context, resolving limits, observing
 * post-state — without ever touching SDK primitives.
 *
 * **Telemetry is mutated in place:** callers pass a pre-populated `ItemSummary`
 * and receive the same object back, with counts/intents/messages updated by
 * the wire helpers during the session.
 */

import { approveAll } from "@github/copilot-sdk";
import type { CopilotClient, MCPServerConfig } from "@github/copilot-sdk";

import {
  buildSessionHooks,
  type ResolvedHarnessLimits,
} from "../tool-harness.js";
import type { AgentSandbox } from "../agent-sandbox.js";
import type { ItemSummary } from "../types.js";
import type { PipelineLogger } from "../logger.js";
import {
  TOOL_CATEGORIES,
  SessionCircuitBreaker,
  wireToolLogging,
  wireMcpTelemetry,
  wireIntentLogging,
  wireMessageCapture,
  wireUsageTracking,
} from "../session/session-events.js";
import { writeFlightData } from "../reporting.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CopilotSessionParams {
  slug: string;
  itemKey: string;
  appRoot: string;
  repoRoot: string;
  model: string;
  systemMessage: string;
  taskPrompt: string;
  timeout: number;
  tools: unknown[];
  mcpServers?: Record<string, unknown>;
  sandbox: AgentSandbox;
  harnessLimits: ResolvedHarnessLimits;
  /** Cognitive circuit breaker thresholds (soft warn + hard kill). */
  toolLimits: { soft: number; hard: number };
  /** Telemetry collector — mutated in place by wire* helpers. */
  telemetry: ItemSummary;
  pipelineSummaries: ReadonlyArray<ItemSummary>;
  /** Fatal SDK error patterns — a match causes `fatalError: true`. */
  fatalPatterns: string[];
  writeThreshold?: number;
  preTimeoutPercent?: number;
  runtimeTokenBudget?: number;
  logger: PipelineLogger;
}

export interface CopilotSessionResult {
  /** Captured error message if sendAndWait rejected. */
  sessionError?: string;
  /** Whether the error matches a non-retryable SDK / auth pattern. */
  fatalError: boolean;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Run a Copilot SDK agent session end-to-end.
 * Creates the session, wires telemetry, sends the prompt, and disconnects.
 * Mutates `params.telemetry` in place; returns error classification.
 */
export async function runCopilotSession(
  client: CopilotClient,
  params: CopilotSessionParams,
): Promise<CopilotSessionResult> {
  const {
    slug, itemKey, appRoot, repoRoot, model, systemMessage, taskPrompt,
    timeout, tools, mcpServers, sandbox, harnessLimits, toolLimits,
    telemetry, pipelineSummaries, fatalPatterns,
    writeThreshold, preTimeoutPercent, runtimeTokenBudget,
    logger,
  } = params;

  let isSessionActive = true;
  let session: Awaited<ReturnType<CopilotClient["createSession"]>>;

  // Constructed here so the onTrip closure can capture `session` by reference.
  const breaker = new SessionCircuitBreaker(
    toolLimits.soft,
    toolLimits.hard,
    (total) => {
      logger.event("breaker.fire", itemKey, {
        type: "hard",
        tool_count: total,
        threshold: toolLimits.hard,
      });
      telemetry.errorMessage = `Cognitive circuit breaker: exceeded ${total} tool calls`;
      telemetry.outcome = "error";
      session.disconnect().catch(() => { /* best-effort */ });
    },
  );

  session = await client.createSession({
    model,
    workingDirectory: repoRoot,
    onPermissionRequest: approveAll,
    systemMessage: { mode: "replace", content: systemMessage },
    tools: tools as any,
    hooks: buildSessionHooks(repoRoot, sandbox, appRoot, (toolName) => {
      const category = TOOL_CATEGORIES[toolName] ?? toolName;
      breaker.recordCall(category, telemetry.toolCounts);
    }, harnessLimits),
    ...(mcpServers
      ? { mcpServers: mcpServers as Record<string, MCPServerConfig> }
      : {}),
  });

  let lastHeartbeat = 0;
  const triggerHeartbeat = () => {
    if (!isSessionActive) return;
    if (Date.now() - lastHeartbeat < 1500) return;
    lastHeartbeat = Date.now();
    const liveSummaries = [...pipelineSummaries, { ...telemetry, outcome: "in-progress" as const }];
    writeFlightData(appRoot, slug, liveSummaries, true);
  };

  wireToolLogging(session, telemetry, repoRoot, breaker, timeout, logger, triggerHeartbeat, writeThreshold, preTimeoutPercent);
  wireMcpTelemetry(session, mcpServers ?? {}, itemKey, logger, triggerHeartbeat);
  wireIntentLogging(session, telemetry, logger);
  wireMessageCapture(session, telemetry, logger);
  wireUsageTracking(session, telemetry, logger, triggerHeartbeat, runtimeTokenBudget, (consumed, budget) => {
    telemetry.errorMessage = `Runtime token budget exceeded: ${consumed.toLocaleString()} / ${budget.toLocaleString()} tokens`;
    telemetry.outcome = "error";
    session.disconnect().catch(() => { /* best-effort */ });
  });

  let sessionError: string | undefined;
  let fatalError = false;
  try {
    await session.sendAndWait({ prompt: taskPrompt }, timeout);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.event("state.fail", itemKey, { error_preview: message });

    // Don't overwrite circuit breaker messages
    if (!telemetry.errorMessage?.includes("Cognitive circuit breaker")) {
      telemetry.outcome = "error";
      telemetry.errorMessage = message;
      sessionError = message;
    } else {
      sessionError = telemetry.errorMessage;
    }

    // Fast-fail for fatal SDK / authentication errors (non-retryable)
    if (fatalPatterns.some((p) => message.toLowerCase().includes(p))) {
      logger.event("item.end", itemKey, { outcome: "error", halted: true, error_preview: "Non-retryable SDK/Auth error" });
      fatalError = true;
    }
  } finally {
    isSessionActive = false;
    await session.disconnect();
  }

  return { sessionError, fatalError };
}
