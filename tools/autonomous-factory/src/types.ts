/**
 * types.ts — Shared TypeScript interfaces for the orchestrator.
 *
 * These types mirror the runtime shapes produced by pipeline-state.mjs
 * and are used by state.ts, agents.ts, and watchdog.ts.
 */

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
    /** Stable fingerprint of the error (volatile tokens stripped, SHA-256 prefix).
     *  Enables cross-cycle identity tracking for death-spiral prevention. */
    errorSignature?: string | null;
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
// Triage v2 — 2-layer profile-based system (RAG → LLM).
// ---------------------------------------------------------------------------

/** Result of the 2-layer triage evaluation. */
export interface TriageResult {
  /** Routing domain (key from the triage profile's routing section). */
  domain: string;
  /** Human-readable explanation of the classification. */
  reason: string;
  /** Which layer produced the classification. */
  source: "rag" | "llm" | "fallback";
}

/**
 * Extract `diagnostic_trace` from a JSON error message, if present.
 * Used by the circuit breaker to normalize error comparisons.
 */
export function extractDiagnosticTrace(message: string): string | null {
  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed === "object" && typeof parsed.diagnostic_trace === "string") {
      return parsed.diagnostic_trace;
    }
  } catch { /* not JSON */ }
  return null;
}

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
