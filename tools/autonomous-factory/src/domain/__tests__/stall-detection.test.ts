/**
 * domain/__tests__/stall-detection.test.ts — Pure stall-upstream detection.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  detectStalledItems,
  formatStallError,
  type StallableItem,
} from "../stall-detection.js";

const HOUR_MS = 60 * 60 * 1000;

function mkItem(key: string, status: StallableItem["status"]): StallableItem {
  return { key, status };
}

describe("detectStalledItems", () => {
  it("returns empty when no items configured with ready_within_hours", () => {
    const items = [mkItem("a", "pending"), mkItem("b", "pending")];
    const pendingSince = new Map([["a", 0], ["b", 0]]);
    const thresholds = new Map<string, number>();
    const result = detectStalledItems(items, 10 * HOUR_MS, pendingSince, thresholds);
    assert.deepEqual(result, []);
  });

  it("flags a pending item that has exceeded its threshold", () => {
    const items = [mkItem("a", "pending")];
    const pendingSince = new Map([["a", 0]]);
    const thresholds = new Map([["a", 2]]); // 2 hours
    const result = detectStalledItems(items, 3 * HOUR_MS, pendingSince, thresholds);
    assert.equal(result.length, 1);
    assert.equal(result[0]!.key, "a");
    assert.equal(result[0]!.elapsedMs, 3 * HOUR_MS);
    assert.equal(result[0]!.thresholdMs, 2 * HOUR_MS);
  });

  it("does not flag an item that is still within its threshold", () => {
    const items = [mkItem("a", "pending")];
    const pendingSince = new Map([["a", 0]]);
    const thresholds = new Map([["a", 5]]);
    const result = detectStalledItems(items, 3 * HOUR_MS, pendingSince, thresholds);
    assert.deepEqual(result, []);
  });

  it("flags exactly at the threshold boundary (>=)", () => {
    const items = [mkItem("a", "pending")];
    const pendingSince = new Map([["a", 0]]);
    const thresholds = new Map([["a", 1]]);
    const result = detectStalledItems(items, 1 * HOUR_MS, pendingSince, thresholds);
    assert.equal(result.length, 1);
  });

  it("ignores non-pending items (done/failed/na/dormant)", () => {
    const items: StallableItem[] = [
      mkItem("done", "done"),
      mkItem("failed", "failed"),
      mkItem("na", "na"),
      mkItem("dormant", "dormant"),
    ];
    const pendingSince = new Map(items.map((i) => [i.key, 0]));
    const thresholds = new Map(items.map((i) => [i.key, 1]));
    const result = detectStalledItems(items, 100 * HOUR_MS, pendingSince, thresholds);
    assert.deepEqual(result, []);
  });

  it("skips items without a pendingSince timestamp", () => {
    const items = [mkItem("a", "pending")];
    const pendingSince = new Map<string, number>();
    const thresholds = new Map([["a", 1]]);
    const result = detectStalledItems(items, 100 * HOUR_MS, pendingSince, thresholds);
    assert.deepEqual(result, []);
  });

  it("skips items whose threshold is zero or negative", () => {
    const items = [mkItem("a", "pending"), mkItem("b", "pending")];
    const pendingSince = new Map([["a", 0], ["b", 0]]);
    const thresholds = new Map([["a", 0], ["b", -1]]);
    const result = detectStalledItems(items, 10 * HOUR_MS, pendingSince, thresholds);
    assert.deepEqual(result, []);
  });

  it("clamps negative elapsed (clock skew) to zero, never flags", () => {
    const items = [mkItem("a", "pending")];
    // pendingSince in the future relative to nowMs
    const pendingSince = new Map([["a", 100 * HOUR_MS]]);
    const thresholds = new Map([["a", 1]]);
    const result = detectStalledItems(items, 10 * HOUR_MS, pendingSince, thresholds);
    assert.deepEqual(result, []);
  });

  it("flags multiple stalled items independently", () => {
    const items = [
      mkItem("a", "pending"),
      mkItem("b", "pending"),
      mkItem("c", "pending"),
    ];
    const pendingSince = new Map([["a", 0], ["b", 5 * HOUR_MS], ["c", 0]]);
    const thresholds = new Map([["a", 2], ["b", 2], ["c", 100]]);
    const result = detectStalledItems(items, 10 * HOUR_MS, pendingSince, thresholds);
    const keys = result.map((r) => r.key).sort();
    assert.deepEqual(keys, ["a", "b"]);
  });
});

describe("formatStallError", () => {
  it("includes node key and both times in hours", () => {
    const msg = formatStallError({
      key: "infra-deploy",
      elapsedMs: 5 * HOUR_MS,
      thresholdMs: 2 * HOUR_MS,
    });
    assert.match(msg, /^stalled-upstream:/);
    assert.match(msg, /"infra-deploy"/);
    assert.match(msg, /5\.00h/);
    assert.match(msg, /2\.00h/);
  });
});
