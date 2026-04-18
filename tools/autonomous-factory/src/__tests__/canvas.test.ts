/**
 * canvas.test.ts — Canvas schema + round-trip invariants.
 *
 * Guarantees:
 *   - toCanvas(compileApm(sample-app)) parses against ApmCanvasSchema.
 *   - toCanvas(fromCanvas(canvas)) deep-equals canvas (idempotent round-trip).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { compileApm } from "../apm/compiler.js";
import { ApmCanvasSchema, fromCanvas, toCanvas } from "../apm/canvas.js";

const APP_ROOT = path.resolve(import.meta.dirname, "../../../../apps/sample-app");

describe("apm canvas", () => {
  it("projects compiled APM into a schema-valid canvas", () => {
    const compiled = compileApm(APP_ROOT);
    const canvas = toCanvas("sample-app", compiled);
    const parsed = ApmCanvasSchema.safeParse(canvas);
    assert.ok(parsed.success, `canvas failed schema: ${!parsed.success ? JSON.stringify(parsed.error.issues, null, 2) : ""}`);
    assert.equal(canvas.version, "1.0.0");
    assert.equal(canvas.app, "sample-app");
    assert.ok(canvas.workflows.length > 0, "canvas should contain at least one workflow");
    for (const wf of canvas.workflows) {
      assert.ok(wf.nodes.length > 0, `workflow "${wf.name}" should have nodes`);
    }
  });

  it("round-trips canvas → compiled-shape → canvas (idempotent)", () => {
    const compiled = compileApm(APP_ROOT);
    const canvas1 = toCanvas("sample-app", compiled);
    const rehydrated = fromCanvas(canvas1);
    const canvas2 = toCanvas(rehydrated.app, rehydrated.compiled);
    assert.deepEqual(canvas2, canvas1);
  });

  it("rejects malformed canvas documents", () => {
    const bad = { version: "0.0.1", app: "x", agents: [], workflows: [] };
    const parsed = ApmCanvasSchema.safeParse(bad);
    assert.ok(!parsed.success, "expected schema rejection for wrong version");
  });

  it("sorts agents, workflows, and nodes deterministically", () => {
    const compiled = compileApm(APP_ROOT);
    const a = toCanvas("sample-app", compiled);
    const b = toCanvas("sample-app", compiled);
    assert.deepEqual(a, b);
    const agentKeys = a.agents.map((x) => x.key);
    assert.deepEqual(agentKeys, [...agentKeys].sort());
    for (const wf of a.workflows) {
      const nodeKeys = wf.nodes.map((n) => n.key);
      assert.deepEqual(nodeKeys, [...nodeKeys].sort());
    }
  });
});
