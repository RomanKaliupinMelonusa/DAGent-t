/**
 * app-types.ts — App-wide cross-boundary type definitions.
 *
 * Houses all types that flow between the major orchestrator modules
 * (kernel, dispatch, handlers, loop). By centralizing these here we
 * avoid circular imports — every module imports from this file.
 *
 * Rule: Zero executable code. Pure type definitions only.
 */

import type { ApmCompiledOutput, ApmWorkflowNode } from "./apm/types.js";
import type { NextAction, ItemSummary } from "./types.js";
import type { PipelineLogger } from "./telemetry/index.js";

// ---------------------------------------------------------------------------
// Pipeline run — immutable config + mutable state
// ---------------------------------------------------------------------------

/** Immutable config for the pipeline run. Assembled once by bootstrap. */
export interface PipelineRunConfig {
  readonly slug: string;
  readonly workflowName: string;
  readonly appRoot: string;
  readonly repoRoot: string;
  readonly baseBranch: string;
  readonly apmContext: ApmCompiledOutput;
  readonly roamAvailable: boolean;
  readonly logger: PipelineLogger;
  /**
   * Absolute path to the user-supplied feature spec markdown. Forwarded
   * to local-exec handlers as the `SPEC_FILE` env var so scripts like
   * `stage-spec.sh` can copy it into `_kickoff/spec.md`.
   */
  readonly specFile: string;
  /**
   * Optional advisory markdown produced by the pinned-dependency preflight
   * (see `lifecycle/dependency-pinning.ts`). When present, the context
   * builder forwards it to the `AgentContext` of agents that consult the
   * vendored reference snapshot (storefront-dev, storefront-debug,
   * e2e-author) so their prompt templates can surface it as an "Upstream
   * API Drift Notice". Absent when no drift was detected or no snapshot
   * is configured.
   */
  readonly pwaKitDriftReport?: string;
}

/** All mutable state that persists across pipeline iterations. */
export interface PipelineRunState {
  /** Collected summaries across the whole pipeline run */
  pipelineSummaries: ItemSummary[];
  /** Track attempt number per item key across retries */
  attemptCounts: Record<string, number>;
  /** Track git commit SHA before each dev step for reliable change detection */
  preStepRefs: Record<string, string>;
  /**
   * Telemetry from a prior session's _SUMMARY.md, parsed once at boot time.
   * Guarantees monotonic metric accumulation across sessions — every flush
   * simply adds baseTelemetry to the current session's totals.
   */
  baseTelemetry: PreviousSummaryTotals | null;
  /**
   * Accumulated handler output from all preceding items in this pipeline run.
   * Keyed by item key. The kernel propagates the full bag into handlerData
   * so downstream handlers can access output from any upstream handler.
   * Also stores `lastPushedSha` for deploy nodes.
   */
  handlerOutputs: Record<string, HandlerOutputBag>;
  /** Per-item flag: whether force_run_if_changed dirs had changes. */
  forceRunChangesDetected: Record<string, boolean>;
}

/** Typed handler output bag — known keys + extensible index. */
export interface HandlerOutputBag {
  /** Git SHA captured after a push operation (consumed by deploy/CI-poll handlers). */
  lastPushedSha?: string;
  /** Git SHA captured after handler execution. */
  headAfterAttempt?: string;
  /** Extensible: handlers may emit arbitrary keys. */
  [key: string]: unknown;
}

/**
 * Totals from a previous pipeline run, loaded from _SUMMARY-DATA.json.
 * Used for monotonic metric accumulation across restarts.
 */
