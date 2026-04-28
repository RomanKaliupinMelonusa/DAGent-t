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
  | BypassNodeCommand
  | SalvageDraftCommand
  | StageInvocationCommand
  | ReindexCommand
  | NoteTriageBlockedCommand;

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

/** Bypass a failing structural ancestor so a triage reroute can dispatch
 *  a downstream node that would otherwise be DAG-locked behind the
 *  failure. The kernel flips the target item's status from `failed` →
 *  `na` and stamps `bypassedFor: { routeTarget, cycleIndex }` on it.
 *  The marker is consumed by the seal hook (when the route target
 *  completes successfully) to emit `reset-nodes` with logKey
 *  `reset-after-fix`, which re-pendings the bypassed item so the gate
 *  is re-validated against the fix.
 *
 *  Idempotent: applying `bypass-node` to an already-bypassed item is a
 *  no-op. Salvaged items are rejected (sticky degradation wins). */
export interface BypassNodeCommand {
  readonly type: "bypass-node";
  /** Failing node to bypass (must be a structural ancestor of routeTarget). */
  readonly nodeKey: string;
  /** The triage reroute target this bypass is enabling. Persisted on the
   *  item as `bypassedFor.routeTarget` so the seal hook can locate it. */
  readonly routeTarget: string;
  /** Human-readable reason (tagged with domain/source for diagnostics). */
  readonly reason: string;
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

/** Refresh the semantic-graph code index. Implementation is provided
 *  by whatever `CodeIndexer` adapter the composition root selected. */
export interface ReindexCommand {
  readonly type: "reindex";
  /** Only reindex if the target node's category is in this list.
   *  If omitted, always reindex. */
  readonly categories?: string[];
}

/** A4 — record a $BLOCKED triage outcome on the errorLog so the
 *  blocked-verdict circuit breaker can count repeat blocks per failing
 *  item across the run. Reuses the existing `ErrorLogEntry` shape — the
 *  kernel reducer just appends one entry, no item mutation. The triage
 *  handler emits this alongside `salvage-draft` on every $BLOCKED
 *  outcome so a second block for the same failing item flips the run to
 *  halt instead of cascading another salvage. */
export interface NoteTriageBlockedCommand {
  readonly type: "note-triage-blocked";
  /** The failing node key whose triage resolved to $BLOCKED. */
  readonly failedItemKey: string;
  /** Classified fault domain. */
  readonly domain: string;
  /** Human-readable reason. */
  readonly reason: string;
  /** Optional structurally-stable signature of the underlying failure. */
  readonly errorSignature?: string | null;
}
