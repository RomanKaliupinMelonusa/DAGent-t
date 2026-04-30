/**
 * src/temporal/workflow/queries.ts — Workflow query definitions.
 *
 * Queries surface in-flight workflow state to external observers (the
 * CLI, ChatOps, the dashboard in Session 7) without mutating it.
 *
 * The legacy equivalent is `npm run pipeline:status` reading the
 * persisted `_STATE.json`. Under Temporal, state lives in the workflow
 * itself; queries are how the outside world reads it.
 *
 * `pendingApprovalsQuery` returns the list of gate keys that the
 * workflow body has called `awaitApproval(gateKey)` for and is
 * currently blocked on. The workflow body MUST install the query
 * handler via `setHandler(pendingApprovalsQuery, registry.snapshot)` —
 * see [approval-pattern.ts](./approval-pattern.ts) for the canonical
 * wiring.
 */

import { defineQuery } from "@temporalio/workflow";

export interface PendingApproval {
  /** Workflow node key that gated. */
  readonly gateKey: string;
  /** Monotonic registration ordinal — increments per `awaitApproval`
   *  call inside a single workflow execution. Stable across replays
   *  because the registry is driven by deterministic workflow events.
   *  Wall-clock timestamps are intentionally absent here: capturing
   *  them would force a `Date`/`workflowInfo()` round-trip per
   *  registration and offers no extra ordering signal that the SDK's
   *  history doesn't already provide. */
  readonly registeredSeq: number;
}

/** All gate keys that the workflow is currently blocked on. */
export const pendingApprovalsQuery = defineQuery<readonly PendingApproval[]>(
  "pendingApprovals",
);

/**
 * Per-item progress projection — minimal shape for the admin CLI
 * `pipeline:status:temporal` and `pipeline:next:temporal` verbs. Reads
 * directly from `DagState.snapshot()`; no separate engine projection.
 */
export interface ItemProgress {
  readonly key: string;
  readonly label: string;
  readonly agent: string | null;
  readonly status: "pending" | "in-progress" | "done" | "failed" | "na" | "dormant";
}

/** Full DAG state snapshot (suitable for `_TRANS.md` rendering). */
export interface StateSnapshot {
  readonly feature: string;
  readonly workflowName: string;
  readonly started: string;
  readonly items: readonly ItemProgress[];
  readonly errorLog: ReadonlyArray<{
    readonly itemKey: string;
    readonly message: string;
    readonly timestamp: string;
  }>;
  readonly held: boolean;
  readonly cancelled: boolean;
  readonly cancelReason: string | null;
}

export const stateQuery = defineQuery<StateSnapshot>("state");

/** Aggregate progress for the dashboard / CLI status banner. */
export interface ProgressSnapshot {
  readonly total: number;
  readonly done: number;
  readonly pending: number;
  readonly inProgress: number;
  readonly failed: number;
  readonly na: number;
  readonly dormant: number;
  readonly held: boolean;
  readonly cancelled: boolean;
}

export const progressQuery = defineQuery<ProgressSnapshot>("progress");

/** Items the scheduler considers ready right now (next batch). */
export interface NextBatchItem {
  readonly key: string;
  readonly label: string;
  readonly agent: string | null;
}

export const nextBatchQuery = defineQuery<readonly NextBatchItem[]>("nextBatch");

/** One-line operational summary suitable for stdout / dashboards. */
export interface SummarySnapshot {
  readonly slug: string;
  readonly workflowName: string;
  readonly started: string;
  readonly status: "running" | "held" | "cancelled" | "complete" | "halted" | "blocked";
  readonly batchNumber: number;
  readonly totals: ProgressSnapshot;
  readonly pendingApprovals: number;
  readonly lastError: string | null;
}

export const summaryQuery = defineQuery<SummarySnapshot>("summary");
