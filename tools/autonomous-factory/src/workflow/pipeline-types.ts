/**
 * src/workflow/pipeline-types.ts — Shared workflow input/output wire types.
 *
 * Extracted from `pipeline.workflow.ts` so sibling modules
 * (`batch-dispatcher.ts`, `signal-wiring.ts`,
 * `continue-as-new-controller.ts`, `triage-driver.ts`) can import these
 * shapes without circular references through the workflow body.
 *
 * Workflow scope contract: pure type declarations only — no runtime
 * imports beyond other workflow-safe types.
 */

import type { DagSnapshot } from "./dag-state.js";
import type { DispatchableNode } from "./dispatch-node.js";
import type { StateSnapshot } from "./queries.js";

/**
 * Per-node compiled metadata the workflow body consults for dispatch.
 * Superset of `DispatchableNode` and `CompiledNode` (from init-state.ts).
 * The pre-workflow client step (Group I) builds this from the compiled
 * APM context.
 */
export interface PipelineNodeSpec extends DispatchableNode {
  readonly agent?: string | null;
  readonly type?: string;
  readonly category?: string;
  readonly depends_on?: ReadonlyArray<string>;
  readonly activation?: string;
  readonly salvage_survivor?: boolean;
  readonly salvage_immune?: boolean;
  readonly triggers?: ReadonlyArray<"schedule" | "route">;
  readonly consumes_artifacts?: ReadonlyArray<{
    readonly from: string;
    readonly kind: string;
    readonly required?: boolean;
  }>;
  /** Triage-routing fields consumed by the workflow-scope cascade
   *  (`triage-cascade.ts`). The workflow body forwards these into
   *  `RoutableWorkflow` for `resolveTriageDispatch`. */
  readonly on_failure?:
    | string
    | { triage?: string; routes?: Record<string, string | null> };
  readonly triage?: string;
  readonly triage_profile?: string;
}

/**
 * Workflow input. Compiled client-side once, then frozen for the
 * lifetime of the workflow. Path-style fields (apmContextPath, specFile)
 * are passed through to activities verbatim — activities load on-disk
 * payloads themselves (per S3 D-S3-1).
 */
export interface PipelineInput {
  readonly slug: string;
  readonly workflowName: string;
  readonly appRoot: string;
  readonly repoRoot: string;
  readonly baseBranch: string;
  readonly specFile: string;
  readonly apmContextPath: string;
  /** Resolved environment from compiled apm.yml. */
  readonly environment: Readonly<Record<string, string>>;
  /** Compiled node map. */
  readonly nodes: Readonly<Record<string, PipelineNodeSpec>>;
  /** Workflow-level default triage node key (used when a failing node
   *  has no explicit `on_failure.triage`). */
  readonly default_triage?: string;
  /** Workflow-level default failure routes. */
  readonly default_routes?: Readonly<Record<string, string | null>>;
  /** Workflow start time (ms since epoch). Captured at client side and
   *  passed in so the workflow's `started` ISO is stable. */
  readonly startedMs: number;
  /**
   * Session 5 P2 — when present, the workflow rehydrates from this
   * `DagState.snapshot()` payload instead of `fromInit`. Set by
   * continueAsNew to carry full dynamic state (held / cancelled /
   * approvals / cycleCounters / batchNumber) across incarnations.
   * Production clients leave this undefined.
   */
  readonly priorSnapshot?: DagSnapshot;
  /**
   * Per-itemKey attempt counter at the moment continueAsNew fired.
   * Carried so the new incarnation's `attempt = (counts.get(k) ?? 0) + 1`
   * arithmetic stays monotonic across incarnations.
   */
  readonly priorAttemptCounts?: Readonly<Record<string, number>>;
  /**
   * Override for the history-length threshold that triggers
   * continueAsNew. Default 8000. Tests use a tiny number to exercise
   * the path without growing the history; production leaves it
   * undefined.
   */
  readonly continueAsNewHistoryThreshold?: number;
  /**
   * Absolute per-node attempt ceiling enforced by the workflow body
   * itself, independent of per-node `circuit_breaker`. When
   * `attemptCounts.get(itemKey) > absoluteAttemptCeiling`, the workflow
   * halts with a synthetic terminal failure regardless of triage
   * routing. Default 5. See P1 of the halt-discipline hardening (postmortem
   * /memories/repo/dagent-runaway-retry-postmortem.md).
   */
  readonly absoluteAttemptCeiling?: number;
}

export type PipelineFinalStatus =
  | "complete"
  | "halted"
  | "blocked"
  | "cancelled"
  | "approval-rejected"
  | "failed";

export interface PipelineResult {
  readonly status: PipelineFinalStatus;
  readonly reason: string;
  readonly batchNumber: number;
  /** Final DAG snapshot — the post-workflow client step renders
   *  `_TRANS.md` from this. */
  readonly finalSnapshot: StateSnapshot;
}
