/**
 * src/activities/types.ts — Activity wire types.
 *
 * These types cross the Temporal activity boundary (worker ↔ workflow)
 * and MUST be JSON-serializable. Ports, adapters, classes with methods,
 * loggers, and any non-plain object are forbidden as fields. Activities
 * reconstruct heavyweight runtime objects (`Shell`, `VersionControl`,
 * `ArtifactBus`, `InvocationLogger`, `PipelineLogger`, …) from this
 * input via `support/build-context.ts`.
 *
 * Decision D-S3-1 (Session 3 plan): activities self-construct ports.
 * Decision D-S3-3:                   `signal: "approval-pending"` is
 *                                    deliberately absent — replaced by
 *                                    workflow-side `awaitApproval()`.
 *
 * The `apmContext` is large (often >1MB once compiled). To stay below
 * Temporal's default ~2MB payload limit (R3), the workflow passes a
 * filesystem path; the activity loads the compiled context from disk.
 */

import type { ItemSummary, PipelineState, ArtifactRefSerialized, InvocationRecord } from "../types.js";

/**
 * Input handed to every node-execution activity. Mirrors the legacy
 * `NodeContext` (handlers/types.ts) but stripped of all non-serializable
 * fields. The activity rebuilds the full `NodeContext` internally.
 */
export interface NodeActivityInput {
  /** Pipeline item key (e.g. "backend-dev", "push-app"). */
  readonly itemKey: string;
  /** Unique UUID v4 for this dispatch. Becomes the invocation id. */
  readonly executionId: string;
  /** Feature slug. */
  readonly slug: string;
  /** Absolute path to the app directory (contains `.apm/`). */
  readonly appRoot: string;
  /** Absolute path to the repository root. */
  readonly repoRoot: string;
  /** Target branch for PRs. */
  readonly baseBranch: string;
  /** Absolute path to the user-supplied feature spec markdown. */
  readonly specFile: string;
  /** Current in-memory attempt number (1-based). */
  readonly attempt: number;
  /** Combined in-memory + persisted redevelopment cycle count. */
  readonly effectiveAttempts: number;
  /** Resolved environment from `apm.yml` `config.environment`. */
  readonly environment: Record<string, string>;
  /** Absolute path to the compiled APM context JSON on disk. */
  readonly apmContextPath: string;
  /** Workflow name (key in `apmContext.workflows`). */
  readonly workflowName: string;
  /**
   * Pipeline state snapshot at dispatch time. JSON-cloned by Temporal.
   * The activity treats this as read-only.
   */
  readonly pipelineState: PipelineState;
  /** Pre-stamped invocation record for this dispatch (when one exists). */
  readonly currentInvocation?: InvocationRecord;
  /** Most recent failed attempt summary, if any. */
  readonly previousAttempt?: ItemSummary;
  /** Downstream failure summaries for redevelopment context. */
  readonly downstreamFailures?: ReadonlyArray<ItemSummary>;
  /** All summaries so far. */
  readonly pipelineSummaries: ReadonlyArray<ItemSummary>;
  /** Whether `force_run_if_changed` directories had changes. */
  readonly forceRunChanges?: boolean;
  /** Per-item base refs captured by the kernel. */
  readonly preStepRefs: Readonly<Record<string, string>>;
  /** Opaque downstream-input bag (e.g. `{ "push-app:lastPushedSha": "abc" }`). */
  readonly handlerData: Readonly<Record<string, unknown>>;

  // ── Failure context (populated for triage / on-failure dispatches) ──
  readonly failingNodeKey?: string;
  readonly failingInvocationId?: string;
  readonly rawError?: string;
  readonly errorSignature?: string;
  readonly failingNodeSummary?: ItemSummary;
  readonly failureRoutes?: Readonly<Record<string, string | null>>;
  /** Parsed structured failure (Playwright JSON, etc). `unknown` until triage narrows. */
  readonly structuredFailure?: unknown;
  /** Optional advisory drift report (Session C). */
  readonly pwaKitDriftReport?: string;
}

/**
 * Activity result — JSON-serializable projection of the legacy
 * `NodeResult`. Workflow code (Session 4) translates this back into
 * `DagState` reducer calls.
 *
 * The legacy `signal: "approval-pending"` is intentionally absent. Approval
 * gates are replaced by the workflow-side signal/condition pattern (see
 * `src/workflow/approval-pattern.ts`, Session 3 Phase 3).
 */
export interface NodeActivityResult {
  readonly outcome: "completed" | "failed" | "error";
  readonly errorMessage?: string;
  readonly errorSignature?: string;
  readonly summary: Partial<ItemSummary>;
  readonly signal?: "halt" | "create-pr" | "salvage-draft";
  readonly signals?: Record<string, boolean>;
  readonly handlerOutput?: Record<string, unknown>;
  readonly producedArtifacts?: ArtifactRefSerialized[];
  readonly diagnosticTrace?: string;
  /**
   * Declarative graph-mutation commands produced by the handler
   * (currently only the triage handler emits these — `RESET_OPS`,
   * `salvageForDraft`, etc.). The workflow body in Session 4 is the
   * sole authority that translates these into `DagState` reducer
   * calls. Wire shape is identical to the legacy `NodeResult.commands`
   * — `DagCommand` is already a plain JSON discriminated union, no
   * projection needed.
   */
  readonly commands?: ReadonlyArray<unknown>;
}
