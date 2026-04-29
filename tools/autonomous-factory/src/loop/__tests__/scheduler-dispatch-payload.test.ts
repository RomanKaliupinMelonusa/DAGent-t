/**
 * scheduler-dispatch-payload.test.ts — Phase 2 (parallelism observability).
 *
 * Asserts the shape of the `scheduler.dispatch` telemetry payload built
 * once per non-complete/non-blocked loop tick, including the
 * no-runnable-items / all-triage path where the loop emits and then
 * immediately `continue`s.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSchedulerDispatchPayload } from "../scheduler-dispatch-payload.js";
import type { Effect } from "../../kernel/effects.js";
import type { AvailableItem } from "../../app-types.js";

const item = (key: string): AvailableItem =>
  ({ key, label: key } as unknown as AvailableItem);

describe("buildSchedulerDispatchPayload (scheduler.dispatch shape)", () => {
  it("emits all six fields with parallel-batch dispatch", () => {
    const payload = buildSchedulerDispatchPayload({
      batchNumber: 4,
      readyItems: [item("dev-fe"), item("dev-be"), item("dev-infra")],
      dispatchedItems: [item("dev-fe"), item("dev-be"), item("dev-infra")],
      gateEffects: [],
      triageActivations: 0,
      stallFails: [],
    });

    // All six documented fields must be present and correctly typed.
    assert.equal(payload.batchNumber, 4);
    assert.deepEqual(payload.ready, ["dev-fe", "dev-be", "dev-infra"]);
    assert.deepEqual(payload.dispatched, ["dev-fe", "dev-be", "dev-infra"]);
    assert.deepEqual(payload.gatedKeys, []);
    assert.equal(payload.triageActivations, 0);
    assert.deepEqual(payload.stallFails, []);

    // Shape: exactly six keys, no extras.
    assert.deepEqual(
      Object.keys(payload).sort(),
      ["batchNumber", "dispatched", "gatedKeys", "ready", "stallFails", "triageActivations"],
    );
  });

  it("captures the all-triage / no-runnable path (loop will continue after emit)", () => {
    // batch.items contains only triage nodes — runnableItems is empty
    // after the triage filter, but the event still emits before `continue`.
    const payload = buildSchedulerDispatchPayload({
      batchNumber: 7,
      readyItems: [item("triage-main")],
      dispatchedItems: [], // triage filter ate the only ready item
      gateEffects: [],
      triageActivations: 1, // drained this tick at Step 0.5
      stallFails: [],
    });

    assert.equal(payload.batchNumber, 7);
    assert.deepEqual(payload.ready, ["triage-main"]);
    assert.deepEqual(payload.dispatched, []);
    assert.deepEqual(payload.gatedKeys, []);
    assert.equal(payload.triageActivations, 1);
    assert.deepEqual(payload.stallFails, []);
  });

  it("extracts gatedKeys from producer-cycle gate effects, ignoring other telemetry", () => {
    const gateEffects: Effect[] = [
      {
        type: "telemetry-event",
        category: "dispatch.gated_on_producer_cycle",
        itemKey: "dev-fe",
        data: { reason: "producer-cycle" },
      } as unknown as Effect,
      {
        type: "telemetry-event",
        category: "dispatch.gated_on_producer_cycle",
        itemKey: "dev-be",
        data: { reason: "producer-cycle" },
      } as unknown as Effect,
      // Unrelated telemetry: must be ignored.
      {
        type: "telemetry-event",
        category: "some.other.category",
        itemKey: "noise",
        data: {},
      } as unknown as Effect,
      // Non-telemetry effect: must be ignored.
      { type: "reindex", categories: undefined, causedBy: "x" } as unknown as Effect,
    ];

    const payload = buildSchedulerDispatchPayload({
      batchNumber: 2,
      readyItems: [item("dev-test")],
      dispatchedItems: [item("dev-test")],
      gateEffects,
      triageActivations: 0,
      stallFails: [],
    });

    assert.deepEqual(payload.gatedKeys, ["dev-fe", "dev-be"]);
    assert.deepEqual(payload.dispatched, ["dev-test"]);
  });

  it("filters out telemetry-event entries with null itemKey", () => {
    const gateEffects: Effect[] = [
      {
        type: "telemetry-event",
        category: "dispatch.gated_on_producer_cycle",
        itemKey: null,
        data: {},
      } as unknown as Effect,
      {
        type: "telemetry-event",
        category: "dispatch.gated_on_producer_cycle",
        itemKey: "dev-fe",
        data: {},
      } as unknown as Effect,
    ];
    const payload = buildSchedulerDispatchPayload({
      batchNumber: 1,
      readyItems: [],
      dispatchedItems: [],
      gateEffects,
      triageActivations: 0,
      stallFails: [],
    });
    assert.deepEqual(payload.gatedKeys, ["dev-fe"]);
  });

  it("propagates stallFails (Step 0 force-failures) into the payload", () => {
    const payload = buildSchedulerDispatchPayload({
      batchNumber: 9,
      readyItems: [item("dev-fe")],
      dispatchedItems: [item("dev-fe")],
      gateEffects: undefined,
      triageActivations: 0,
      stallFails: ["waited-too-long-1", "waited-too-long-2"],
    });
    assert.deepEqual(payload.stallFails, ["waited-too-long-1", "waited-too-long-2"]);
    assert.deepEqual(payload.gatedKeys, []);
  });

  it("handles undefined gateEffects without throwing", () => {
    const payload = buildSchedulerDispatchPayload({
      batchNumber: 1,
      readyItems: [item("a")],
      dispatchedItems: [item("a")],
      gateEffects: undefined,
      triageActivations: 0,
      stallFails: [],
    });
    assert.deepEqual(payload.gatedKeys, []);
  });
});
