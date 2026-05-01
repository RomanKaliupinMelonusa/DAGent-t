/**
 * __tests__/policy-schema.test.ts — Phase 4 apm `config.policy` block + approval
 * node fields. Validates that Zod parsing accepts the new fields and applies
 * the expected defaults.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ApmConfigSchema,
  ApmNodeCatalogEntrySchema,
} from "../apm/manifest/types.js";

const minimalConfigBase = {
  defaultToolLimits: { soft: 60, hard: 80 },
  directories: { app: "." },
};

describe("config.policy (Phase 4)", () => {
  it("omitting policy is allowed", () => {
    const parsed = ApmConfigSchema.parse(minimalConfigBase);
    assert.equal(parsed.policy, undefined);
  });

  it("populated policy applies max_iterations default", () => {
    const parsed = ApmConfigSchema.parse({
      ...minimalConfigBase,
      policy: { max_idle_minutes: 30 },
    });
    assert.equal(parsed.policy?.max_iterations, 500);
    assert.equal(parsed.policy?.max_idle_minutes, 30);
    assert.equal(parsed.policy?.approval_default_on_timeout, "halt");
  });

  it("accepts approval defaults + total failure budget", () => {
    const parsed = ApmConfigSchema.parse({
      ...minimalConfigBase,
      policy: {
        max_total_failures: 7,
        approval_default_timeout_hours: 24,
        approval_default_on_timeout: "salvage",
      },
    });
    assert.equal(parsed.policy?.max_total_failures, 7);
    assert.equal(parsed.policy?.approval_default_timeout_hours, 24);
    assert.equal(parsed.policy?.approval_default_on_timeout, "salvage");
  });

  it("rejects invalid approval_default_on_timeout", () => {
    assert.throws(() =>
      ApmConfigSchema.parse({
        ...minimalConfigBase,
        policy: { approval_default_on_timeout: "ignore" },
      }),
    );
  });

  it("rejects non-positive max_idle_minutes", () => {
    assert.throws(() =>
      ApmConfigSchema.parse({
        ...minimalConfigBase,
        policy: { max_idle_minutes: 0 },
      }),
    );
  });
});

describe("approval node SLA fields (Phase 4)", () => {
  it("parses per-node timeout_hours and on_timeout", () => {
    const parsed = ApmNodeCatalogEntrySchema.parse({
      type: "approval",
      category: "gate",
      timeout_hours: 8,
      on_timeout: "fail",
    });
    assert.equal(parsed.timeout_hours, 8);
    assert.equal(parsed.on_timeout, "fail");
  });

  it("omitting SLA fields is allowed", () => {
    const parsed = ApmNodeCatalogEntrySchema.parse({
      type: "approval",
      category: "gate",
    });
    assert.equal(parsed.timeout_hours, undefined);
    assert.equal(parsed.on_timeout, undefined);
  });

  it("rejects invalid on_timeout", () => {
    assert.throws(() =>
      ApmNodeCatalogEntrySchema.parse({
        type: "approval",
        category: "gate",
        on_timeout: "nope",
      }),
    );
  });
});
