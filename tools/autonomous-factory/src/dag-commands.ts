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

import type { TriageRecord } from "./types.js";

export type DagCommand =
  | ResetNodesCommand
  | SalvageDraftCommand
  | SetPendingContextCommand
  | SetTriageRecordCommand
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

/** Inject pre-built prompt context into a node's next attempt. */
export interface SetPendingContextCommand {
  readonly type: "set-pending-context";
  /** Target node key. */
  readonly itemKey: string;
  /** Context string to inject. */
  readonly context: string;
}

/** Persist a triage classification record for retrospective analysis. */
export interface SetTriageRecordCommand {
  readonly type: "set-triage-record";
  /** Full triage record to persist. */
  readonly record: TriageRecord;
}

/** Refresh the roam-code semantic graph index. */
export interface ReindexCommand {
  readonly type: "reindex";
  /** Only reindex if the target node's category is in this list.
   *  If omitted, always reindex. */
  readonly categories?: string[];
}
