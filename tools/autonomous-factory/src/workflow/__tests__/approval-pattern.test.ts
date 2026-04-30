/**
 * Phase 3 — ApprovalRegistry pure-logic unit tests.
 *
 * The registry is the deterministic core of the approval pattern.
 * `installApprovalRegistry` and `awaitApproval` wrap it in
 * `setHandler` / `condition` calls that require a workflow context;
 * exercising the wrapper end-to-end requires the integration test
 * suite (skipped without a Temporal cluster). The registry itself is
 * pure — these tests cover the verdict semantics without spinning up
 * a worker.
 */

import { describe, expect, it } from "vitest";
import {
  ApprovalRegistry,
  ApprovalRejectedError,
} from "../approval-pattern.js";

describe("ApprovalRegistry — Phase 3 approval primitives", () => {
  it("snapshot lists pending gates in registration order with stable seq", () => {
    const r = new ApprovalRegistry();
    r.register("infra");
    r.register("deploy");

    const snap = r.snapshot();
    expect(snap.map((p) => p.gateKey)).toEqual(["infra", "deploy"]);
    expect(snap[0].registeredSeq).toBe(0);
    expect(snap[1].registeredSeq).toBe(1);
  });

  it("register is idempotent — repeat keeps the original seq", () => {
    const r = new ApprovalRegistry();
    r.register("infra");
    r.register("deploy");
    r.register("infra"); // dup

    const snap = r.snapshot();
    expect(snap.map((p) => p.gateKey)).toEqual(["infra", "deploy"]);
    expect(snap[0].registeredSeq).toBe(0); // unchanged
  });

  it("approve resolves the gate and take() drains it", () => {
    const r = new ApprovalRegistry();
    r.register("infra");
    expect(r.isResolved("infra")).toBe(false);

    r.approve("infra");
    expect(r.isResolved("infra")).toBe(true);

    expect(() => r.take("infra")).not.toThrow();
    // Drained → no longer in pending snapshot.
    expect(r.snapshot()).toEqual([]);
  });

  it("reject yields ApprovalRejectedError carrying the gateKey + reason", () => {
    const r = new ApprovalRegistry();
    r.register("deploy");
    r.reject("deploy", "checklist incomplete");

    expect(r.isResolved("deploy")).toBe(true);
    try {
      r.take("deploy");
      expect.fail("expected take() to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApprovalRejectedError);
      const rejected = err as ApprovalRejectedError;
      expect(rejected.gateKey).toBe("deploy");
      expect(rejected.rejectionReason).toBe("checklist incomplete");
      expect(rejected.message).toContain("deploy");
      expect(rejected.message).toContain("checklist incomplete");
    }

    // Rejected entry is also dropped — the operator can retry by
    // re-registering, matching legacy ChatOps ergonomics.
    expect(r.snapshot()).toEqual([]);
  });

  it("first verdict wins — approve then reject is a no-op on the rejection", () => {
    const r = new ApprovalRegistry();
    r.register("infra");
    r.approve("infra");
    r.reject("infra", "too late");

    // The approve verdict still wins.
    expect(() => r.take("infra")).not.toThrow();
  });

  it("buffers a signal that arrives BEFORE register (legacy retry-friendly)", () => {
    const r = new ApprovalRegistry();
    r.approve("infra"); // signal arrived first
    r.register("infra"); // workflow caught up

    // The buffered approve must NOT clobber, because there's no
    // pending entry. The registry intentionally accepts the verdict
    // first — a subsequent register() finds the gate already
    // resolved, which is what `awaitApproval`'s `condition` will see.
    expect(r.isResolved("infra")).toBe(true);
    expect(() => r.take("infra")).not.toThrow();
  });

  it("take throws on unknown gate", () => {
    const r = new ApprovalRegistry();
    expect(() => r.take("never-registered")).toThrow(/unknown gate/);
  });

  it("take throws if called while still pending (programmer error)", () => {
    const r = new ApprovalRegistry();
    r.register("infra");
    expect(() => r.take("infra")).toThrow(/while pending/);
  });

  it("snapshot omits resolved gates (only pending listed)", () => {
    const r = new ApprovalRegistry();
    r.register("infra");
    r.register("deploy");
    r.approve("infra");

    expect(r.snapshot().map((p) => p.gateKey)).toEqual(["deploy"]);
  });

  it("seq counter survives interleaved register/approve/take cycles", () => {
    const r = new ApprovalRegistry();
    r.register("a");
    r.approve("a");
    r.take("a");
    r.register("b");
    r.register("c");

    const snap = r.snapshot();
    // 'b' got seq=1 (counter advanced past 'a'), 'c' got seq=2.
    expect(snap).toEqual([
      { gateKey: "b", registeredSeq: 1 },
      { gateKey: "c", registeredSeq: 2 },
    ]);
  });
});
