/**
 * Tests for loop/signal-handler.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpretSignals } from "../signal-handler.js";
import type { ItemDispatchResult } from "../dispatch/item-dispatch.js";

function makeItemResult(
  key: string,
  overrides: Partial<ItemDispatchResult> = {},
): { itemKey: string; result: ItemDispatchResult } {
  return {
    itemKey: key,
    result: {
      outcome: "completed",
      commands: [],
      summary: {},
      ...overrides,
    },
  };
}

describe("interpretSignals", () => {
  it("returns neutral directive for items with no signals", () => {
    const d = interpretSignals([makeItemResult("a"), makeItemResult("b")]);
    assert.equal(d.halt, false);
    assert.equal(d.createPr, false);
    assert.equal(d.salvageDraft, false);
    assert.deepEqual(d.approvalPendingKeys, []);
  });

  it("detects halt signal", () => {
    const d = interpretSignals([
      makeItemResult("a", { signal: "halt" }),
    ]);
    assert.equal(d.halt, true);
  });

  it("detects create-pr signal", () => {
    const d = interpretSignals([
      makeItemResult("publish", { signal: "create-pr" }),
    ]);
    assert.equal(d.createPr, true);
  });

  it("detects salvage-draft signal with item key", () => {
    const d = interpretSignals([
      makeItemResult("failing-dev", { signal: "salvage-draft" }),
    ]);
    assert.equal(d.salvageDraft, true);
    assert.equal(d.salvageItemKey, "failing-dev");
  });

  it("collects approval-pending keys", () => {
    const d = interpretSignals([
      makeItemResult("gate-1", { signal: "approval-pending" }),
      makeItemResult("gate-2", { signal: "approval-pending" }),
    ]);
    assert.deepEqual(d.approvalPendingKeys, ["gate-1", "gate-2"]);
  });

  it("detects halt via signals bag", () => {
    const d = interpretSignals([
      makeItemResult("a", { signals: { halt: true } }),
    ]);
    assert.equal(d.halt, true);
  });

  it("detects create-pr via signals bag", () => {
    const d = interpretSignals([
      makeItemResult("b", { signals: { "create-pr": true } }),
    ]);
    assert.equal(d.createPr, true);
  });

  it("detects salvage-draft via signals bag", () => {
    const d = interpretSignals([
      makeItemResult("c", { signals: { "salvage-draft": true } }),
    ]);
    assert.equal(d.salvageDraft, true);
    assert.equal(d.salvageItemKey, "c");
  });

  it("aggregates mixed signals from multiple items", () => {
    const d = interpretSignals([
      makeItemResult("a", { signal: "halt" }),
      makeItemResult("b", { signal: "create-pr" }),
      makeItemResult("c", { signal: "approval-pending" }),
    ]);
    assert.equal(d.halt, true);
    assert.equal(d.createPr, true);
    assert.deepEqual(d.approvalPendingKeys, ["c"]);
  });
});
