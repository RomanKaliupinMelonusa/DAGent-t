/**
 * outcome-tool.test.ts — Unit tests for the `report_outcome` SDK tool.
 *
 * Verifies that the tool handler:
 *   - records `completed` outcome onto telemetry
 *   - records `failed` outcome with diagnostic message
 *   - rejects `failed` without a message (no telemetry mutation)
 *   - last-call-wins idempotency
 *   - propagates only the canonical fields (status, message)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildReportOutcomeTool } from "../harness/outcome-tool.js";
import type { ItemSummary } from "../types.js";

function emptyTelemetry(): ItemSummary {
  return {
    key: "k", label: "l", agent: "a", attempt: 1,
    startedAt: "", finishedAt: "", durationMs: 0,
    outcome: "in-progress", intents: [], messages: [],
    filesRead: [], filesChanged: [], shellCommands: [],
    toolCounts: {}, inputTokens: 0, outputTokens: 0,
    cacheReadTokens: 0, cacheWriteTokens: 0,
  };
}

describe("buildReportOutcomeTool", () => {
  it("registers the tool under the canonical name", () => {
    const tool = buildReportOutcomeTool(emptyTelemetry());
    assert.equal(tool.name, "report_outcome");
  });

  it("records a minimal `completed` outcome", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t);
    const result = await (tool as any).handler({ status: "completed" });
    assert.deepEqual(t.reportedOutcome, { status: "completed" });
    assert.match(String(result), /completed/i);
  });

  it("records a `failed` outcome with a diagnostic message", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t);
    await (tool as any).handler({ status: "failed", message: "tests broke: TypeError x" });
    assert.deepEqual(t.reportedOutcome, {
      status: "failed",
      message: "tests broke: TypeError x",
    });
  });

  it("rejects `failed` without a message and does not mutate telemetry", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t);
    const result = await (tool as any).handler({ status: "failed" });
    assert.equal(t.reportedOutcome, undefined);
    assert.match(String(result), /requires a non-empty/i);
  });

  it("rejects `failed` with whitespace-only message", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t);
    await (tool as any).handler({ status: "failed", message: "   \n  " });
    assert.equal(t.reportedOutcome, undefined);
  });

  it("ignores extra fields on `completed` (Phase 5: schema collapsed)", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t);
    await (tool as any).handler({
      status: "completed",
      // Pre-Phase-5 fields are silently dropped — SDK strips unknown
      // params at runtime; we just assert the recorded outcome is bare.
      docNote: "noted",
      deployedUrl: "https://x.example",
      projectNote: "feature note",
    });
    assert.deepEqual(t.reportedOutcome, { status: "completed" });
  });

  it("records only status + message on `failed` (Phase 5: schema collapsed)", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t);
    await (tool as any).handler({
      status: "failed",
      message: "diag",
      docNote: "skipped flaky test",
    });
    assert.deepEqual(t.reportedOutcome, {
      status: "failed",
      message: "diag",
    });
  });

  it("last call wins (idempotent overwrite)", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t);
    await (tool as any).handler({ status: "failed", message: "first" });
    await (tool as any).handler({ status: "completed", docNote: "actually fine" });
    assert.deepEqual(t.reportedOutcome, { status: "completed" });
  });

  it("records bare status when no extra fields supplied", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t);
    await (tool as any).handler({
      status: "completed",
      docNote: "",
      deployedUrl: "",
      projectNote: "",
    });
    assert.deepEqual(t.reportedOutcome, { status: "completed" });
  });
});
