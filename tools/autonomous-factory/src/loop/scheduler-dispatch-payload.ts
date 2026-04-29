/**
 * loop/scheduler-dispatch-payload.ts — Phase 2 (parallelism observability).
 *
 * Pure builder for the `scheduler.dispatch` telemetry payload emitted
 * once per non-complete/non-blocked loop tick. Extracted so the event
 * shape is unit-testable in isolation without standing up a full
 * `runPipelineLoop` fixture.
 *
 * One row per tick. Emitted regardless of `runnableItems.length` —
 * including the all-triage / no-runnable case (where the loop continues
 * to the next iteration immediately after).
 */

import type { Effect } from "../kernel/effects.js";
import type { AvailableItem } from "../app-types.js";

export interface SchedulerDispatchPayload {
  readonly batchNumber: number;
  readonly ready: string[];
  readonly dispatched: string[];
  readonly gatedKeys: string[];
  readonly triageActivations: number;
  readonly stallFails: string[];
}

/**
 * Build the `scheduler.dispatch` event payload.
 *
 * - `ready`: every item the scheduler returned this tick (pre triage filter).
 * - `dispatched`: items that will actually run (triage nodes filtered out).
 * - `gatedKeys`: items deferred by the producer-cycle gate (extracted from
 *    `batch.gateEffects` — `telemetry-event` entries categorized as
 *    `dispatch.gated_on_producer_cycle`).
 * - `triageActivations`: number of triage activations drained this tick
 *    (Step 0.5 of the loop).
 * - `stallFails`: keys that were force-failed by the stall detector
 *    (Step 0 of the loop).
 */
export function buildSchedulerDispatchPayload(args: {
  batchNumber: number;
  readyItems: ReadonlyArray<AvailableItem>;
  dispatchedItems: ReadonlyArray<AvailableItem>;
  gateEffects: ReadonlyArray<Effect> | undefined;
  triageActivations: number;
  stallFails: ReadonlyArray<string>;
}): SchedulerDispatchPayload {
  const gatedKeys = (args.gateEffects ?? [])
    .filter(
      (e) =>
        e.type === "telemetry-event" &&
        (e as { category?: string }).category === "dispatch.gated_on_producer_cycle",
    )
    .map((e) => (e as { itemKey: string | null }).itemKey)
    .filter((k): k is string => typeof k === "string");

  return {
    batchNumber: args.batchNumber,
    ready: args.readyItems.map((i) => i.key),
    dispatched: args.dispatchedItems.map((i) => i.key),
    gatedKeys,
    triageActivations: args.triageActivations,
    stallFails: [...args.stallFails],
  };
}
