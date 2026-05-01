/**
 * contracts/copilot-session.ts — Concrete shape of the Copilot session
 * runner's parameters and result.
 *
 * Lives outside `ports/` so the port file can stay type-only with zero
 * cross-layer imports (rule #2). The runtime SDK adapter, the activity
 * that wraps the runner, and unit tests share these types from here.
 */

import type { CopilotClient } from "@github/copilot-sdk";
import type { AgentSandbox } from "../harness/sandbox.js";
import type {
  ResolvedHarnessLimits,
  NextFailureHintValidation,
  PrecompletionGate,
} from "../harness/index.js";
import type { ReportedOutcome } from "../harness/outcome-tool.js";
import type { ItemSummary } from "../types.js";
import type { PipelineLogger } from "../telemetry/index.js";
import type { NodeContractGateParams } from "./node-contract-gate.js";
import type { FreshnessGate } from "../harness/hooks.js";

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
  /** Validation context for `report_outcome.next_failure_hint`. */
  nextFailureHintValidation?: NextFailureHintValidation;
  /** Optional in-session node-contract recovery gate. */
  nodeContract?: NodeContractGateParams;
  /** Optional pre-`report_outcome` validation gate (P1.2). */
  precompletionGate?: PrecompletionGate;
  /** Optional pre-tool-call freshness gate (Phase 4). */
  freshnessGate?: FreshnessGate;
  /** Optional external cancellation signal (Temporal S3 Phase 5). */
  abortSignal?: AbortSignal;
}

export interface CopilotSessionResult {
  /** Captured error message if sendAndWait rejected. */
  sessionError?: string;
  /** Whether the error matches a non-retryable SDK / auth pattern. */
  fatalError: boolean;
  /** Outcome reported by the agent via the `report_outcome` SDK tool. */
  reportedOutcome?: ReportedOutcome;
}

/** Convenience alias — the concrete runner type used across the engine. */
export type ConcreteCopilotClient = CopilotClient;
