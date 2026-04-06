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

  // --- Phase 3: Triage-as-Code fields ---

  it("has max_redevelopment_cycles and max_redeploy_cycles", () => {
    const parsed = ApmWorkflowSchema.parse(wfRaw);
    assert.equal(typeof parsed.max_redevelopment_cycles, "number");
    assert.equal(typeof parsed.max_redeploy_cycles, "number");
    assert.ok(parsed.max_redevelopment_cycles > 0);
    assert.ok(parsed.max_redeploy_cycles > 0);
  });

  it("has fault_routing with all expected domains", () => {
    const parsed = ApmWorkflowSchema.parse(wfRaw);
    const routing = parsed.fault_routing;
    assert.ok(routing, "fault_routing should be defined");
    // Verify the 13 core domains are present
    const expectedDomains = [
      "backend", "frontend", "both", "frontend+infra", "backend+infra",
      "cicd", "deployment-stale", "deployment-stale-backend", "deployment-stale-frontend",
      "infra", "test-code", "environment", "blocked",
    ];
    for (const d of expectedDomains) {
      assert.ok(d in routing, `Missing fault_routing domain: "${d}"`);
      assert.ok(Array.isArray(routing[d].reset_nodes), `${d}.reset_nodes should be an array`);
    }
  });

  it("fault_routing reset_nodes reference valid node keys or $SELF", () => {
    const parsed = ApmWorkflowSchema.parse(wfRaw);
    const nodeKeys = new Set(Object.keys(parsed.nodes));
    for (const [domain, route] of Object.entries(parsed.fault_routing)) {
      for (const node of route.reset_nodes) {
        assert.ok(
          node === "$SELF" || nodeKeys.has(node),
          `fault_routing["${domain}"] references unknown node "${node}"`,
        );
      }
    }
  });

  it("fault_routing rejects invalid node references at schema level", () => {
    const clone = JSON.parse(JSON.stringify(wfRaw)) as Record<string, unknown>;
    const wf = clone as { fault_routing?: Record<string, { reset_nodes: string[] }> };
    wf.fault_routing = { "test-domain": { reset_nodes: ["nonexistent-node"] } };
    const result = ApmWorkflowSchema.safeParse(clone);
    assert.ok(!result.success, "Invalid node reference in fault_routing should be rejected");
  });

  it("fault_routing allows $SELF sentinel", () => {
    const clone = JSON.parse(JSON.stringify(wfRaw)) as Record<string, unknown>;
    const wf = clone as { fault_routing?: Record<string, { reset_nodes: string[] }> };
    wf.fault_routing = { "custom-domain": { reset_nodes: ["$SELF"] } };
    const result = ApmWorkflowSchema.safeParse(clone);
    assert.ok(result.success, "$SELF sentinel should be accepted in fault_routing");
  });

  it("max_redevelopment_cycles / max_redeploy_cycles defaults applied when omitted", () => {
    const clone = JSON.parse(JSON.stringify(wfRaw)) as Record<string, unknown>;
    delete (clone as Record<string, unknown>).max_redevelopment_cycles;
    delete (clone as Record<string, unknown>).max_redeploy_cycles;
    const result = ApmWorkflowSchema.safeParse(clone);
    assert.ok(result.success, "Should succeed with defaults");
    assert.equal(result.data!.max_redevelopment_cycles, 5);
    assert.equal(result.data!.max_redeploy_cycles, 3);
  });

  it("blocked domain has empty reset_nodes", () => {
    const parsed = ApmWorkflowSchema.parse(wfRaw);
    assert.deepStrictEqual(parsed.fault_routing.blocked?.reset_nodes, []);
  });

  it("deployment-stale domains do NOT include $SELF (WYSIWYG)", () => {
    const parsed = ApmWorkflowSchema.parse(wfRaw);
    for (const d of ["deployment-stale", "deployment-stale-backend", "deployment-stale-frontend"]) {
      const nodes = parsed.fault_routing[d]?.reset_nodes ?? [];
      assert.ok(!nodes.includes("$SELF"), `${d} should NOT include $SELF — deploy-only route`);
    }
  });
});
