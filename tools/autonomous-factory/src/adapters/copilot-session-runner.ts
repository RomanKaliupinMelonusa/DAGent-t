/**
 * adapters/copilot-session-runner.ts — SDK session lifecycle adapter.
 *
 * Pure orchestration. Creates the SDK session, attaches the breaker's
 * disconnect-on-trip callback, delegates all telemetry wiring to
 * `wireSessionTelemetry`, awaits the send, classifies the outcome via
 * `domain/error-classification`, and guarantees disconnect.
 *
 * **Telemetry is still mutated in place** by the wire helpers. Full
 * event-bus extraction happens in Phase 2 (telemetry-init middleware).
 */

import { approveAll } from "@github/copilot-sdk";
import type { CopilotClient, MCPServerConfig } from "@github/copilot-sdk";

import {
  buildSessionHooks,
  buildReportOutcomeTool,
  type ResolvedHarnessLimits,
} from "../harness/index.js";
import type { AgentSandbox } from "../harness/sandbox.js";
import type { ItemSummary } from "../types.js";
import type { PipelineLogger } from "../telemetry/index.js";
import { TOOL_CATEGORIES, wireSessionTelemetry } from "../session/session-events.js";
import { captureGitFilesSnapshot, diffGitFilesSnapshots } from "../session/git-files-snapshot.js";
import { SessionCircuitBreaker } from "./session-circuit-breaker.js";
import { isFatalSdkError } from "../domain/error-classification.js";
import { writeFlightData } from "../reporting/index.js";

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
  fatalPatterns: readonly string[];
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
  /** Outcome reported by the agent via the `report_outcome` SDK tool. */
  reportedOutcome?: import("../harness/outcome-tool.js").ReportedOutcome;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runCopilotSession(
  client: CopilotClient,
  params: CopilotSessionParams,
): Promise<CopilotSessionResult> {
  const { telemetry, itemKey, logger, appRoot, slug, pipelineSummaries } = params;

  let session: Awaited<ReturnType<CopilotClient["createSession"]>>;

  // Breaker is constructed before the session; its onTrip callback captures
  // `session` by forward reference and disconnects on hard-limit breach.
  const breaker = new SessionCircuitBreaker(
    params.toolLimits.soft,
    params.toolLimits.hard,
    (total) => {
      logger.event("breaker.fire", itemKey, {
        type: "hard",
        tool_count: total,
        threshold: params.toolLimits.hard,
      });
      telemetry.errorMessage = `Cognitive circuit breaker: exceeded ${total} tool calls`;
      telemetry.outcome = "error";
      session.disconnect().catch(() => { /* best-effort */ });
    },
  );

  session = await client.createSession({
    model: params.model,
    workingDirectory: params.repoRoot,
    onPermissionRequest: approveAll,
    systemMessage: { mode: "replace", content: params.systemMessage },
    // `report_outcome` is appended unconditionally — every agent must be
    // able to signal its outcome to the orchestrator.
    tools: [...(params.tools as any[]), buildReportOutcomeTool(telemetry)],
    hooks: buildSessionHooks(params.repoRoot, params.sandbox, appRoot, (toolName) => {
      const category = TOOL_CATEGORIES[toolName] ?? toolName;
      breaker.recordCall(category, telemetry.toolCounts);
    }, params.harnessLimits),
    ...(params.mcpServers
      ? { mcpServers: params.mcpServers as Record<string, MCPServerConfig> }
      : {}),
  });

  // Heartbeat: snapshot _FLIGHT.json while the session is live so the
  // watcher (or Live UI) can render progress without waiting for finish.
  let isSessionActive = true;
  let lastHeartbeat = 0;
  const triggerHeartbeat = () => {
    if (!isSessionActive) return;
    if (Date.now() - lastHeartbeat < 1500) return;
    lastHeartbeat = Date.now();
    const liveSummaries = [...pipelineSummaries, { ...telemetry, outcome: "in-progress" as const }];
    writeFlightData(appRoot, slug, liveSummaries, true);
  };

  wireSessionTelemetry(session, {
    itemSummary: telemetry,
    itemKey,
    repoRoot: params.repoRoot,
    breaker,
    sessionTimeout: params.timeout,
    logger,
    mcpServers: params.mcpServers,
    triggerHeartbeat,
    writeThreshold: params.writeThreshold,
    preTimeoutPercent: params.preTimeoutPercent,
    runtimeTokenBudget: params.runtimeTokenBudget,
    onTokenBudgetExceeded: (consumed, budget) => {
      telemetry.errorMessage = `Runtime token budget exceeded: ${consumed.toLocaleString()} / ${budget.toLocaleString()} tokens`;
      telemetry.outcome = "error";
      session.disconnect().catch(() => { /* best-effort */ });
    },
  });

  let sessionError: string | undefined;
  let fatalError = false;
  // Boundary-snapshot the working tree so we can attribute shell-driven
  // writes (heredocs, sed, tee, …) without parsing arbitrary bash. The
  // delta is merged into telemetry.filesChanged after disconnect.
  const snapshotBefore = captureGitFilesSnapshot(params.repoRoot);
  try {
    await session.sendAndWait({ prompt: params.taskPrompt }, params.timeout);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.event("state.fail", itemKey, { error_preview: message });

    // Don't overwrite circuit-breaker-authored messages.
    if (!telemetry.errorMessage?.includes("Cognitive circuit breaker")) {
      telemetry.outcome = "error";
      telemetry.errorMessage = message;
      sessionError = message;
    } else {
      sessionError = telemetry.errorMessage;
    }

    if (isFatalSdkError(message, params.fatalPatterns)) {
      logger.event("item.end", itemKey, {
        outcome: "error",
        halted: true,
        error_preview: "Non-retryable SDK/Auth error",
      });
      fatalError = true;
    }
  } finally {
    isSessionActive = false;
    await session.disconnect();
    const snapshotAfter = captureGitFilesSnapshot(params.repoRoot);
    const touched = diffGitFilesSnapshots(snapshotBefore, snapshotAfter, params.repoRoot);
    for (const f of touched) {
      if (!telemetry.filesChanged.includes(f)) telemetry.filesChanged.push(f);
    }
  }

  return { sessionError, fatalError, reportedOutcome: telemetry.reportedOutcome };
}

// ---------------------------------------------------------------------------
// Port adapter — wraps runCopilotSession behind the CopilotSessionRunner port
// ---------------------------------------------------------------------------

import type { CopilotSessionRunner } from "../ports/copilot-session-runner.js";

export class NodeCopilotSessionRunner implements CopilotSessionRunner {
  run(client: CopilotClient, params: CopilotSessionParams): Promise<CopilotSessionResult> {
    return runCopilotSession(client, params);
  }
}

