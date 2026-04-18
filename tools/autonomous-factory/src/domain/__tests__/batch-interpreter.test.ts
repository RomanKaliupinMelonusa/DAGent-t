/**
 * domain/batch-interpreter.test.ts — Unit tests for batch outcome interpretation.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/domain/__tests__/batch-interpreter.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { interpretBatch, type BatchOutcome } from "../batch-interpreter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fulfilled(outcome: BatchOutcome): PromiseSettledResult<BatchOutcome> {
  return { status: "fulfilled", value: outcome };
}

function rejected(reason: unknown): PromiseSettledResult<BatchOutcome> {
  return { status: "rejected", reason };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("interpretBatch", () => {
  it("returns clean signals for all-continue batch", () => {
    const results = [fulfilled({ kind: "continue" }), fulfilled({ kind: "continue" })];
    const signals = interpretBatch(results);
    assert.equal(signals.shouldHalt, false);
    assert.equal(signals.createPr, false);
    assert.equal(signals.approvalPendingKeys.length, 0);
    assert.equal(signals.triageActivations.length, 0);
    assert.equal(signals.unexpectedErrors.length, 0);
  });

  it("detects halt signal", () => {
    const results = [fulfilled({ kind: "continue" }), fulfilled({ kind: "halt" })];
    const signals = interpretBatch(results);
    assert.equal(signals.shouldHalt, true);
  });

  it("detects create-pr signal", () => {
    const results = [fulfilled({ kind: "create-pr" })];
    const signals = interpretBatch(results);
    assert.equal(signals.createPr, true);
  });

  it("collects approval-pending keys", () => {
    const results = [
      fulfilled({ kind: "approval-pending", gateKey: "infra-apply" }),
      fulfilled({ kind: "approval-pending", gateKey: "manual-qa" }),
    ];
    const signals = interpretBatch(results);
    assert.deepEqual([...signals.approvalPendingKeys], ["infra-apply", "manual-qa"]);
  });

  it("collects triage activations", () => {
    const activation = { triageNodeKey: "triage-1", failingKey: "dev-1" };
    const results = [fulfilled({ kind: "triage", activation })];
    const signals = interpretBatch(results);
    assert.equal(signals.triageActivations.length, 1);
    assert.deepEqual(signals.triageActivations[0], activation);
  });

  it("captures rejected promises as unexpected errors and halts", () => {
    const results = [rejected(new Error("boom")), fulfilled({ kind: "continue" })];
    const signals = interpretBatch(results);
    assert.equal(signals.shouldHalt, true);
    assert.equal(signals.unexpectedErrors.length, 1);
    assert.equal(signals.unexpectedErrors[0].message, "boom");
  });

  it("wraps non-Error rejections", () => {
    const results = [rejected("string error")];
    const signals = interpretBatch(results);
    assert.equal(signals.unexpectedErrors[0].message, "string error");
  });
});
