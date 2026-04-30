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
