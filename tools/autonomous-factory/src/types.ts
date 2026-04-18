/**
 * types.ts — Shared TypeScript interfaces for the orchestrator.
 *
 * These types mirror the runtime shapes produced by the JsonFileStateStore
 * adapter (src/adapters/json-file-state-store.ts) and consumed by the
 * kernel, loop, and handlers.
 */

// ---------------------------------------------------------------------------
// Reset operation keys — shared protocol between the state adapter and kernel
// ---------------------------------------------------------------------------

/**
 * Synthetic `itemKey` values written to `errorLog` by the state machine's
 * reset functions. These are NOT real DAG node keys — they're operation
 * markers used for cycle counting and context injection.
 */
export const RESET_OPS = {
  /** resetNodes() for upstream dev redevelopment */
  RESET_FOR_DEV: "reset-for-dev",
  /** resetNodes() for triage reroute */
  RESET_FOR_REROUTE: "reset-for-reroute",
  /** Legacy error-log marker — kept for backward compat with old state files. */
  RESET_PHASES: "reset-phases",
} as const;

/** All reset-operation keys that indicate a redevelopment cycle */
export const REDEVELOPMENT_RESET_OPS = [
  RESET_OPS.RESET_FOR_DEV,
  RESET_OPS.RESET_FOR_REROUTE,
] as const;

export interface PipelineItem {
  key: string;
  label: string;
  agent: string | null;
  status: "pending" | "done" | "failed" | "na" | "dormant";
  error: string | null;
  docNote?: string | null;
  /** Structured handoff artifact (JSON string) for downstream agent contracts.
   *  Dev agents use this to communicate typed data (testid maps, affected routes,
   *  SSR-safety flags) to SDET and test runner agents. */
  handoffArtifact?: string | null;
  /** Pre-built prompt context written by the triage handler (or node wrapper)
   *  for injection into the next attempt of this item. Consumed and cleared
   *  by the node wrapper before handler execution. */
  pendingContext?: string | null;
}

// ---------------------------------------------------------------------------
// Execution Log — persisted per-invocation records for cross-attempt analysis
// ---------------------------------------------------------------------------

/**
 * Persisted record of a single handler invocation. Written by the kernel after
 * every handler execution. The triage handler and node wrapper query these
 * records to make failure-intelligence decisions (dedup, revert bypass, etc.).
 *
 * Unlike `errorLog` (which tracks state mutations) and `ItemSummary` (which is
 * in-memory per-session), the execution log survives orchestrator restarts and
 * provides full attempt history per node.
 */
export interface ExecutionRecord {
  /** Unique identifier for this execution (UUID v4). */
  executionId: string;
  /** DAG node key (e.g. "storefront-dev"). */
  nodeKey: string;
  /** 1-based attempt number within this pipeline run. */
  attempt: number;
  /** Handler outcome. */
  outcome: "completed" | "failed" | "error";
  /** Error message if outcome is not "completed". */
  errorMessage?: string;
  /** Stable error fingerprint (SHA-256 prefix of normalized trace). */
  errorSignature?: string;
  /** Git HEAD before handler execution. */
  headBefore?: string;
  /** Git HEAD after handler execution. */
  headAfter?: string;
  /** Files changed during this execution. */
  filesChanged: string[];
  /** Execution duration in milliseconds. */
  durationMs: number;
  /** ISO timestamp when execution started. */
  startedAt: string;
  /** ISO timestamp when execution finished. */
  finishedAt: string;
}

export interface PipelineState {
  feature: string;
  workflowName: string;
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
  /** Node execution types — open set; built-in: agent, script, approval, triage. */
  nodeTypes: Record<string, string>;
  /** Node semantic categories — open set; built-in: dev, test, deploy, finalize. */
  nodeCategories: Record<string, string>;
  /** Whether pipeline:fail messages must be valid TriageDiagnostic JSON — persisted at init from workflows.yml */
  jsonGated: Record<string, boolean>;
  /** Item keys marked N/A due to workflow type (not salvage) — for resumeAfterElevated */
  naByType: string[];
  /** Node keys that survive graceful degradation (salvageForDraft) — persisted at init from workflows.yml */
  salvageSurvivors: string[];
  /** Item keys initialized as dormant due to `activation: "triage-only"`. Parallels naByType. */
  dormantByActivation?: string[];
  /** Last triage record — persisted for downstream context injection. */
  lastTriageRecord?: TriageRecord | null;
  /** Persisted execution log — one record per handler invocation, survives restarts. */
  executionLog?: ExecutionRecord[];
}

/** Status values for pipeline items in the DAG scheduler. */
export type PipelineItemStatus = "pending" | "done" | "failed" | "na" | "dormant";

/** Scheduler-level status (superset: includes terminal sentinel values). */
export type SchedulerStatus = PipelineItemStatus | "complete" | "blocked";

export interface NextAction {
  key: string | null;
  label: string;
  agent: string | null;
  status: SchedulerStatus;
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
  /** Top RAG matches (up to 3), regardless of which layer won. */
  rag_matches?: Array<{ snippet: string; domain: string; reason: string; rank: number }>;
  /** LLM response latency in ms (only set when LLM layer was invoked). */
  llm_response_ms?: number;
}

/**
 * Full triage record assembled by the triage handler (handlers/triage.ts).
 * Captures everything about a failure classification for retrospective analysis.
 * Persisted to `_STATE.json.lastTriageRecord` and emitted as a `triage.evaluate` event.
 */
export interface TriageRecord {
  /** The DAG node that failed. */
  failing_item: string;
  /** Stable error fingerprint (SHA-256 prefix of normalized trace). */
  error_signature: string;

  /** Pre-guard result (set by triage handler, not evaluateTriage). */
  guard_result: "passed" | "timeout_bypass" | "unfixable_halt" | "death_spiral" | "retry_dedup";
  guard_detail?: string;

  /** RAG layer matches (up to 3, ranked by specificity). */
  rag_matches: Array<{ snippet: string; domain: string; reason: string; rank: number }>;
  /** The RAG snippet selected for routing (null if LLM or fallback won). */
  rag_selected: string | null;

  /** Whether the LLM layer was invoked. */
  llm_invoked: boolean;
  llm_domain?: string;
  llm_reason?: string;
  llm_response_ms?: number;

  /** Final classification. */
  domain: string;
  reason: string;
  source: "rag" | "llm" | "fallback";

  /** Routing decision (set by triage handler after evaluateTriage). */
  route_to: string;
  cascade: string[];
  cycle_count: number;
  domain_retry_count: number;
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
  /** Budget utilization snapshot — populated at session end by the copilot-agent handler. */
  budgetUtilization?: {
    toolCallsUsed: number;
    toolCallLimit: number;
    tokensConsumed: number;
    tokenBudget?: number;
  };
  /**
   * Outcome reported by the agent via the `report_outcome` SDK tool.
   * Last call wins. Read by `handlers/copilot-agent.ts` to translate
   * into a kernel Command (Phase A — kernel-sole-writer).
   * Undefined when the agent never called the tool.
   */
  reportedOutcome?: import("./harness/outcome-tool.js").ReportedOutcome;
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
