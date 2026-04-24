/**
 * Tests for checkToolLimitsHygiene — Session D Phase 1.
 *
 * Verifies:
 *  - No warning when every tracked sub-field is declared.
 *  - Single consolidated warning when defaultToolLimits is entirely absent.
 *  - Warning names exactly the missing sub-fields when partially declared.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkToolLimitsHygiene } from "../preflight.js";
import type { ApmCompiledOutput } from "../../apm/types.js";

function makeCtx(defaultToolLimits: unknown): ApmCompiledOutput {
  return {
    config: {
      ...(defaultToolLimits !== undefined ? { defaultToolLimits } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    workflows: {},
    agents: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("checkToolLimitsHygiene", () => {
  let warnings: string[] = [];
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    warnings = [];
    originalWarn = console.warn;
    console.warn = (msg: unknown) => { warnings.push(String(msg)); };
  });

  afterEach(() => { console.warn = originalWarn; });

  it("emits no warning when every sub-field is declared", () => {
    checkToolLimitsHygiene(makeCtx({
      soft: 60, hard: 80,
      fileReadLineLimit: 500,
      maxFileSize: 5 * 1024 * 1024,
      shellOutputLimit: 64000,
      shellTimeoutMs: 600000,
      idleTimeoutLimit: 2,
      writeThreshold: 3,
      preTimeoutPercent: 0.8,
    }));
    assert.equal(warnings.length, 0);
  });

  it("emits a single consolidated warning when defaultToolLimits is absent", () => {
    checkToolLimitsHygiene(makeCtx(undefined));
    assert.equal(warnings.length, 1);
    const w = warnings[0];
    assert.match(w, /`config\.defaultToolLimits` is not declared/);
    // Lists every tracked sub-field.
    for (const f of [
      "soft", "hard", "fileReadLineLimit", "maxFileSize",
      "shellOutputLimit", "shellTimeoutMs", "idleTimeoutLimit",
      "writeThreshold", "preTimeoutPercent",
    ]) {
      assert.match(w, new RegExp(f), `missing field "${f}" in warning`);
    }
  });

  it("warns only about missing sub-fields when partially declared", () => {
    checkToolLimitsHygiene(makeCtx({
      soft: 60, hard: 80,
      fileReadLineLimit: 500,
      shellOutputLimit: 64000,
      shellTimeoutMs: 600000,
    }));
    assert.equal(warnings.length, 1);
    const w = warnings[0];
    assert.match(w, /missing sub-fields/);
    // Missing ones listed:
    for (const f of ["maxFileSize", "idleTimeoutLimit", "writeThreshold", "preTimeoutPercent"]) {
      assert.match(w, new RegExp(`- ${f}`), `missing field "${f}" in warning`);
    }
    // Present ones NOT listed as missing:
    for (const f of ["soft", "hard", "fileReadLineLimit", "shellOutputLimit", "shellTimeoutMs"]) {
      assert.doesNotMatch(w, new RegExp(`- ${f} `), `field "${f}" incorrectly listed as missing`);
    }
  });
});
