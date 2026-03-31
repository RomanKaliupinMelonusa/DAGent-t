/**
 * flight-data.test.ts — Direct contract tests for writeFlightData().
 *
 * Validates the atomic write pattern (.tmp → rename), the silent flag,
 * and orphaned .tmp cleanup independently from writePipelineSummary.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/flight-data.test.ts
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writeFlightData } from "../reporting.js";
import type { ItemSummary } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpAppRoot(): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flight-data-direct-"));
  fs.mkdirSync(path.join(tmp, "in-progress"), { recursive: true });
  return tmp;
}

function makeItemSummary(overrides?: Partial<ItemSummary>): ItemSummary {
  return {
    key: "backend-dev",
    label: "Backend Development",
    agent: "dev-expert",
    phase: "pre-deploy",
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

describe("writeFlightData — atomic write contract", () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      fs.rmSync(d, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it("writes a valid JSON envelope to _FLIGHT_DATA.json", () => {
    const appRoot = makeTmpAppRoot();
    tmpDirs.push(appRoot);
    const slug = "atomic-basic";
    const summaries = [makeItemSummary()];

    writeFlightData(appRoot, slug, summaries);

    const flightPath = path.join(appRoot, "in-progress", `${slug}_FLIGHT_DATA.json`);
    assert.ok(fs.existsSync(flightPath), "_FLIGHT_DATA.json must exist");

    const envelope = JSON.parse(fs.readFileSync(flightPath, "utf-8"));
    assert.equal(envelope.version, 1);
    assert.equal(envelope.featureSlug, slug);
    assert.ok(Array.isArray(envelope.items));
    assert.equal(envelope.items.length, 1);
    assert.equal(envelope.items[0].key, "backend-dev");
  });

  it("leaves no orphaned .tmp file after a successful write", () => {
    const appRoot = makeTmpAppRoot();
    tmpDirs.push(appRoot);
    const slug = "no-tmp-residue";

    writeFlightData(appRoot, slug, [makeItemSummary()]);

    const tmpPath = path.join(appRoot, "in-progress", `${slug}_FLIGHT_DATA.json.tmp`);
    assert.ok(!fs.existsSync(tmpPath), ".tmp file must not remain after successful write");
  });

  it("produces 2-space indented JSON that round-trips cleanly", () => {
    const appRoot = makeTmpAppRoot();
    tmpDirs.push(appRoot);
    const slug = "indent-round-trip";

    writeFlightData(appRoot, slug, [makeItemSummary()]);

    const raw = fs.readFileSync(
      path.join(appRoot, "in-progress", `${slug}_FLIGHT_DATA.json`),
      "utf-8",
    );
    const roundTrip = JSON.stringify(JSON.parse(raw), null, 2);
    assert.equal(raw, roundTrip, "JSON must round-trip with 2-space indentation");
  });

  it("silent=true suppresses console output", () => {
    const appRoot = makeTmpAppRoot();
    tmpDirs.push(appRoot);
    const slug = "silent-check";
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
    try {
      writeFlightData(appRoot, slug, [makeItemSummary()], true);
    } finally {
      console.log = origLog;
    }

    const flightLogs = logs.filter((l) => l.includes("Flight data"));
    assert.equal(flightLogs.length, 0, "silent=true must suppress ✈ log line");

    // File must still be written
    const flightPath = path.join(appRoot, "in-progress", `${slug}_FLIGHT_DATA.json`);
    assert.ok(fs.existsSync(flightPath), "file must still be written when silent");
  });

  it("silent=false (default) emits the ✈ log line", () => {
    const appRoot = makeTmpAppRoot();
    tmpDirs.push(appRoot);
    const slug = "loud-check";
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(" ")); };
    try {
      writeFlightData(appRoot, slug, [makeItemSummary()]);
    } finally {
      console.log = origLog;
    }

    const flightLogs = logs.filter((l) => l.includes("Flight data"));
    assert.equal(flightLogs.length, 1, "silent=false must emit exactly one ✈ log line");
  });

  it("correctly serializes in-progress outcome from heartbeat", () => {
    const appRoot = makeTmpAppRoot();
    tmpDirs.push(appRoot);
    const slug = "in-progress-outcome";
    const summaries = [
      makeItemSummary(),
      makeItemSummary({ key: "frontend-dev", outcome: "in-progress" }),
    ];

    writeFlightData(appRoot, slug, summaries, true);

    const envelope = JSON.parse(
      fs.readFileSync(path.join(appRoot, "in-progress", `${slug}_FLIGHT_DATA.json`), "utf-8"),
    );
    assert.equal(envelope.items[1].outcome, "in-progress");
  });

  it("does not throw when in-progress directory is missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "flight-no-dir-"));
    tmpDirs.push(tmp);
    // Intentionally do NOT create in-progress/ — write should fail silently
    assert.doesNotThrow(() => {
      writeFlightData(tmp, "no-dir", [makeItemSummary()]);
    }, "writeFlightData must not throw when in-progress/ is missing");
  });

  it("overwrites a pre-existing .tmp file without error", () => {
    const appRoot = makeTmpAppRoot();
    tmpDirs.push(appRoot);
    const slug = "stale-tmp";

    // Plant a stale .tmp file (simulating a prior crash)
    const tmpPath = path.join(appRoot, "in-progress", `${slug}_FLIGHT_DATA.json.tmp`);
    fs.writeFileSync(tmpPath, "stale data", "utf-8");

    writeFlightData(appRoot, slug, [makeItemSummary()]);

    // .tmp must be gone (renamed to .json)
    assert.ok(!fs.existsSync(tmpPath), "stale .tmp must be cleaned up");
    // Final .json must be valid
    const envelope = JSON.parse(
      fs.readFileSync(path.join(appRoot, "in-progress", `${slug}_FLIGHT_DATA.json`), "utf-8"),
    );
    assert.equal(envelope.version, 1);
  });
});
