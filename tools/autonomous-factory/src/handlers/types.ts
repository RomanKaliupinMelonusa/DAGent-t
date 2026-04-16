/**
 * handlers/types.ts — NodeHandler plugin interface for the DAGent pipeline.
 *
 * Defines the contract between the orchestration kernel and handler
 * implementations. The kernel dispatches to handlers; handlers execute
 * feature logic and return results.
 *
 * State ownership model:
 * - Handlers are OBSERVERS — they must NOT call completeItem/failItem.
 *   The kernel is the sole state mutator.
 * - For copilot-agent sessions where the SDK agent calls pipeline:complete/fail
 *   during the session, the kernel's idempotent state transitions handle this
 *   gracefully (no double writes).
 *
 * Built-in handlers: copilot-agent, github-ci-poll, local-exec, triage
 * Custom handlers: local .ts files resolved via dynamic import (sandboxed to repo)
 */

import type { ApmCompiledOutput } from "../apm-types.js";
import type { PipelineState, ItemSummary } from "../types.js";
import type { PipelineLogger } from "../logger.js";
import type { CopilotClient } from "@github/copilot-sdk";

// ---------------------------------------------------------------------------
// NodeContext — input to every handler
// ---------------------------------------------------------------------------

/**
 * Immutable context passed to every handler invocation.
 * The kernel assembles this from pipeline state, APM config, and prior results.
 */
export interface NodeContext {
  /** Pipeline item key (e.g. "backend-dev", "push-app") */
  readonly itemKey: string;
  /** Feature slug */
  readonly slug: string;
  /** Absolute path to the app directory (contains .apm/) */
  readonly appRoot: string;
  /** Absolute path to the repository root */
  readonly repoRoot: string;
  /** Target branch for PRs (e.g. "main") */
  readonly baseBranch: string;
  /** Current in-memory attempt number (1-based) */
  readonly attempt: number;
  /** Combined in-memory + persisted redevelopment cycle count */
  readonly effectiveAttempts: number;
  /** Environment variables from apm.yml config.environment (resolved) */
  readonly environment: Record<string, string>;
  /** Full APM compiled output (read-only) — agents, workflows, config */
  readonly apmContext: ApmCompiledOutput;
  /** Pipeline state snapshot at dispatch time (read-only) */
  readonly pipelineState: Readonly<PipelineState>;
  /** Summary from the most recent failed attempt for this item, if any */
  readonly previousAttempt?: Readonly<ItemSummary>;
  /** Summaries from downstream items that failed (for redevelopment context) */
  readonly downstreamFailures?: ReadonlyArray<Readonly<ItemSummary>>;
  /** All pipeline summaries so far (read-only). Used by agents for context
   *  injection (change manifests, downstream failure context, heartbeats). */
  readonly pipelineSummaries: ReadonlyArray<Readonly<ItemSummary>>;
  /** True when force_run_if_changed directories had changes (auto-skip override) */
  readonly forceRunChanges?: boolean;
  /**
   * Opaque data bag populated by the kernel from previous handlers' output.
   * Example: kernel auto-captures `{ lastPushedSha: "abc123" }` for deploy nodes,
   * the kernel stores and passes to the downstream github-ci-poll handler.
   */
  readonly handlerData: Readonly<Record<string, unknown>>;
  /**
   * Throttled heartbeat callback — handlers should call this periodically
   * during long-running operations to update flight data for live monitoring.
   */
  readonly onHeartbeat: () => void;
  /**
   * Copilot SDK client instance for LLM-powered handlers.
   * Undefined for non-agent handlers (local-exec, barrier, approval, etc.).
   * Agent handlers use this to create sessions and run LLM interactions.
   */
  readonly client?: CopilotClient;
  /** Pipeline event logger — single entry point for all telemetry. */
  readonly logger: PipelineLogger;

  // ── Failure context (populated when dispatched via on_failure edge) ──

  /** Key of the node that failed and triggered this dispatch (on_failure only). */
  readonly failingNodeKey?: string;
  /** Raw error message from the failing node (on_failure only). */
  readonly rawError?: string;
  /** Computed error signature from the failing node (on_failure only). */
  readonly errorSignature?: string;
  /** Summary snapshot of the failing node's last attempt (on_failure only). */
  readonly failingNodeSummary?: Readonly<ItemSummary>;
}

// ---------------------------------------------------------------------------
// NodeResult — output from every handler
// ---------------------------------------------------------------------------

/**
 * Result returned by a handler after execution.
 * The kernel uses this to update pipeline state, route triage, and flush reports.
 * Handlers MUST NOT call completeItem/failItem — that is the kernel's job.
 */
