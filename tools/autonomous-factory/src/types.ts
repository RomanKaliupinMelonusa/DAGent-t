/**
 * types.ts — Shared TypeScript interfaces for the orchestrator.
 *
 * These types mirror the runtime shapes produced by pipeline-state.mjs
 * and are used by state.ts, agents.ts, and watchdog.ts.
 */

import { z } from "zod";
import { TriageDiagnosticSchema } from "../triage-schema.mjs";

export { TriageDiagnosticSchema };

export interface PipelineItem {
  key: string;
  label: string;
  agent: string | null;
  phase: string;
  status: "pending" | "done" | "failed" | "na";
  error: string | null;
  docNote?: string | null;
}

export interface PipelineState {
  feature: string;
  workflowType: string;
  started: string;
  deployedUrl: string | null;
  implementationNotes: string | null;
  elevatedApply?: boolean;
  items: PipelineItem[];
  errorLog: Array<{
    timestamp: string;
    itemKey: string;
    message: string;
  }>;
  /** DAG dependency graph — persisted at init from workflows.yml */
  dependencies: Record<string, string[]>;
  /** Explicit ordered phase names — persisted at init from workflows.yml */
  phases: string[];
  /** Node execution types — persisted at init from workflows.yml */
  nodeTypes: Record<string, "agent" | "script" | "approval">;
  /** Node semantic categories — replaces DEV_ITEMS/TEST_ITEMS/POST_DEPLOY_ITEMS sets */
  nodeCategories: Record<string, "dev" | "test" | "deploy" | "finalize">;
  /** Item keys marked N/A due to workflow type (not salvage) — for resumeAfterElevated */
  naByType: string[];
}

export interface NextAction {
  key: string | null;
  label: string;
  agent: string | null;
  phase: string | null;
  status: string;
}

export interface FailResult {
  state: PipelineState;
  failCount: number;
  halted: boolean;
}

export interface ResetResult {
  state: PipelineState;
  cycleCount: number;
  halted: boolean;
}

export interface InitResult {
  state: PipelineState;
  statePath: string;
  transPath: string;
}

// ---------------------------------------------------------------------------
// Structured error triage — JSON contract between post-deploy agents and the
// watchdog's deterministic rerouting logic. The LLM classifies; the DAG routes.
//
// TriageDiagnosticSchema is the single source of truth (triage-schema.mjs).
// FaultDomain and TriageDiagnostic are derived from it via z.infer.
// ---------------------------------------------------------------------------

/** Fault domain that determines which dev items get reset on post-deploy failure. */
export type FaultDomain = TriageDiagnostic["fault_domain"];

/** Structured triage diagnostic — inferred from the Zod schema. */
export type TriageDiagnostic = z.infer<typeof TriageDiagnosticSchema>;

// ---------------------------------------------------------------------------
// Session telemetry — data structures collected by the orchestrator's
// session runner and consumed by reporting functions.
// ---------------------------------------------------------------------------

/** Summary of decisions collected from each item's session */
export interface ItemSummary {
  key: string;
  label: string;
  agent: string;
  phase: string;
  attempt: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: "completed" | "failed" | "error" | "in-progress";
  /** Agent-reported intents (high-level "what I'm doing" messages) */
  intents: string[];
  /** Final assistant messages (full text, not truncated) */
  messages: string[];
  /** Files read by the agent */
  filesRead: string[];
  /** Files written or edited by the agent */
  filesChanged: string[];
  /** Shell commands executed with exit context */
  shellCommands: ShellEntry[];
  /** Tool call counts by category */
  toolCounts: Record<string, number>;
  /** Error message if the step failed */
  errorMessage?: string;
  /** Git HEAD after this attempt — used for identical-error dedup */
  headAfterAttempt?: string;
  /** Accumulated input tokens from assistant.usage events */
  inputTokens: number;
  /** Accumulated output tokens from assistant.usage events */
  outputTokens: number;
  /** Accumulated cache-read tokens (prompt caching) */
  cacheReadTokens: number;
  /** Accumulated cache-creation tokens */
  cacheWriteTokens: number;
}

export interface ShellEntry {
  command: string;
  timestamp: string;
  /** Whether this was a pipeline:complete/fail or agent-commit call */
  isPipelineOp: boolean;
}

/** Detailed MCP tool telemetry log entry */
export interface McpToolLogEntry {
  timestamp: string;
  tool: string;
  /** MCP server name that owns this tool (e.g. "playwright") */
  server?: string;
  args?: Record<string, unknown>;
  success?: boolean;
  result?: string;
}

/** @deprecated Use McpToolLogEntry instead */
export type PlaywrightLogEntry = McpToolLogEntry;
