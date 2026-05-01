/**
 * auto-skip-positive-signal.test.ts — P4 of halt-discipline hardening.
 *
 * Exercises `hasPositiveOutputSignal`, the new gate that prevents an
 * auto-skip from firing when no prior invocation has materialised the
 * node's declared `produces_artifacts` on disk.
 *
 * Fixture: a fresh `.dagent/<slug>/` tree with and without an `inv_*`
 * directory's `meta.json#outputs` containing a matching kind.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { hasPositiveOutputSignal } from "../../activities/support/auto-skip-evaluator.js";

describe("hasPositiveOutputSignal (P4)", () => {
  let appRoot: string;
  const slug = "feature-x";
  const nodeKey = "spec-compiler";

  beforeEach(() => {
    appRoot = mkdtempSync(path.join(tmpdir(), "dagent-p4-"));
  });

  afterEach(() => {
    rmSync(appRoot, { recursive: true, force: true });
  });

  function placeInvocation(invId: string, outputs: Array<{ kind: string }>): void {
    const invDir = path.join(appRoot, ".dagent", slug, nodeKey, invId);
    mkdirSync(invDir, { recursive: true });
    writeFileSync(
      path.join(invDir, "meta.json"),
      JSON.stringify({ invocationId: invId, outputs }, null, 2),
    );
  }

  it("returns true vacuously when no kinds are declared", () => {
    expect(hasPositiveOutputSignal(appRoot, slug, nodeKey, [])).toBe(true);
  });

  it("returns false on a fresh workspace with no inv_* directories", () => {
    expect(hasPositiveOutputSignal(appRoot, slug, nodeKey, ["acceptance"])).toBe(false);
  });

  it("returns false when inv_* dirs exist but none lists a matching kind", () => {
    placeInvocation("inv_AAAAAAAAAAAAAAAAAAAAAAAAAA", [{ kind: "spec" }]);
    expect(hasPositiveOutputSignal(appRoot, slug, nodeKey, ["acceptance"])).toBe(false);
  });

  it("returns true when at least one inv_*/meta.json#outputs lists a declared kind", () => {
    placeInvocation("inv_BBBBBBBBBBBBBBBBBBBBBBBBBB", [{ kind: "spec" }]);
    placeInvocation("inv_CCCCCCCCCCCCCCCCCCCCCCCCCC", [{ kind: "acceptance" }]);
    expect(hasPositiveOutputSignal(appRoot, slug, nodeKey, ["acceptance"])).toBe(true);
  });

  it("ignores non-inv_ directories", () => {
    const stray = path.join(appRoot, ".dagent", slug, nodeKey, "junk");
    mkdirSync(stray, { recursive: true });
    writeFileSync(
      path.join(stray, "meta.json"),
      JSON.stringify({ outputs: [{ kind: "acceptance" }] }),
    );
    expect(hasPositiveOutputSignal(appRoot, slug, nodeKey, ["acceptance"])).toBe(false);
  });

  it("survives malformed meta.json without throwing", () => {
    const invDir = path.join(appRoot, ".dagent", slug, nodeKey, "inv_DDDDDDDDDDDDDDDDDDDDDDDDDD");
    mkdirSync(invDir, { recursive: true });
    writeFileSync(path.join(invDir, "meta.json"), "{not json");
    expect(hasPositiveOutputSignal(appRoot, slug, nodeKey, ["acceptance"])).toBe(false);
  });

  it("matches when ANY declared kind is present (multi-kind union)", () => {
    placeInvocation("inv_EEEEEEEEEEEEEEEEEEEEEEEEEE", [{ kind: "summary" }]);
    expect(
      hasPositiveOutputSignal(appRoot, slug, nodeKey, ["acceptance", "summary"]),
    ).toBe(true);
  });
});