export interface NodeResult {
  /** Execution outcome — the kernel maps this to pipeline state transitions */
  outcome: "completed" | "failed" | "error";
  /** Human-readable error message (required when outcome is "failed" or "error") */
  errorMessage?: string;
  /** Partial telemetry summary — kernel merges with timing/attempt metadata */
  summary: Partial<ItemSummary>;
  /**
   * Rare control signal to the kernel:
   * - "halt": stop the pipeline immediately (fatal error)
   * - "create-pr": trigger archive + PR publish (used by publish handler)
   * - "salvage-draft": degrade to Draft PR (unfixable error)
   * - "approval-pending": item awaits external approval (watchdog pauses)
   */
  signal?: "halt" | "create-pr" | "salvage-draft" | "approval-pending";
  /**
   * Opaque output data for downstream handlers.
   * The kernel stores this in `handlerData` for subsequent handler invocations.
   * Example: `{ lastPushedSha: "abc123" }` auto-captured by kernel for deploy nodes.
   */
  handlerOutput?: Record<string, unknown>;
  /**
   * Extracted diagnostic trace from a structured TriageDiagnostic JSON failure.
   * Populated by the copilot-agent handler when the agent's failure message
   * is valid TriageDiagnostic JSON.
   */
  diagnosticTrace?: string;
}

// ---------------------------------------------------------------------------
// SkipResult — structured auto-skip response
// ---------------------------------------------------------------------------

/**
 * Returned by `handler.shouldSkip()` when the handler determines the item
 * can be skipped. The kernel uses the reason for summary reporting and
 * the optional filesChanged for attribution even on skipped items.
 */
export interface SkipResult {
  /** Human-readable reason the item was skipped (logged in summary) */
  reason: string;
  /** Files that changed during skip evaluation (e.g. sentinel files touched) */
  filesChanged?: string[];
}

// ---------------------------------------------------------------------------
// HandlerMetadata — optional self-describing contract for handlers
// ---------------------------------------------------------------------------

/**
 * Optional metadata a handler can declare to describe its data contracts.
 * The kernel uses this for:
 * - Pre-dispatch validation: warn/fail if required inputs are missing from handlerData
 * - Documentation: auto-generate pipeline data-flow diagrams
 * - Handoff tracing: log which handler produced/consumed which keys
 *
 * All fields are optional — handlers without metadata work exactly as before.
 */
export interface HandlerMetadata {
  /** Human-readable description of what this handler does. */
  description?: string;

  /**
   * Keys this handler expects to find in `ctx.handlerData`.
   * Each entry maps a key name to its requirement level.
   * - "required": kernel warns/fails if key is missing at dispatch time
   * - "optional": handler gracefully handles absence
   *
   * Example: `{ "lastPushedSha": "required", "planOutput": "optional" }`
   */
  inputs?: Record<string, "required" | "optional">;

  /**
   * Keys this handler may produce in `result.handlerOutput`.
   * Purely declarative — used for documentation, tracing, and
   * downstream validation (does the consumer's input exist in any upstream's outputs?).
   *
   * Example: `["lastPushedSha", "ciRunId"]`
   */
  outputs?: string[];
}

// ---------------------------------------------------------------------------
// NodeHandler — the plugin interface
// ---------------------------------------------------------------------------

/**
 * Plugin interface for pipeline node execution.
 *
 * Built-in implementations: copilot-agent, github-ci-poll, local-exec.
 * Custom implementations: local .ts files or npm packages (v2).
 *
 * Contract:
 * - `execute()` performs the handler's work and returns a result
 * - `shouldSkip()` optionally checks if the item can be skipped before execution
 * - Handlers are OBSERVERS: they must NOT call completeItem/failItem
 * - Handlers may call shell commands, read/write files, and interact with external APIs
 * - The kernel is the sole owner of pipeline state transitions
 */
export interface NodeHandler {
  /** Unique handler identifier (e.g. "copilot-agent", "local-exec") */
  readonly name: string;

  /**
   * Optional self-describing metadata. When present, the kernel validates
   * input contracts before dispatch and traces output keys in the event log.
   * Handlers without metadata are fully backward compatible.
   */
  readonly metadata?: HandlerMetadata;

  /**
   * Execute the handler's main logic.
   * @param ctx - Immutable context assembled by the kernel
   * @returns Result describing outcome, telemetry, and optional control signals
   */
  execute(ctx: NodeContext): Promise<NodeResult>;

  /**
   * Optional pre-execution check. If the item should be skipped (e.g. no
   * relevant file changes), return a structured SkipResult. Return null to
   * proceed with execution.
   *
   * @param ctx - Immutable context assembled by the kernel
   * @returns SkipResult if item should be skipped, null otherwise
   */
  shouldSkip?(ctx: NodeContext): Promise<SkipResult | null>;
}
