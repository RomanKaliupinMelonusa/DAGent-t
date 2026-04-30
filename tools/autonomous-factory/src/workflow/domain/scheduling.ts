/**
 * domain/scheduling.ts — Pure DAG scheduling logic.
 *
 * Determines which pipeline items are ready for execution based on
 * dependency resolution. Pure function — no I/O, no state file access.
 */

import type { DependencyGraph } from "./dag-graph.js";

/** Minimal item shape needed for scheduling decisions. */
export interface SchedulableItem {
  readonly key: string;
  readonly label: string;
  readonly agent: string | null;
  readonly status: "pending" | "done" | "failed" | "na" | "dormant";
}

/** Minimal artifact-consumption edge needed for the producer-cycle gate. */
export interface ConsumesEdge {
  /** Upstream producer node key. */
  readonly from: string;
  /** Whether the consumer hard-requires this artifact. */
  readonly required: boolean;
}

/** Summary of a producer's most recent invocation, keyed by nodeKey. */
export interface ProducerCycleSummary {
  /** 1-based cycleIndex of the latest invocation (or 0 if unknown). */
  readonly cycleIndex: number;
  /** Outcome of the latest invocation; `undefined` ⇒ in-flight (not sealed). */
  readonly outcome?: "completed" | "failed" | "error";
}

/** Optional producer-cycle gate inputs. Both fields are optional —
 *  omitting them preserves the legacy edge-only readiness behaviour. */
export interface ScheduleOptions {
  /** Per-consumer upstream artifact edges (projected from NodeIOContract.consumes.upstream). */
  readonly consumesByNode?: ReadonlyMap<string, ReadonlyArray<ConsumesEdge>>;
  /** Latest producer invocation summary, keyed by producer nodeKey. */
  readonly latestProducerOutcome?: ReadonlyMap<string, ProducerCycleSummary>;
}

/** Gate diagnosis for a single consumer item. */
export interface GateDiagnosis {
  /** All upstream artifact edges that are currently blocking. */
  readonly gatedOn: ReadonlyArray<{
    readonly from: string;
    readonly latestCycleIndex: number | null;
    readonly outcome: ProducerCycleSummary["outcome"] | null;
  }>;
}

/** Result of scheduling: ready items, or a terminal signal. */
export type ScheduleResult =
  | { readonly kind: "items"; readonly items: ReadonlyArray<SchedulableItem> }
  | { readonly kind: "complete" }
  | { readonly kind: "blocked" };

/**
 * Compute all currently dispatchable items from the DAG.
 *
 * An item is dispatchable if:
 * - Its status is "pending" or "failed"
 * - All of its structural dependencies have status "done" or "na"
 * - (When `opts.consumesByNode` is supplied) for every declared
 *   `consumes_artifacts` edge the latest invocation of the producer
 *   has `outcome === "completed"`. Producers with status `na`/`dormant`
 *   short-circuit the wait (salvage / triage-only). A producer whose
 *   status is `done` but has no invocation record (legacy / pre-Phase-2
 *   state files) also short-circuits — the status check is authoritative
 *   when no artifact ledger entry exists.
 *
 * Returns "complete" if all items are done/na/dormant.
 * Returns "blocked" if pending items exist but none are dispatchable.
 */
export function schedule(
  items: readonly SchedulableItem[],
  dependencies: DependencyGraph,
  opts?: ScheduleOptions,
): ScheduleResult {
  const statusMap = new Map(items.map((i) => [i.key, i.status]));
  const available: SchedulableItem[] = [];

  for (const item of items) {
    if (item.status !== "pending" && item.status !== "failed") continue;

    const deps = dependencies[item.key] ?? [];
    const depsResolved = deps.every((depKey) => {
      const depStatus = statusMap.get(depKey);
      return depStatus === "done" || depStatus === "na";
    });
    if (!depsResolved) continue;

    // Cycle-aware producer-readiness gate. Only active when the caller
    // passes `consumesByNode`; otherwise preserve the original behaviour.
    if (!isProducerCycleReady(item.key, statusMap, opts).ready) continue;

    available.push(item);
  }

  if (available.length === 0) {
    const allDone = items.every(
      (i) => i.status === "done" || i.status === "na" || i.status === "dormant",
    );
    return allDone ? { kind: "complete" } : { kind: "blocked" };
  }

  return { kind: "items", items: available };
}

/**
 * Decide whether every producer this item depends on has its latest
 * invocation sealed as completed. Pure — no state file access.
 *
 * Exported for diagnostics (e.g. the kernel's telemetry emission path
 * and the admin CLI) so callers can attribute "why is this blocked?"
 * without duplicating the predicate.
 */
export function isProducerCycleReady(
  itemKey: string,
  statusByKey: ReadonlyMap<string, SchedulableItem["status"]>,
  opts?: ScheduleOptions,
): { ready: boolean; gatedOn: GateDiagnosis["gatedOn"] } {
  const consumesByNode = opts?.consumesByNode;
  const latestProducerOutcome = opts?.latestProducerOutcome;
  const edges = consumesByNode?.get(itemKey);
  if (!edges || edges.length === 0) return { ready: true, gatedOn: [] };

  const gatedOn: Array<GateDiagnosis["gatedOn"][number]> = [];
  for (const edge of edges) {
    const producerStatus = statusByKey.get(edge.from);
    // Salvaged / triage-only producers: never gate the consumer.
    if (producerStatus === "na" || producerStatus === "dormant") continue;

    const summary = latestProducerOutcome?.get(edge.from);
    if (!summary) {
      // No invocation ledger record. If the producer is `done` (a legacy
      // or pre-artifact-bus run) or `failed`, trust the status. Otherwise
      // (`pending` with no record), required edges block until the
      // producer actually runs; non-required edges pass through.
      if (producerStatus === "done" || producerStatus === "failed") continue;
      if (edge.required) {
        gatedOn.push({ from: edge.from, latestCycleIndex: null, outcome: null });
      }
      continue;
    }
    if (summary.outcome === "completed") continue;
    // Required OR non-required: a present-but-in-flight cycle gates the
    // consumer. Consuming the prior cycle's stale artifact is exactly the
    // bug this gate closes.
    gatedOn.push({
      from: edge.from,
      latestCycleIndex: summary.cycleIndex,
      outcome: summary.outcome ?? null,
    });
  }
  return { ready: gatedOn.length === 0, gatedOn };
}
