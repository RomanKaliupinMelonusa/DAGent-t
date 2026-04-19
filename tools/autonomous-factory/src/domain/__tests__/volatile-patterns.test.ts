/**
 * domain/__tests__/volatile-patterns.test.ts — Volatile pattern source of truth.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VOLATILE_PATTERNS,
  compileVolatilePatterns,
  mergeVolatilePatterns,
} from "../volatile-patterns.js";
import { computeErrorSignature } from "../error-signature.js";

describe("DEFAULT_VOLATILE_PATTERNS", () => {
  it("is non-empty and every entry is a [RegExp, string] pair", () => {
    assert.ok(DEFAULT_VOLATILE_PATTERNS.length > 0);
    for (const [re, repl] of DEFAULT_VOLATILE_PATTERNS) {
      assert.ok(re instanceof RegExp);
      assert.equal(typeof repl, "string");
    }
  });
});

describe("compileVolatilePatterns", () => {
  it("returns [] for undefined or empty input", () => {
    assert.deepEqual(compileVolatilePatterns(undefined), []);
    assert.deepEqual(compileVolatilePatterns([]), []);
  });

  it("compiles valid entries with default flags 'g'", () => {
    const result = compileVolatilePatterns([
      { pattern: "session=[a-z0-9]+", replacement: "<SESSION>" },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0]![0].flags, "g");
    assert.equal(result[0]![1], "<SESSION>");
  });

  it("respects custom flags", () => {
    const result = compileVolatilePatterns([
      { pattern: "fixture-\\d+", flags: "gi", replacement: "<FX>" },
    ]);
    assert.equal(result[0]![0].flags, "gi");
  });

  it("throws with a clear diagnostic on invalid regex", () => {
    assert.throws(
      () => compileVolatilePatterns([{ pattern: "[unclosed", replacement: "<X>" }]),
      /volatile_patterns\[0\]: invalid regex/,
    );
  });

  it("indexes errors so multiple bad entries point to the right slot", () => {
    assert.throws(
      () => compileVolatilePatterns([
        { pattern: "ok", replacement: "<Y>" },
        { pattern: "(", replacement: "<X>" },
      ]),
      /volatile_patterns\[1\]: invalid regex/,
    );
  });
});

describe("mergeVolatilePatterns", () => {
  it("concatenates multiple lists in order", () => {
    const a = compileVolatilePatterns([{ pattern: "A", replacement: "<A>" }]);
    const b = compileVolatilePatterns([{ pattern: "B", replacement: "<B>" }]);
    const merged = mergeVolatilePatterns(a, b);
    assert.equal(merged.length, 2);
    assert.equal(merged[0]![1], "<A>");
    assert.equal(merged[1]![1], "<B>");
  });

  it("handles empty lists", () => {
    const merged = mergeVolatilePatterns([], []);
    assert.deepEqual(merged, []);
  });
});

describe("computeErrorSignature with additionalPatterns", () => {
  it("is stable across unchanged errors (no extras)", () => {
    assert.equal(
      computeErrorSignature("timeout after 30s"),
      computeErrorSignature("timeout after 30s"),
    );
  });

  it("default baseline is applied (timestamps normalized without extras)", () => {
    const a = computeErrorSignature("fail at 2024-01-15T10:30:00.123Z");
    const b = computeErrorSignature("fail at 2025-06-20T23:59:59.999Z");
    assert.equal(a, b);
  });

  it("extra patterns normalize framework-specific tokens", () => {
    const extras = compileVolatilePatterns([
      { pattern: "fixture-\\w+", replacement: "<FIXTURE>" },
    ]);
    const a = computeErrorSignature("login failed for fixture-alpha", extras);
    const b = computeErrorSignature("login failed for fixture-omega", extras);
    assert.equal(a, b);
  });

  it("extras do not alter signatures of errors not containing the pattern", () => {
    const extras = compileVolatilePatterns([
      { pattern: "never-matches-anything", replacement: "<X>" },
    ]);
    const withoutExtras = computeErrorSignature("plain error");
    const withExtras = computeErrorSignature("plain error", extras);
    assert.equal(withoutExtras, withExtras);
  });

  it("extras run AFTER defaults (baseline still applies even when extras provided)", () => {
    const extras = compileVolatilePatterns([
      { pattern: "will-not-match", replacement: "<X>" },
    ]);
    const a = computeErrorSignature("fail at 2024-01-15T10:30:00Z pid=100", extras);
    const b = computeErrorSignature("fail at 2025-12-31T23:59:59Z pid=999", extras);
    assert.equal(a, b);
  });

  it("normalizes POSIX-style 'PID N' tokens (hook output)", () => {
    const a = computeErrorSignature("Pre: dev server (PID 4185) exited prematurely");
    const b = computeErrorSignature("Pre: dev server (PID 6079) exited prematurely");
    assert.equal(a, b);
  });

  it("normalizes Node.js 'node:N' warning prefixes", () => {
    const a = computeErrorSignature("(node:4206) [DEP0040] DeprecationWarning: foo");
    const b = computeErrorSignature("(node:6123) [DEP0040] DeprecationWarning: foo");
    assert.equal(a, b);
  });
});
