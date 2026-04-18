/**
 * domain/__tests__/approval-sla.test.ts — Phase 4 approval SLA pure helpers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveApprovalSla,
  checkApprovalExpired,
} from "../approval-sla.js";

describe("resolveApprovalSla", () => {
  it("returns code defaults when node and policy are empty", () => {
    const r = resolveApprovalSla(undefined, undefined);
    assert.equal(r.timeoutHours, null);
    assert.equal(r.onTimeout, "halt");
  });

  it("inherits from policy when node fields absent", () => {
    const r = resolveApprovalSla(undefined, {
      approval_default_timeout_hours: 12,
      approval_default_on_timeout: "salvage",
    });
    assert.equal(r.timeoutHours, 12);
    assert.equal(r.onTimeout, "salvage");
  });

  it("per-node fields override policy defaults", () => {
    const r = resolveApprovalSla(
      { timeout_hours: 2, on_timeout: "fail" },
      { approval_default_timeout_hours: 24, approval_default_on_timeout: "halt" },
    );
    assert.equal(r.timeoutHours, 2);
    assert.equal(r.onTimeout, "fail");
  });

  it("mixes per-node timeout with policy on_timeout", () => {
    const r = resolveApprovalSla(
      { timeout_hours: 6 },
      { approval_default_on_timeout: "salvage" },
    );
    assert.equal(r.timeoutHours, 6);
    assert.equal(r.onTimeout, "salvage");
  });
});

describe("checkApprovalExpired", () => {
  const requested = 1_700_000_000_000;

  it("never expires when timeoutHours is null", () => {
    const status = checkApprovalExpired(requested + 7 * 24 * 3600 * 1000, requested, null);
    assert.equal(status.expired, false);
    assert.equal(status.deadlineMs, null);
  });

  it("not expired before deadline", () => {
    const hours = 4;
    const status = checkApprovalExpired(requested + 3 * 3600 * 1000, requested, hours);
    assert.equal(status.expired, false);
    assert.equal(status.deadlineMs, hours * 3600 * 1000);
  });

  it("expired at or past deadline", () => {
    const status = checkApprovalExpired(requested + 3_600_000, requested, 1);
    assert.equal(status.expired, true);
    assert.equal(status.elapsedMs, 3_600_000);
  });

  it("clamps negative elapsed to 0 (clock skew)", () => {
    const status = checkApprovalExpired(requested - 10, requested, 1);
    assert.equal(status.elapsedMs, 0);
    assert.equal(status.expired, false);
  });
});
