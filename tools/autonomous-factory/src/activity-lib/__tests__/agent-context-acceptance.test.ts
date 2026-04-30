/**
 * Tests for workflowProducesAcceptance — Session D Phase 2.
 *
 * Verifies that `AgentContext.acceptancePath` injection is driven by the
 * declared `produces_artifacts: [acceptance]` edge rather than by a
 * hard-coded node key.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { workflowProducesAcceptance } from "../agent-context.js";
import type { ApmWorkflow } from "../../apm/types.js";

function wf(nodes: Record<string, { produces_artifacts?: string[] }>): ApmWorkflow {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { nodes } as any;
}

describe("workflowProducesAcceptance", () => {
  it("returns false when workflow is undefined", () => {
    assert.equal(workflowProducesAcceptance(undefined), false);
  });

  it("returns false when no node declares produces_artifacts: [acceptance]", () => {
    const workflow = wf({
      "spec-compiler": { produces_artifacts: ["spec"] },
      "dev": { produces_artifacts: ["code"] },
    });
    assert.equal(workflowProducesAcceptance(workflow), false);
  });

  it("returns true when a spec-compiler node declares it (back-compat)", () => {
    const workflow = wf({
      "spec-compiler": { produces_artifacts: ["acceptance"] },
      "dev": { produces_artifacts: ["code"] },
    });
    assert.equal(workflowProducesAcceptance(workflow), true);
  });

  it("returns true when a renamed node (e.g. contract-compiler) declares it", () => {
    // Rename resilience — the old implementation keyed off the literal
    // string "spec-compiler" and would lose the injection here.
    const workflow = wf({
      "contract-compiler": { produces_artifacts: ["acceptance"] },
      "dev": { produces_artifacts: ["code"] },
    });
    assert.equal(workflowProducesAcceptance(workflow), true);
  });

  it("returns false when a node named spec-compiler does NOT declare acceptance", () => {
    // The old implementation would incorrectly return true here — a node
    // with the right name but the wrong contract.
    const workflow = wf({
      "spec-compiler": { produces_artifacts: ["spec"] },
      "dev": { produces_artifacts: ["code"] },
    });
    assert.equal(workflowProducesAcceptance(workflow), false);
  });

  it("handles nodes with undefined produces_artifacts safely", () => {
    const workflow = wf({ "noop": {} });
    assert.equal(workflowProducesAcceptance(workflow), false);
  });
});
