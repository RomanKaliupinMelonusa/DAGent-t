/**
 * Phase F — triage rejection context renders invocation lineage walked
 * from `state.artifacts` rather than parsing errorLog prose.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// APP_ROOT must be set before the module that reads it loads.
const FIXTURE_ROOT = mkdtempSync(join(tmpdir(), "phaseF-root-"));
process.env.APP_ROOT = FIXTURE_ROOT;

const { buildTriageRejectionContext } = await import("../triage/context-builder.js");
const { newInvocationId } = await import("../activities/support/invocation-id.js");
type InvocationRecord = import("../types.js").InvocationRecord;

describe("Phase F — triage lineage first-class", () => {
  it("includes invocation lineage walked from state.artifacts", async () => {
    mkdirSync(join(FIXTURE_ROOT, ".dagent"), { recursive: true });

    const slug = "lineage-feat";
    const runnerInv = newInvocationId(Date.now() - 4000);
    const unitInv = newInvocationId(Date.now() - 3000);
    const debugInv = newInvocationId(Date.now() - 2000);
    const triageInv = newInvocationId(Date.now() - 1000);

    const artifacts: Record<string, InvocationRecord> = {
      [runnerInv]: {
        invocationId: runnerInv, nodeKey: "e2e-runner", cycleIndex: 1,
        trigger: "initial",
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        outcome: "failed", inputs: [], outputs: [],
      },
      [unitInv]: {
        invocationId: unitInv, nodeKey: "unit-test", cycleIndex: 1,
        trigger: "initial",
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        outcome: "failed", inputs: [], outputs: [],
        parentInvocationId: runnerInv,
      },
      [debugInv]: {
        invocationId: debugInv, nodeKey: "debug-storefront", cycleIndex: 1,
        trigger: "triage-reroute",
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        outcome: "completed", inputs: [], outputs: [],
        parentInvocationId: unitInv,
      },
      [triageInv]: {
        invocationId: triageInv, nodeKey: "triage-storefront", cycleIndex: 1,
        trigger: "initial",
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        outcome: "completed", inputs: [], outputs: [],
        parentInvocationId: debugInv,
      },
    };

    const state = {
      feature: slug,
      workflowName: "wf",
      started: new Date().toISOString(),
      deployedUrl: null,
      implementationNotes: null,
      items: [],
      errorLog: [{
        timestamp: new Date().toISOString(),
        itemKey: "reset-for-reroute",
        message: "runner failed — redevelop dev-storefront",
      }],
      dependencies: {},
      nodeTypes: {},
      nodeCategories: {},
      jsonGated: {},
      naByType: [],
      salvageSurvivors: [],
      artifacts,
    };

    mkdirSync(join(FIXTURE_ROOT, ".dagent", slug), { recursive: true });
    writeFileSync(
      join(FIXTURE_ROOT, ".dagent", `${slug}/_state.json`),
      JSON.stringify(state, null, 2),
    );

    const out = await buildTriageRejectionContext(slug);
    assert.ok(out.includes("TRIAGE REROUTE"));
    assert.ok(out.includes("Invocation lineage (newest → oldest)"), "lineage block rendered");
    assert.ok(out.includes("triage-storefront"), "triage node in lineage");
    assert.ok(out.includes("debug-storefront"), "debug node in lineage");
    assert.ok(out.includes("unit-test"), "unit-test node in lineage");
    assert.ok(out.includes("e2e-runner"), "root failing node in lineage");
    assert.ok(out.includes("[failed]"), "failure outcome surfaced");
  });

  it("omits lineage block when ledger has no reachable chain", async () => {
    const slug = "empty-feat";
    const state = {
      feature: slug, workflowName: "wf", started: new Date().toISOString(),
      deployedUrl: null, implementationNotes: null, items: [],
      errorLog: [{
        timestamp: new Date().toISOString(),
        itemKey: "reset-for-reroute",
        message: "some failure",
      }],
      dependencies: {}, nodeTypes: {}, nodeCategories: {},
      jsonGated: {}, naByType: [], salvageSurvivors: [],
      artifacts: {},
    };

    mkdirSync(join(FIXTURE_ROOT, ".dagent", slug), { recursive: true });
    writeFileSync(
      join(FIXTURE_ROOT, ".dagent", `${slug}/_state.json`),
      JSON.stringify(state, null, 2),
    );

    const out = await buildTriageRejectionContext(slug);
    assert.ok(out.includes("TRIAGE REROUTE"));
    assert.ok(!out.includes("Invocation lineage"), "no lineage block when no chain");
  });
});
