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

// ---------------------------------------------------------------------------
// next_failure_hint validation (Phase B)
// ---------------------------------------------------------------------------

describe("buildReportOutcomeTool — next_failure_hint validation", () => {
  const validation = {
    allowedDomains: ["test-code", "frontend"],
    dagNodeKeys: ["storefront-dev", "e2e-author", "e2e-runner", "qa-adversary"],
  };

  it("accepts a valid hint and stores it on telemetry", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t, validation);
    const result = await (tool as any).handler({
      status: "completed",
      next_failure_hint: {
        domain: "test-code",
        target_node: "e2e-author",
        summary: "Selector race in widget-modal click",
        evidence_paths: ["e2e/widget.spec.ts:42"],
      },
    });
    assert.match(String(result), /completed/i);
    assert.deepEqual(t.reportedOutcome, {
      status: "completed",
      nextFailureHint: {
        domain: "test-code",
        target_node: "e2e-author",
        summary: "Selector race in widget-modal click",
        evidence_paths: ["e2e/widget.spec.ts:42"],
      },
    });
  });

  it("rejects when target_node is not a DAG node", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t, validation);
    const result = await (tool as any).handler({
      status: "completed",
      next_failure_hint: {
        domain: "test-code",
        target_node: "totally-fake-node",
        summary: "x",
      },
    });
    assert.equal(t.reportedOutcome, undefined);
    assert.match(String(result), /target_node 'totally-fake-node'.*not a DAG node/i);
  });

  it("rejects when domain is not in allowedDomains", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t, validation);
    const result = await (tool as any).handler({
      status: "completed",
      next_failure_hint: {
        domain: "infra",
        target_node: "e2e-author",
        summary: "x",
      },
    });
    assert.equal(t.reportedOutcome, undefined);
    assert.match(String(result), /domain 'infra'.*not in the failing node's allowed domains/i);
  });

  it("rejects when summary exceeds the 500-char cap", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t, validation);
    const result = await (tool as any).handler({
      status: "completed",
      next_failure_hint: {
        domain: "test-code",
        target_node: "e2e-author",
        summary: "x".repeat(501),
      },
    });
    assert.equal(t.reportedOutcome, undefined);
    assert.match(String(result), /exceeds the 500-char cap/i);
  });

  it("rejects evidence_paths with absolute paths or '..' segments", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t, validation);
    const r1 = await (tool as any).handler({
      status: "completed",
      next_failure_hint: {
        domain: "test-code",
        target_node: "e2e-author",
        summary: "x",
        evidence_paths: ["/etc/passwd"],
      },
    });
    assert.equal(t.reportedOutcome, undefined);
    assert.match(String(r1), /workspace-relative/);
    const r2 = await (tool as any).handler({
      status: "completed",
      next_failure_hint: {
        domain: "test-code",
        target_node: "e2e-author",
        summary: "x",
        evidence_paths: ["../../etc/passwd"],
      },
    });
    assert.equal(t.reportedOutcome, undefined);
    assert.match(String(r2), /'\.\.'/);
  });

  it("rejects when the field is supplied but no validation context is wired", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t); // no validation
    const result = await (tool as any).handler({
      status: "completed",
      next_failure_hint: {
        domain: "test-code",
        target_node: "e2e-author",
        summary: "x",
      },
    });
    assert.equal(t.reportedOutcome, undefined);
    assert.match(String(result), /validation context is unavailable/i);
  });

  it("ignores the field when omitted entirely (no validation context required)", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t);
    await (tool as any).handler({ status: "completed" });
    assert.deepEqual(t.reportedOutcome, { status: "completed" });
  });

  it("attaches the hint to a `failed` outcome alongside the message", async () => {
    const t = emptyTelemetry();
    const tool = buildReportOutcomeTool(t, validation);
    await (tool as any).handler({
      status: "failed",
      message: "ran out of attempts",
      next_failure_hint: {
        domain: "frontend",
        target_node: "storefront-dev",
        summary: "hydration mismatch from missing window guard",
      },
    });
    assert.deepEqual(t.reportedOutcome, {
      status: "failed",
      message: "ran out of attempts",
      nextFailureHint: {
        domain: "frontend",
        target_node: "storefront-dev",
        summary: "hydration mismatch from missing window guard",
      },
    });
  });
});
