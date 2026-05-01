import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validateFixtures,
  formatViolationsError,
  KNOWN_ASSERT_KINDS,
} from "../fixture-validator.js";
import { AcceptanceContractSchema } from "../../apm/manifest/acceptance-schema.js";
import type { BaselineProfile } from "../../ports/baseline-loader.js";

const baseFixture = {
  id: "plp-multi-color",
  url: "/category/newarrivals",
  base_sha: "abc123",
  asserted_at: "2026-04-26T12:00:00Z",
  asserts: [],
};

function contract(test_fixtures: unknown[]): ReturnType<typeof AcceptanceContractSchema.parse> {
  return AcceptanceContractSchema.parse({
    feature: "demo",
    summary: "x",
    test_fixtures,
  });
}

describe("validateFixtures — schema-only checks (no baseline)", () => {
  it("returns ok for an empty test_fixtures list", () => {
    const r = validateFixtures(contract([]), null);
    assert.equal(r.ok, true);
  });

  it("flags an unknown assert kind", () => {
    const c = contract([{
      ...baseFixture,
      asserts: [{ kind: "phase_of_moon", value: "full" }],
    }]);
    const r = validateFixtures(c, null);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.violations.length, 1);
      assert.equal(r.violations[0]!.kind, "bad-assert-kind");
    }
  });

  it("accepts every kind in the catalogue", () => {
    const c = contract([{
      ...baseFixture,
      asserts: KNOWN_ASSERT_KINDS.map((k) =>
        k === "http_status" ? { kind: k, value: 200 } : { kind: k, value: 1 }
      ),
    }]);
    const r = validateFixtures(c, null);
    assert.equal(r.ok, true);
  });

  it("classifies runtime kinds without erroring", () => {
    const c = contract([{
      ...baseFixture,
      asserts: [{ kind: "first_tile_swatch_count", value: 2, comparator: "gte" }],
    }]);
    const r = validateFixtures(c, null);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.runtimeAsserts.length, 1);
      assert.equal(r.runtimeAsserts[0]!.kind, "first_tile_swatch_count");
    }
  });

  it("rejects http_status with non-numeric value", () => {
    const c = contract([{
      ...baseFixture,
      asserts: [{ kind: "http_status", value: "ok" }],
    }]);
    const r = validateFixtures(c, null);
    assert.equal(r.ok, false);
  });
});

describe("validateFixtures — URL vs baseline", () => {
  function bl(network: Array<{ pattern: string }>): BaselineProfile {
    return {
      feature: "demo",
      network_failures: network,
    };
  }

  it("flags a fixture URL that matches a baseline network failure", () => {
    const c = contract([{
      ...baseFixture,
      url: "/uk/en-GB/category/newarrivals",
    }]);
    const baseline = bl([{ pattern: "GET /uk/en-GB/category/newarrivals -> 404" }]);
    const r = validateFixtures(c, baseline);
    assert.equal(r.ok, false);
    if (!r.ok) {
      const kinds = r.violations.map((v) => v.kind);
      assert.ok(kinds.includes("url-failure-in-baseline"));
    }
  });

  it("ok when baseline has no matching failure", () => {
    const c = contract([baseFixture]);
    const baseline = bl([{ pattern: "GET /unrelated/path -> 500" }]);
    const r = validateFixtures(c, baseline);
    assert.equal(r.ok, true);
  });

  it("flags a persistent console error mentioning the URL", () => {
    const c = contract([baseFixture]);
    const baseline: BaselineProfile = {
      feature: "demo",
      console_errors: [{ pattern: "Failed to fetch /category/newarrivals", volatility: "persistent" }],
    };
    const r = validateFixtures(c, baseline);
    assert.equal(r.ok, false);
  });

  it("ignores transient console errors", () => {
    const c = contract([baseFixture]);
    const baseline: BaselineProfile = {
      feature: "demo",
      console_errors: [{ pattern: "Failed to fetch /category/newarrivals", volatility: "transient" }],
    };
    const r = validateFixtures(c, baseline);
    assert.equal(r.ok, true);
  });

  it("emits http-status-violated when http_status:200 asserted on a 404 URL", () => {
    const c = contract([{
      ...baseFixture,
      asserts: [{ kind: "http_status", value: 200, comparator: "eq" }],
    }]);
    const baseline = bl([{ pattern: "GET /category/newarrivals -> 404" }]);
    const r = validateFixtures(c, baseline);
    assert.equal(r.ok, false);
    if (!r.ok) {
      const kinds = r.violations.map((v) => v.kind);
      assert.ok(kinds.includes("http-status-violated"));
    }
  });

  it("when baseline is null, URL checks skip but bad-kind still fires", () => {
    const c = contract([{
      ...baseFixture,
      asserts: [{ kind: "frobnicate", value: 1 }],
    }]);
    const r = validateFixtures(c, null);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.violations[0]!.kind, "bad-assert-kind");
    }
  });
});

describe("formatViolationsError", () => {
  it("emits the [fixture-validation] tag the L0 classifier expects", () => {
    const out = formatViolationsError([
      { fixtureId: "x", kind: "bad-assert-kind", message: "kind nope" },
    ]);
    assert.match(out, /^\[fixture-validation\]/);
    assert.match(out, /bad-assert-kind/);
  });
});
