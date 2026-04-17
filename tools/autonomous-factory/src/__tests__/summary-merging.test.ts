/**
 * summary-merging.test.ts — Unit tests for cross-session summary merging.
 *
 * Validates that writePipelineSummary() writes a JSON sidecar and that
 * loadPreviousSummary() can read it back for cross-session telemetry merging.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/summary-merging.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writePipelineSummary, loadPreviousSummary, formatDuration, formatUsd, type PreviousSummaryTotals } from "../reporting.js";
import type { ItemSummary } from "../types.js";

// ---------------------------------------------------------------------------
// loadPreviousSummary — JSON sidecar
// ---------------------------------------------------------------------------

describe("loadPreviousSummary", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "summary-test-"));

  it("returns null when JSON file does not exist", () => {
    const result = loadPreviousSummary(tmpDir, "nonexistent");
    assert.equal(result, null);
  });

  it("reads a valid JSON sidecar", () => {
    fs.mkdirSync(path.join(tmpDir, "in-progress"), { recursive: true });
    const data: PreviousSummaryTotals = {
      steps: 8, completed: 6, failed: 2,
      durationMs: 765_000, filesChanged: 23, tokens: 1234567, costUsd: 18.5432,
    };
    fs.writeFileSync(
      path.join(tmpDir, "in-progress", "test_SUMMARY-DATA.json"),
      JSON.stringify(data, null, 2),
    );
    const result = loadPreviousSummary(tmpDir, "test");
    assert.deepEqual(result, data);
  });
});

// ---------------------------------------------------------------------------
// baseTelemetry monotonic merge (boot-time parse + unconditional add)
// ---------------------------------------------------------------------------

/** Build a minimal valid ItemSummary for testing */
function makeSummary(overrides: Partial<ItemSummary> = {}): ItemSummary {
  return {
    key: "test-step",
    label: "Test Step",
    agent: "test-agent",
    attempt: 1,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 60_000,
    outcome: "completed",
    intents: [],
    messages: [],
    filesRead: [],
    filesChanged: ["src/foo.ts"],
    shellCommands: [],
    toolCounts: {},
    inputTokens: 5000,
    outputTokens: 2000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...overrides,
  };
}

describe("baseTelemetry merge", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "base-tel-test-"));
  // writePipelineSummary expects: appRoot/in-progress/<slug>_SUMMARY.md
  const fakeAppRoot = path.join(tmpDir, "app");
  const fakeRepoRoot = tmpDir;
  const slug = "test-merge";

  // Create the in-progress directory
  fs.mkdirSync(path.join(fakeAppRoot, "in-progress"), { recursive: true });

  const summaryFile = path.join(fakeAppRoot, "in-progress", `${slug}_SUMMARY.md`);

  it("writes correct totals with null baseTelemetry", () => {
    const summaries = [makeSummary({ durationMs: 30_000 })];
    writePipelineSummary(fakeAppRoot, fakeRepoRoot, slug, summaries, undefined, null);
    const content = fs.readFileSync(summaryFile, "utf-8");
    assert.match(content, /Total steps \| 1/);
    assert.ok(!content.includes("prior session"));
  });

  it("adds baseTelemetry to current totals", () => {
    const base: PreviousSummaryTotals = {
      steps: 5, completed: 4, failed: 1,
      durationMs: 300_000, filesChanged: 10, tokens: 100_000, costUsd: 5.0,
    };
    const summaries = [makeSummary({ durationMs: 60_000 })];
    writePipelineSummary(fakeAppRoot, fakeRepoRoot, slug, summaries, undefined, base);
    const content = fs.readFileSync(summaryFile, "utf-8");
    // 1 current + 5 prior = 6 total steps
    assert.match(content, /Total steps \| 6/);
    assert.match(content, /includes 5 steps from prior session/);
  });

  it("stays monotonic when current steps equal prior steps", () => {
    // This is the exact scenario that broke the old shouldMerge approach:
    // Wave 1 wrote 5 steps, Wave 2 also has 5 steps => old guard dropped Wave 1
    const base: PreviousSummaryTotals = {
      steps: 5, completed: 5, failed: 0,
      durationMs: 200_000, filesChanged: 8, tokens: 80_000, costUsd: 3.0,
    };
    const summaries = Array.from({ length: 5 }, (_, i) =>
      makeSummary({ key: `step-${i}`, durationMs: 40_000 }),
    );
    writePipelineSummary(fakeAppRoot, fakeRepoRoot, slug, summaries, undefined, base);
    const content = fs.readFileSync(summaryFile, "utf-8");
    // 5 current + 5 prior = 10 total steps (NOT 5!)
    assert.match(content, /Total steps \| 10/);
    assert.match(content, /includes 5 steps from prior session/);
  });

  it("stays monotonic when current steps exceed prior steps", () => {
    const base: PreviousSummaryTotals = {
      steps: 3, completed: 3, failed: 0,
      durationMs: 100_000, filesChanged: 5, tokens: 30_000, costUsd: 1.0,
    };
    const summaries = Array.from({ length: 7 }, (_, i) =>
      makeSummary({ key: `step-${i}`, durationMs: 20_000 }),
    );
    writePipelineSummary(fakeAppRoot, fakeRepoRoot, slug, summaries, undefined, base);
    const content = fs.readFileSync(summaryFile, "utf-8");
    // 7 current + 3 prior = 10 total steps
    assert.match(content, /Total steps \| 10/);
  });

  it("round-trips: write then load JSON yields correct baseTelemetry for next boot", () => {
    const base: PreviousSummaryTotals = {
      steps: 4, completed: 3, failed: 1,
      durationMs: 180_000, filesChanged: 12, tokens: 60_000, costUsd: 2.5,
    };
    const summaries = [
      makeSummary({ durationMs: 60_000, filesChanged: ["a.ts", "b.ts"] }),
      makeSummary({ key: "s2", durationMs: 30_000, outcome: "failed", filesChanged: ["c.ts"] }),
    ];
    writePipelineSummary(fakeAppRoot, fakeRepoRoot, slug, summaries, undefined, base);

    // Simulate next boot: load the JSON sidecar we just wrote
    const loaded = loadPreviousSummary(fakeAppRoot, slug);
    assert.ok(loaded !== null);
    // 2 current + 4 prior = 6 total steps
    assert.equal(loaded.steps, 6);
    // 1 current completed + 3 prior = 4
    assert.equal(loaded.completed, 4);
    // 1 current failed + 1 prior = 2
    assert.equal(loaded.failed, 2);
  });
});

// ---------------------------------------------------------------------------
// Sanity checks for formatting helpers (used by merge)
// ---------------------------------------------------------------------------

describe("formatDuration (merge-relevant cases)", () => {
  it("formats minutes and seconds", () => {
    assert.equal(formatDuration(765_000), "12m 45s");
  });

  it("formats exact minutes", () => {
    assert.equal(formatDuration(300_000), "5m");
  });

  it("formats sub-minute", () => {
    assert.equal(formatDuration(45_000), "45s");
  });

  it("formats sub-second", () => {
    assert.equal(formatDuration(500), "500ms");
  });
});

describe("formatUsd", () => {
  it("formats with 4 decimal places", () => {
    assert.equal(formatUsd(18.5432), "$18.5432");
  });

  it("formats zero", () => {
    assert.equal(formatUsd(0), "$0.0000");
  });
});
