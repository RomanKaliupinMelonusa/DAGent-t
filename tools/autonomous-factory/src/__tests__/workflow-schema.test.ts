/**
 * workflow-schema.test.ts — Validates the workflow YAML schema and DAG properties.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/__tests__/workflow-schema.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ApmWorkflowSchema, topoSort } from "../apm-types.js";

const APP_ROOT = path.resolve(import.meta.dirname, "../../../../apps/sample-app");
const WF_PATH = path.join(APP_ROOT, ".apm", "workflows.yml");

describe("Workflow Schema", () => {
  const exists = fs.existsSync(WF_PATH);
  if (!exists) {
    it("skips — workflows.yml not found", () => assert.ok(true));
    return;
  }

  const raw = yaml.load(fs.readFileSync(WF_PATH, "utf-8")) as Record<string, unknown>;
// workflows.yml wraps in a workflow name key (e.g. "default")
const firstKey = Object.keys(raw)[0];
const wfRaw = firstKey ? raw[firstKey] as Record<string, unknown> : raw;

  it("parses and validates against ApmWorkflowSchema", () => {
    const result = ApmWorkflowSchema.safeParse(wfRaw);
    assert.ok(result.success, `Schema validation failed: ${JSON.stringify(result.error?.issues)}`);
  });

  it("DAG is acyclic (topoSort succeeds)", () => {
    const parsed = ApmWorkflowSchema.parse(wfRaw);
    const sorted = topoSort(parsed.nodes);
    assert.ok(sorted !== null, "topoSort should succeed on acyclic graph");
    assert.equal(sorted!.length, Object.keys(parsed.nodes).length);
  });

  it("all depends_on references point to existing nodes", () => {
    const parsed = ApmWorkflowSchema.parse(wfRaw);
    const nodeKeys = new Set(Object.keys(parsed.nodes));
    for (const [k, n] of Object.entries(parsed.nodes)) {
      for (const dep of n.depends_on ?? []) {
        assert.ok(nodeKeys.has(dep), `Node "${k}" depends on unknown "${dep}"`);
      }
    }
  });

  it("all nodes have a phase that appears in the phases array", () => {
    const parsed = ApmWorkflowSchema.parse(wfRaw);
    const phases = new Set(parsed.phases);
    for (const [k, n] of Object.entries(parsed.nodes)) {
      assert.ok(phases.has(n.phase), `Node "${k}" has phase "${n.phase}" not in phases array`);
    }
  });

  it("every phase has at least one node", () => {
    const parsed = ApmWorkflowSchema.parse(wfRaw);
    const phasesUsed = new Set(Object.values(parsed.nodes).map((n) => n.phase));
    for (const p of parsed.phases) {
      assert.ok(phasesUsed.has(p), `Phase "${p}" has no nodes`);
    }
  });

  it("introduces a cycle → schema refine rejects", () => {
    const clone = JSON.parse(JSON.stringify(wfRaw)) as Record<string, unknown>;
    const nodes = (clone as { nodes: Record<string, { depends_on?: string[] }> }).nodes;
    // Create a cycle: pick a root node and make it depend on a leaf
    const keys = Object.keys(nodes);
    const leaf = keys[keys.length - 1];
    const root = keys[0];
    nodes[root].depends_on = [leaf];
    nodes[leaf].depends_on = nodes[leaf].depends_on ?? [];
    (nodes[leaf].depends_on as string[]).push(root);
    const result = ApmWorkflowSchema.safeParse(clone);
    assert.ok(!result.success, "Cyclic graph should be rejected by schema refine");
  });

  // --- Triage profiles ---

  it("has triage profiles section", () => {
    const parsed = ApmWorkflowSchema.parse(wfRaw);
    assert.ok(parsed.triage, "triage section should be defined");
    assert.ok(Object.keys(parsed.triage).length > 0, "triage should have at least one profile");
  });
});
