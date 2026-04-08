/**
 * handlers/types.ts — NodeHandler plugin interface for the DAGent pipeline.
 *
 * Defines the contract between the orchestration kernel and handler
 * implementations. The kernel dispatches to handlers; handlers execute
 * feature logic and return results. Handlers are OBSERVERS — they never
 * mutate pipeline state (completeItem/failItem). The kernel is the sole
 * state mutator.
 *
 * Built-in handlers: copilot-agent, git-push, github-ci-poll, github-pr-publish
 * Custom handlers: local .ts files resolved via dynamic import (sandboxed to repo)
 */

import type { ApmCompiledOutput } from "../apm-types.js";
import type { PipelineState, ItemSummary } from "../types.js";

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
   * Example: git-push handler outputs `{ lastPushedSha: "abc123" }`, which
   * the kernel stores and passes to the downstream github-ci-poll handler.
   */
  readonly handlerData: Readonly<Record<string, unknown>>;
  /**
   * Throttled heartbeat callback — handlers should call this periodically
   * during long-running operations to update flight data for live monitoring.
   */
  readonly onHeartbeat: () => void;
  /**
   * Copilot SDK client instance. Typed as `unknown` to keep the handler
   * interface SDK-agnostic. The copilot-agent handler casts this internally.
   * Undefined for non-agent handlers.
   */
  readonly client?: unknown;
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
   */
  signal?: "halt" | "create-pr" | "salvage-draft";
  /**
   * Opaque output data for downstream handlers.
   * The kernel stores this in `handlerData` for subsequent handler invocations.
   * Example: `{ lastPushedSha: "abc123" }` from git-push handler.
   */
  handlerOutput?: Record<string, unknown>;
  /**
   * If true, the handler (or the agent running inside it) already managed
   * pipeline state transitions (completeItem/failItem). The kernel will
   * skip its own state mutation calls to avoid duplicates.
   * Used by copilot-agent handler where the SDK agent self-reports via tools.
   */
  stateManaged?: boolean;
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
// NodeHandler — the plugin interface
// ---------------------------------------------------------------------------

/**
 * Plugin interface for pipeline node execution.
 *
 * Built-in implementations: copilot-agent, git-push, github-ci-poll, github-pr-publish.
 * Custom implementations: local .ts files or npm packages (v2).
 *
 * Contract:
 * - `execute()` performs the handler's work and returns a result
 * - `shouldSkip()` optionally checks if the item can be skipped before execution
 * - Handlers are OBSERVERS: they must NOT call completeItem/failItem/resetForDev
 * - Handlers may call shell commands, read/write files, and interact with external APIs
 * - The kernel is the sole owner of pipeline state transitions
 */
export interface NodeHandler {
  /** Unique handler identifier (e.g. "copilot-agent", "git-push") */
  readonly name: string;

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
