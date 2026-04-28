/**
 * domain/__tests__/salvage-immune.test.ts — Phase 1 hotfix regression.
 *
 * Confirms the `salvage_immune` opt-out: a `category: "deploy"` salvage
 * survivor listed in `state.salvageImmune` is left in `pending` after
 * `salvageForDraft()` even when its entire dependency chain has been
 * marked N/A. Without the flag, the deploy-orphan sweep would demote it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { salvageForDraft, type TransitionState, type TransitionItem } from "../transitions.js";

function item(key: string, status: TransitionItem["status"] = "pending"): TransitionItem {
  return { key, label: key, agent: null, status, error: null };
}

function makeState(overrides: Partial<TransitionState>): TransitionState {
  return {
    items: [],
    errorLog: [],
    dependencies: {},
    nodeTypes: {},
    nodeCategories: {},
    naByType: [],
    salvageSurvivors: [],
    ...overrides,
  };
}

describe("salvageForDraft — salvage_immune opt-out", () => {
  it("leaves an immune deploy survivor pending even when all deps are N/A", () => {
    // A (failed) → B (downstream, gets na'd) → D (deploy survivor, immune)
    const state = makeState({
      items: [item("A"), item("B"), item("D")],
      dependencies: { A: [], B: ["A"], D: ["B"] },
      nodeTypes: { A: "agent", B: "agent", D: "script" },
      nodeCategories: { A: "dev", B: "dev", D: "deploy" },
      salvageSurvivors: ["D"],
      salvageImmune: ["D"],
    });

    const result = salvageForDraft(state, "A");
    const byKey = (k: string) => result.state.items.find((i) => i.key === k)!;

    // A and downstream B are demoted by the standard salvage cascade.
    assert.equal(byKey("A").status, "na");
    assert.equal(byKey("B").status, "na");

    // D is a deploy survivor whose only dep (B) is now N/A. WITHOUT the
    // immune flag the orphan sweep would demote it; WITH the flag it
    // stays force-pending and the deploy-orphan sweep skips it.
    assert.equal(byKey("D").status, "pending");
    assert.equal(byKey("D").salvaged ?? false, false);
    assert.equal(result.demotedKeys.length, 0, "no orphan demotion when immune");
  });

  it("still demotes a non-immune deploy survivor with all-N/A deps (regression)", () => {
    // Same shape, but no salvageImmune entry — confirms the existing
    // demotion path is unchanged for non-immune nodes.
    const state = makeState({
      items: [item("A"), item("B"), item("D")],
      dependencies: { A: [], B: ["A"], D: ["B"] },
      nodeTypes: { A: "agent", B: "agent", D: "script" },
      nodeCategories: { A: "dev", B: "dev", D: "deploy" },
      salvageSurvivors: ["D"],
      // salvageImmune intentionally omitted
    });

    const result = salvageForDraft(state, "A");
    const byKey = (k: string) => result.state.items.find((i) => i.key === k)!;

    assert.equal(byKey("D").status, "na");
    assert.equal(byKey("D").salvaged, true);
    assert.deepEqual(result.demotedKeys, ["D"]);
  });
});