export interface PreviousSummaryTotals {
  steps: number;
  completed: number;
  failed: number;
  durationMs: number;
  filesChanged: number;
  tokens: number;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// SessionOutcome — discriminated union for dispatch results
// ---------------------------------------------------------------------------

/**
 * Discriminated union returned by `runItemSession()` and consumed by the
 * DAG loop in `watchdog.ts`. Replaces the old `SessionResult` flag bag.
 *
 * Each variant carries an `ItemSummary` for telemetry. The `kind` field
 * drives exhaustive `switch` handling in the main loop.
 */
export type SessionOutcome =
  | { readonly kind: "continue"; readonly summary: ItemSummary }
  | { readonly kind: "halt"; readonly summary: ItemSummary; readonly error?: string }
  | { readonly kind: "create-pr"; readonly summary: ItemSummary }
  | { readonly kind: "approval-pending"; readonly summary: ItemSummary; readonly gateKey: string }
  | { readonly kind: "triage"; readonly summary: ItemSummary; readonly activation: TriageActivation };

/**
 * @deprecated Use `SessionOutcome`. Kept during migration for backward compat
 * with tests that construct the old shape.
 */
export interface SessionResult {
  summary: ItemSummary;
  halt: boolean;
  createPr: boolean;
  approvalPending?: boolean;
  triageActivation?: TriageActivation;
}

// ---------------------------------------------------------------------------
// SchedulerResult — typed DAG scheduler return
// ---------------------------------------------------------------------------

/** An item available for execution (key is guaranteed non-null). */
export type AvailableItem = NextAction & { key: string };

/**
 * Discriminated union returned by `getNextBatch()`. Eliminates sentinel
 * detection (key === null) from the main loop.
 *
 * Variants optionally carry a `gateEffects` array: side-effect descriptors
 * the kernel emitted while computing readiness (e.g. a
 * `dispatch.gated_on_producer_cycle` telemetry event for every consumer
 * held back by the cycle-aware producer gate). The loop drains these
 * before executing any item-level dispatch; legacy callers that ignore
 * them still see correct behaviour — the effects are advisory telemetry.
 */
export type SchedulerResult =
  | { readonly kind: "items"; readonly items: AvailableItem[]; readonly gateEffects?: ReadonlyArray<import("./kernel/effects.js").Effect> }
  | { readonly kind: "complete"; readonly gateEffects?: ReadonlyArray<import("./kernel/effects.js").Effect> }
  | { readonly kind: "blocked"; readonly gateEffects?: ReadonlyArray<import("./kernel/effects.js").Effect> };

// ---------------------------------------------------------------------------
// BatchSignals — pure result of interpreting a batch of session outcomes
// ---------------------------------------------------------------------------

/** Signals extracted from a batch of session outcomes. Pure data, no side effects. */
export interface BatchSignals {
  readonly shouldHalt: boolean;
  readonly createPr: boolean;
  readonly approvalPendingKeys: readonly string[];
  readonly triageActivations: readonly TriageActivation[];
  /** Errors from rejected promises (unexpected crashes). */
  readonly unexpectedErrors: readonly Error[];
}

// ---------------------------------------------------------------------------
// TriageActivation — payload for triage dispatch
// ---------------------------------------------------------------------------

/**
 * Payload for activating a triage node via the standard dispatch pipeline.
 * Carries the failure context that the triage handler needs.
 */
export interface TriageActivation {
  /** Key of the triage node to dispatch. */
  triageNodeKey: string;
  /** Key of the node that failed. */
  failingKey: string;
  /** Raw error message from the failing node. */
  rawError: string;
  /** Stable error fingerprint (SHA-256 prefix). */
  errorSignature: string;
  /** Route map from the failing node's on_failure.routes. */
  failureRoutes: Record<string, string | null>;
  /** Summary snapshot of the failing node's last attempt. */
  failingNodeSummary: ItemSummary;
  /** Parsed structured failure shape, when the failing handler produced one
   *  (e.g. Playwright JSON reporter). Triage prefers this over `rawError`
   *  for classification. `unknown` keeps the kernel/loop layer agnostic to
   *  the triage package's concrete types; triage casts on consumption. */
  structuredFailure?: unknown;
}

// ---------------------------------------------------------------------------
// NodeBudgetPolicy — unified retry/cycle limits
// ---------------------------------------------------------------------------

/**
 * Resolved circuit breaker config with defaults based on node type/category.
 * @deprecated Use `NodeBudgetPolicy` — this is a subset kept for backward compat.
 */
export interface ResolvedCircuitBreaker {
  minAttemptsBeforeSkip: number;
  allowsRevertBypass: boolean;
  allowsTimeoutSalvage: boolean;
  haltOnIdentical: boolean;
  revertWarningAt: number;
}

/**
 * Unified budget policy for a single DAG node. Consolidates all retry/cycle
 * limits that were previously scattered across circuit_breaker, config.cycle_limits,
 * config.max_same_error_cycles, and the hardcoded failItem() cap.
 */
export interface NodeBudgetPolicy extends ResolvedCircuitBreaker {
  maxItemFailures: number;
  maxSameError: number;
  maxRerouteCycles: number;
  maxScriptCycles: number;
}
