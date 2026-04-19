/**
 * copilot-agent-no-op.test.ts — B4 no-op-dev sanity check.
 *
 * Covers the pure helper `detectNoOpDev` used by the copilot-agent handler
 * to reject silently-idle dev sessions that never moved HEAD.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectNoOpDev } from "../copilot-agent.js";
import type { ItemSummary } from "../../types.js";

function summary(partial: Partial<ItemSummary>): ItemSummary {
  return {
    key: "storefront-dev",
    label: "storefront-dev",
    agent: "storefront-dev",
    attempt: 1,
    startedAt: "",
    finishedAt: "",
    durationMs: 0,
    outcome: "completed",
    intents: [],
    messages: [],
    filesRead: [],
    filesChanged: [],
    shellCommands: [],
    toolCounts: {},
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...partial,
  } as ItemSummary;
}

describe("detectNoOpDev (B4)", () => {
  const SHA_A = "aaaaaaa1111111111111111111111111111111111";
  const SHA_B = "bbbbbbb2222222222222222222222222222222222";

  it("returns null when attributionDirs is empty (opt-out)", () => {
    const msg = detectNoOpDev({
      itemKey: "storefront-dev",
      attributionDirs: [],
      preStepRef: SHA_A,
      headNow: SHA_A,
      pipelineSummaries: [],
    });
    assert.equal(msg, null);
  });

  it("returns null when no preStepRef is available", () => {
    const msg = detectNoOpDev({
      itemKey: "storefront-dev",
      attributionDirs: ["storefront"],
      preStepRef: undefined,
      headNow: SHA_A,
      pipelineSummaries: [],
    });
    assert.equal(msg, null);
  });

  it("returns null when HEAD advanced past preStepRef", () => {
    const msg = detectNoOpDev({
      itemKey: "storefront-dev",
      attributionDirs: ["storefront"],
      preStepRef: SHA_A,
      headNow: SHA_B,
      pipelineSummaries: [],
    });
    assert.equal(msg, null);
  });

  it("returns null when a prior cycle already committed files for this item", () => {
    const msg = detectNoOpDev({
      itemKey: "storefront-dev",
      attributionDirs: ["storefront"],
      preStepRef: SHA_A,
      headNow: SHA_A,
      pipelineSummaries: [
        summary({ key: "storefront-dev", filesChanged: ["apps/storefront/src/Foo.tsx"] }),
      ],
    });
    assert.equal(msg, null);
  });

  it("fails the item when HEAD is unchanged and no prior commits exist", () => {
    const msg = detectNoOpDev({
      itemKey: "storefront-dev",
      attributionDirs: ["storefront"],
      preStepRef: SHA_A,
      headNow: SHA_A,
      pipelineSummaries: [],
    });
    assert.ok(msg, "expected a non-null error message");
    assert.match(msg!, /^\[no-op-dev\]/);
    assert.match(msg!, /storefront/);
  });

  it("ignores pipelineSummaries entries for OTHER items", () => {
    const msg = detectNoOpDev({
      itemKey: "storefront-dev",
      attributionDirs: ["storefront"],
      preStepRef: SHA_A,
      headNow: SHA_A,
      pipelineSummaries: [
        summary({ key: "e2e-author", filesChanged: ["apps/storefront/e2e/foo.spec.ts"] }),
      ],
    });
    assert.ok(msg);
  });
});
