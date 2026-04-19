/**
 * triage/__tests__/historian.test.ts — Prior-attempts reconstruction.
 *
 * Validates that `buildPriorAttemptsBlock` produces one section per
 * reset-for-reroute entry, carries the preceding failure's error
 * signature, and flags recurring signatures.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractPriorAttempts, buildPriorAttemptsBlock } from "../historian.js";

describe("historian.extractPriorAttempts", () => {
  it("returns empty list when no resets occurred", () => {
    const log = [
      { timestamp: "t0", itemKey: "storefront-dev", message: "boom", errorSignature: "abc" },
    ];
    assert.equal(extractPriorAttempts(log).length, 0);
  });

  it("emits one entry per reset-for-reroute, paired with preceding failure", () => {
    const log = [
      { timestamp: "t0", itemKey: "storefront-dev", message: "err-1", errorSignature: "sig1" },
      { timestamp: "t1", itemKey: "reset-for-reroute", message: "[domain:ssr] fix hydration" },
      { timestamp: "t2", itemKey: "storefront-dev", message: "err-2", errorSignature: "sig2" },
      { timestamp: "t3", itemKey: "reset-for-reroute", message: "[domain:ssr] still broken" },
      { timestamp: "t4", itemKey: "storefront-dev", message: "err-3", errorSignature: "sig1" },
      { timestamp: "t5", itemKey: "reset-for-reroute", message: "[domain:ssr] still broken" },
    ];
    const attempts = extractPriorAttempts(log);
    assert.equal(attempts.length, 3);
    assert.equal(attempts[0].cycle, 1);
    assert.equal(attempts[0].resultingSignature, "sig1");
    assert.equal(attempts[0].failingItemKey, "storefront-dev");
    assert.equal(attempts[1].cycle, 2);
    assert.equal(attempts[1].resultingSignature, "sig2");
    assert.equal(attempts[2].cycle, 3);
    assert.equal(attempts[2].resultingSignature, "sig1");
  });

  it("ignores reset entries with no preceding real failure", () => {
    const log = [
      { timestamp: "t0", itemKey: "reset-for-reroute", message: "manual reset" },
    ];
    const attempts = extractPriorAttempts(log);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].resultingSignature, null);
    assert.equal(attempts[0].failingItemKey, null);
  });
});

describe("historian.buildPriorAttemptsBlock", () => {
  it("returns empty string when no prior attempts", () => {
    assert.equal(buildPriorAttemptsBlock([]), "");
  });

  it("renders a markdown block with recurring-signature marker", () => {
    const log = [
      { timestamp: "2025-01-01T00:00:00Z", itemKey: "storefront-dev", message: "getServerSnapshot mismatch", errorSignature: "deadbeef0000" },
      { timestamp: "2025-01-01T00:05:00Z", itemKey: "reset-for-reroute", message: "[domain:ssr-hydration] apply useSyncExternalStore shim" },
      { timestamp: "2025-01-01T00:10:00Z", itemKey: "storefront-dev", message: "getServerSnapshot mismatch again", errorSignature: "deadbeef0000" },
      { timestamp: "2025-01-01T00:15:00Z", itemKey: "reset-for-reroute", message: "[domain:ssr-hydration] try dynamic import" },
    ];
    const md = buildPriorAttemptsBlock(log);
    assert.match(md, /## Prior attempts on this feature branch/);
    assert.match(md, /Cycle 1 — 2025-01-01T00:05:00Z/);
    assert.match(md, /Cycle 2 — 2025-01-01T00:15:00Z/);
    assert.match(md, /sig:deadbeef0000/);
    assert.match(md, /recurring/);
    assert.match(md, /useSyncExternalStore shim/);
    assert.match(md, /getServerSnapshot mismatch/);
  });
});
