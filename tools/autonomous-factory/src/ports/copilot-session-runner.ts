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
import type { PipelineLogger } from "../telemetry/index.js";
import type { ReportedOutcome } from "../harness/outcome-tool.js";
import type { NextFailureHintValidation, PrecompletionGate } from "../harness/outcome-tool.js";
import type { NodeContractGateParams } from "../contracts/node-contract-gate.js";

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
  /** Validation context for `report_outcome.next_failure_hint`. Resolved
   *  per-invocation by the copilot-agent handler from the failing node's
   *  `on_failure.routes` keys + the compiled DAG node set. */
  nextFailureHintValidation?: NextFailureHintValidation;
  /** Optional in-session node-contract recovery gate. */
  nodeContract?: NodeContractGateParams;
  /** Optional pre-`report_outcome` validation gate (P1.2). */
  precompletionGate?: PrecompletionGate;
  /** Optional pre-tool-call freshness gate (Phase 4) — when supplied,
   *  the harness awaits `refresh(toolName)` before forwarding any tool
   *  whose name is in `tools`. Stack-agnostic; the engine never inspects
   *  the contents. */
  freshnessGate?: import("../harness/hooks.js").FreshnessGate;
  /**
   * Optional external cancellation signal (Temporal Session 3 Phase 5).
   *
   * Wired by `copilot-agent.activity.ts` so workflow-initiated activity
   * cancellation can disconnect the live SDK session. Without this hook
   * the runner's only cancellation paths are the cognitive circuit
   * breaker, the post-completion grace timer, and `params.timeout` —
   * none of which observe the activity context, so a cancelled
   * activity would otherwise hang until the SDK timeout (potentially
   * hours) and starve the worker slot.
   *
   * When the signal aborts, the adapter calls `session.disconnect()`
   * best-effort; the in-flight `sendAndWait` rejects, and the runner's
   * existing `catch` path classifies the error and returns
   * `sessionError` with the abort reason. Activity-side code surfaces
   * the result through the `COPILOT_AGENT_CANCELLED_PREFIX` race
   * (see `copilot-agent.activity.ts`) rather than relying on this
   * error path alone — the prefix race is more deterministic when the
   * SDK's reject message is opaque.
   */
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

export interface CopilotSessionRunner {
  run(
    client: CopilotClient,
    params: CopilotSessionParams,
  ): Promise<CopilotSessionResult>;
}
