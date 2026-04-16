/**
 * types.ts — Shared TypeScript interfaces for the orchestrator.
 *
 * These types mirror the runtime shapes produced by pipeline-state.mjs
 * and are used by state.ts, agents.ts, and watchdog.ts.
 */

// ---------------------------------------------------------------------------
// Reset operation keys — shared protocol between pipeline-state.mjs and TS
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
  /** resetPhases() for full-phase redevelopment */
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
  phase: string;
  status: "pending" | "done" | "failed" | "na";
  error: string | null;
  docNote?: string | null;
  /** Structured handoff artifact (JSON string) for downstream agent contracts.
   *  Dev agents use this to communicate typed data (testid maps, affected routes,
   *  SSR-safety flags) to SDET and test runner agents. */
  handoffArtifact?: string | null;
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
  /** Human-readable labels for phase slugs (from config.phase_labels) */
  phaseLabels?: Record<string, string> | null;
  /** Node execution types — open set; built-in: agent, script, approval, barrier, triage. */
  nodeTypes: Record<string, string>;
  /** Node semantic categories — open set; built-in: dev, test, deploy, finalize. */
  nodeCategories: Record<string, string>;
  /** Whether pipeline:fail messages must be valid TriageDiagnostic JSON — persisted at init from workflows.yml */
  jsonGated: Record<string, boolean>;
  /** Item keys marked N/A due to workflow type (not salvage) — for resumeAfterElevated */
  naByType: string[];
  /** Node keys that survive graceful degradation (salvageForDraft) — persisted at init from workflows.yml */
  salvageSurvivors: string[];
  /** Last triage record — persisted for downstream context injection. */
  lastTriageRecord?: TriageRecord | null;
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
  guard_result: "passed" | "timeout_bypass" | "unfixable_halt" | "death_spiral";
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
