/**
 * ports/copilot-session-runner.ts — Port for SDK session execution.
 *
 * Abstracts the `@github/copilot-sdk` session lifecycle so handlers do
 * not depend on a concrete adapter. The production adapter lives at
 * `adapters/copilot-session-runner.ts`; tests can inject a stub.
 *
 * Ports are pure interface declarations — this file must not import
 * `@github/copilot-sdk` runtime values or any adapter.
 */

import type { CopilotClient } from "@github/copilot-sdk";
import type { AgentSandbox } from "../harness/sandbox.js";
import type { ResolvedHarnessLimits } from "../harness/index.js";
import type { ItemSummary } from "../types.js";
import type { PipelineLogger } from "../logger.js";
import type { ReportedOutcome } from "../harness/outcome-tool.js";

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
  reportedOutcome?: ReportedOutcome;
}

export interface CopilotSessionRunner {
  run(
    client: CopilotClient,
    params: CopilotSessionParams,
  ): Promise<CopilotSessionResult>;
}
