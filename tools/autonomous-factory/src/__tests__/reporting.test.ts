/**
 * reporting.test.ts — Contract validation for /_kickoff/flight-data.json export.
 *
 * Verifies that writePipelineSummary() produces a well-formed JSON envelope
 * alongside the existing /_summary.md. The envelope is the read-only API
 * contract consumed by external UI dashboards.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/reporting.test.ts
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writePipelineSummary } from "../reporting/index.js";
import type { ItemSummary } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpAppRoot(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flight-data-test-"));
  fs.mkdirSync(path.join(tmp, "in-progress"), { recursive: true });
  return tmp;
}

function makeItemSummary(overrides?: Partial<ItemSummary>): ItemSummary {
  return {
    key: "backend-dev",
    label: "Backend Development",
    agent: "dev-expert",
    attempt: 1,
    startedAt: "2026-03-31T10:00:00.000Z",
    finishedAt: "2026-03-31T10:05:00.000Z",
    durationMs: 300_000,
    outcome: "completed",
    intents: ["Intent: Implementing login endpoint"],
    messages: ["Implemented POST /api/login with JWT validation."],
    filesRead: ["src/functions/fn-demo-login.ts"],
    filesChanged: ["src/functions/fn-demo-login.ts"],
    shellCommands: [],
    toolCounts: { "file-write": 2, shell: 1 },
    errorMessage: undefined,
    inputTokens: 5000,
    outputTokens: 2000,
    cacheReadTokens: 1000,
    cacheWriteTokens: 500,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("writePipelineSummary — /_kickoff/flight-data.json export", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("writes a valid /_kickoff/flight-data.json envelope alongside /_summary.md", () => {
    const appRoot = makeTmpAppRoot();
    tmpDirs.push(appRoot);
    const slug = "test-feature";
    const summaries: ItemSummary[] = [
      makeItemSummary(),
      makeItemSummary({
        key: "frontend-dev",
        label: "Frontend Development",
        agent: "dev-expert",
        outcome: "failed",
        errorMessage: "Component render error",
        durationMs: 120_000,
      }),
    ];

    writePipelineSummary(appRoot, "/repo", slug, summaries);

    // Both files must exist
    const summaryPath = path.join(appRoot, "in-progress", `${slug}/_summary.md`);
    const flightPath = path.join(appRoot, "in-progress", `${slug}/_kickoff/flight-data.json`);
    assert.ok(fs.existsSync(summaryPath), "/_summary.md must be written");
    assert.ok(fs.existsSync(flightPath), "/_kickoff/flight-data.json must be written");

    // Parse and validate envelope structure
    const raw = fs.readFileSync(flightPath, "utf-8");
    const envelope = JSON.parse(raw);

    assert.equal(envelope.version, 1, "envelope.version must be 1");
    assert.equal(typeof envelope.generatedAt, "string", "generatedAt must be a string");
    assert.ok(!isNaN(Date.parse(envelope.generatedAt)), "generatedAt must be a valid ISO timestamp");
    assert.equal(envelope.featureSlug, slug, "featureSlug must match");
    assert.ok(Array.isArray(envelope.items), "items must be an array");
    assert.equal(envelope.items.length, 2, "items must contain 2 summaries");
  });

  it("each item in the envelope has the required ItemSummary keys", () => {
    const appRoot = makeTmpAppRoot();
    tmpDirs.push(appRoot);
    const slug = "contract-check";
    const summaries: ItemSummary[] = [makeItemSummary()];

    writePipelineSummary(appRoot, "/repo", slug, summaries);

    const flightPath = path.join(appRoot, "in-progress", `${slug}/_kickoff/flight-data.json`);
    const envelope = JSON.parse(fs.readFileSync(flightPath, "utf-8"));
    const item = envelope.items[0];

    const requiredKeys = [
      "key", "label", "agent", "attempt",
      "startedAt", "finishedAt", "durationMs", "outcome",
      "intents", "messages", "filesRead", "filesChanged",
      "shellCommands", "toolCounts",
      "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens",
    ];
    for (const k of requiredKeys) {
      assert.ok(k in item, `item must have key "${k}"`);
    }
  });

  it("JSON is formatted with 2-space indentation", () => {
    const appRoot = makeTmpAppRoot();
    tmpDirs.push(appRoot);
    const slug = "indent-check";
    const summaries: ItemSummary[] = [makeItemSummary()];

    writePipelineSummary(appRoot, "/repo", slug, summaries);

    const raw = fs.readFileSync(
      path.join(appRoot, "in-progress", `${slug}/_kickoff/flight-data.json`),
      "utf-8",
    );
    // 2-space indentation means lines should start with "  " (not tabs, not 4 spaces)
    const indentedLines = raw.split("\n").filter((l) => l.startsWith("  "));
    assert.ok(indentedLines.length > 0, "JSON must use 2-space indentation");
    // Verify it round-trips cleanly with the same indentation
    const roundTrip = JSON.stringify(JSON.parse(raw), null, 2);
    assert.equal(raw, roundTrip, "JSON must be formatted with JSON.stringify(…, null, 2)");
  });

  it("does not throw when the in-progress directory is missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flight-no-dir-"));
    tmpDirs.push(tmp);
    // Intentionally do NOT create in-progress/ — both writes should fail silently
    assert.doesNotThrow(() => {
      writePipelineSummary(tmp, "/repo", "no-dir", [makeItemSummary()]);
    }, "writePipelineSummary must not throw even when in-progress/ is missing");
  });
});
