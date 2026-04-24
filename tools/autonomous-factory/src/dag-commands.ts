/**
 * dag-commands.ts — Handler → kernel graph-mutation protocol.
 *
 * Discriminated union of graph-mutation commands that any handler can
 * return. The kernel's dispatch layer is the sole authority that
 * translates these into state API calls.
 *
 * This module is intentionally neutral — it lives outside handlers/ and
 * kernel/ so both layers can import it without creating a forbidden
 * handlers ↔ kernel cycle.
 *
 * Any handler type (triage, agent, script, custom) can emit any command.
 * New command types can be added here without touching handlers.
 */

import type { InvocationTrigger } from "./types.js";

export type DagCommand =
  | ResetNodesCommand
  | SalvageDraftCommand
  | StageInvocationCommand
  | ReindexCommand;

/** Reset a node + all transitive downstream dependents to pending. */
export interface ResetNodesCommand {
  readonly type: "reset-nodes";
  /** Entry-point node key for DAG cascade. */
  readonly seedKey: string;
  /** Human-readable reason (tagged with domain/source for diagnostics). */
  readonly reason: string;
  /** Cycle-budget counter key in errorLog. Default: "reset-nodes". */
  readonly logKey?: string;
  /** Max reset cycles before halt. Resolved from triage profile if omitted. */
  readonly maxCycles?: number;
}

/** Graceful degradation — skip remaining nodes, jump to Draft PR. */
export interface SalvageDraftCommand {
  readonly type: "salvage-draft";
  /** The node that triggered the block. */
  readonly failedItemKey: string;
  /** Human-readable reason for salvage. */
  readonly reason: string;
}

/** Stage an unsealed `InvocationRecord` for a node's next dispatch.
 *  Replaces the older `set-pending-context` flow: instead of decorating
 *  `PipelineItem.pendingContext` (Phase 6 — since removed), the kernel
 *  appends an unsealed
 *  invocation to `state.artifacts` carrying the parent invocation pointer
 *  and the trigger reason. The dispatcher picks up the staged record on
 *  the next dispatch via `item.latestInvocationId` and stamps `startedAt`
 *  when the handler begins (no second append).
 *
 *  Phase 6 — re-entrance prose no longer rides on the staged record.
 *  Re-entrance context flows through file-only artifacts (e.g. the
 *  `triage-handoff` JSON declared via `consumes_reroute`), which the
 *  dispatch input-materialization middleware copies into
 *  `<inv>/inputs/` before the handler runs. */
export interface StageInvocationCommand {
  readonly type: "stage-invocation";
  /** Target node key whose next dispatch should consume this record. */
  readonly itemKey: string;
  /** Pre-allocated invocation id for the staged record. Will become the
   *  next dispatch's `executionId`. */
  readonly invocationId: string;
  /** Triage (or other producer) invocation that emitted this stage. Lets
   *  the lineage chain stay traversable from the staged record. */
  readonly parentInvocationId?: string;
  /** Why the next dispatch is happening. */
  readonly trigger: InvocationTrigger;
  /** Human-oriented producer label (e.g. "triage-storefront#inv_…"). */
  readonly producedBy?: string;
}

/** Refresh the roam-code semantic graph index. */
export interface ReindexCommand {
  readonly type: "reindex";
  /** Only reindex if the target node's category is in this list.
   *  If omitted, always reindex. */
  readonly categories?: string[];
}
