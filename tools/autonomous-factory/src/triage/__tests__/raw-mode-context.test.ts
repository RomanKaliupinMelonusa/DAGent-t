/**
 * triage/__tests__/raw-mode-context.test.ts — Raw-mode composeTriageContext.
 *
 * Validates that `composeTriageContext({rawMode:true})` produces the
 * historian-based block (and NOT the legacy "Automated Diagnosis" /
 * "IDENTICAL ERROR DETECTED" sections).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { composeTriageContext } from "../context-builder.js";
import type { ItemSummary } from "../../types.js";

const baseSummary = {
  attempt: 1,
  durationMs: 100,
  filesChanged: [],
  intents: [],
  toolCalls: [],
  shellCommands: [],
} as const;

function makeSummary(key: string, outcome: ItemSummary["outcome"], errorMessage?: string): ItemSummary {
  return {
    ...baseSummary,
    key,
    outcome,
    errorMessage: errorMessage ?? null,
  } as unknown as ItemSummary;
}

describe("composeTriageContext rawMode=true", () => {
  it("emits the redevelopment intro + approach directive, but no raw stdout block or legacy diagnosis sections", () => {
    const failureText = "Error: getServerSnapshot returned different values\n".repeat(5);
    const summaries: ItemSummary[] = [
      makeSummary("storefront-dev", "completed"),
      makeSummary("e2e-test", "error", failureText),
    ];

    const out = composeTriageContext({
      slug: "non-existent-slug-xyz",
      itemKey: "storefront-dev",
      attempt: 1,
      effectiveAttempts: 1,
      pipelineSummaries: summaries,
      allowsRevertBypass: true,
      rawMode: true,
    });

    assert.match(out, /Redevelopment Context/);
    assert.match(out, /Approach:/);

    // Raw stdout must no longer be inlined — the compact failed-tests list
    // rendered by the adapter replaces it.
    assert.ok(!/Most recent failure output/.test(out), "raw stdout block should be removed");
    assert.ok(!/getServerSnapshot/.test(out), "failure output should not be inlined");

    // Legacy LLM-condensed sections stay gone.
    assert.ok(!/Automated Diagnosis/.test(out), "raw mode should skip Automated Diagnosis");
    assert.ok(!/IDENTICAL ERROR DETECTED/.test(out), "raw mode should skip IDENTICAL ERROR warning");
  });

  it("legacy mode (rawMode=false) still emits failure context without raw block", () => {
    const summaries: ItemSummary[] = [
      makeSummary("e2e-test", "error", "boom"),
    ];
    const out = composeTriageContext({
      slug: "non-existent-slug-xyz",
      itemKey: "storefront-dev",
      attempt: 1,
      effectiveAttempts: 1,
      pipelineSummaries: summaries,
      allowsRevertBypass: true,
      rawMode: false,
    });
    assert.match(out, /Redevelopment Context/);
    assert.ok(!/Most recent failure output/.test(out), "legacy mode should not emit raw section header");
  });

  it("renders the redevelopment block from failureFallback when pipelineSummaries is empty", () => {
    // Fallback path: the handler always threads the activation's rawError
    // through `failureFallback` so the redevelopment block still renders
    // even when `pipelineSummaries` happens to be empty (e.g. tests, or
    // self-activated triage firing before any downstream record exists).
    const out = composeTriageContext({
      slug: "non-existent-slug-xyz",
      itemKey: "storefront-dev",
      attempt: 1,
      effectiveAttempts: 1,
      pipelineSummaries: [],
      allowsRevertBypass: true,
      rawMode: true,
      failureFallback: {
        failingItemKey: "e2e-runner",
        rawError: "Error: getServerSnapshot should be cached to avoid infinite loop",
      },
    });

    assert.match(out, /Redevelopment Context/);
    assert.match(out, /`e2e-runner`/);
    assert.ok(!/Most recent failure output/.test(out), "raw stdout block should be removed");
    assert.ok(!/getServerSnapshot/.test(out), "failure output should not be inlined");
  });
});
