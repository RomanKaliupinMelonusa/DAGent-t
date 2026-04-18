/**
 * domain/__tests__/progress-tracker.test.ts — Phase 4 loop-hardening helpers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  snapshotProgress,
  evaluateHardening,
  type HardeningState,
} from "../progress-tracker.js";

const items = (statuses: string[]) =>
  statuses.map((s) => ({ status: s as "done" | "failed" | "pending" | "na" | "dormant" }));

describe("snapshotProgress", () => {
  it("counts done and failed statuses", () => {
    const s = snapshotProgress(items(["done", "done", "failed", "pending", "dormant"]));
    assert.equal(s.doneCount, 2);
    assert.equal(s.failCount, 1);
    assert.equal(s.key, "2:1");
  });

  it("empty list yields 0:0", () => {
    const s = snapshotProgress([]);
    assert.equal(s.key, "0:0");
  });
});

describe("evaluateHardening", () => {
  const initial: HardeningState = { prevKey: null, lastProgressMs: 0 };

  it("advances lastProgressMs when key changes", () => {
    const v = evaluateHardening(
      snapshotProgress(items(["done"])),
      initial,
      1_000,
      {},
    );
    assert.equal(v.kind, "ok");
    if (v.kind === "ok") {
      assert.equal(v.state.lastProgressMs, 1_000);
      assert.equal(v.state.prevKey, "1:0");
    }
  });

  it("preserves lastProgressMs when key unchanged", () => {
    const prev: HardeningState = { prevKey: "1:0", lastProgressMs: 1_000 };
    const v = evaluateHardening(
      snapshotProgress(items(["done"])),
      prev,
      5_000,
      {},
    );
    assert.equal(v.kind, "ok");
    if (v.kind === "ok") assert.equal(v.state.lastProgressMs, 1_000);
  });

  it("idle-timeout fires when nowMs exceeds threshold without progress", () => {
    const prev: HardeningState = { prevKey: "0:0", lastProgressMs: 0 };
    const v = evaluateHardening(
      snapshotProgress(items(["pending"])),
      prev,
      61_000,
      { maxIdleMs: 60_000 },
    );
    assert.equal(v.kind, "idle-timeout");
    if (v.kind === "idle-timeout") assert.equal(v.idleMs, 61_000);
  });

  it("idle-timeout does NOT fire on the same tick progress advanced", () => {
    // Key changed this tick → lastProgressMs resets to nowMs → not idle.
    const prev: HardeningState = { prevKey: "0:0", lastProgressMs: 0 };
    const v = evaluateHardening(
      snapshotProgress(items(["done"])),
      prev,
      10 * 60_000,
      { maxIdleMs: 60_000 },
    );
    assert.equal(v.kind, "ok");
  });

  it("failure-budget fires at threshold", () => {
    const v = evaluateHardening(
      snapshotProgress(items(["failed", "failed", "failed"])),
      initial,
      1_000,
      { maxTotalFailures: 3 },
    );
    assert.equal(v.kind, "failure-budget");
    if (v.kind === "failure-budget") assert.equal(v.failCount, 3);
  });

  it("failure-budget does not fire below threshold", () => {
    const v = evaluateHardening(
      snapshotProgress(items(["failed", "failed"])),
      initial,
      1_000,
      { maxTotalFailures: 3 },
    );
    assert.equal(v.kind, "ok");
  });

  it("failure-budget takes priority over idle-timeout", () => {
    // Both conditions met — failure budget wins because it is more actionable.
    const prev: HardeningState = { prevKey: "0:3", lastProgressMs: 0 };
    const v = evaluateHardening(
      snapshotProgress(items(["failed", "failed", "failed"])),
      prev,
      10 * 60_000,
      { maxIdleMs: 60_000, maxTotalFailures: 3 },
    );
    assert.equal(v.kind, "failure-budget");
  });
});
