/**
 * session-events.test.ts — Unit tests for session event utilities:
 *   1. appendToToolResult non-destructive mutation
 *   2. Circuit breaker error preservation pattern
 *   3. CI log truncation pattern
 *
 * Uses Node.js built-in test runner (node:test).
 * Run: npx tsx src/__tests__/session-events.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendToToolResult } from "../session/session-events.js";

// ---------------------------------------------------------------------------
// appendToToolResult — non-destructive tool result mutation
// ---------------------------------------------------------------------------

describe("appendToToolResult", () => {
  it("creates result when data.result is undefined", () => {
    const data: any = {};
    appendToToolResult(data, "⚠️ system prompt");
    assert.deepStrictEqual(data.result, { content: "⚠️ system prompt" });
  });

  it("creates result when data.result is null", () => {
    const data: any = { result: null };
    appendToToolResult(data, "⚠️ system prompt");
    assert.deepStrictEqual(data.result, { content: "⚠️ system prompt" });
  });

  it("appends to string content", () => {
    const data: any = { result: { content: "original data" } };
    appendToToolResult(data, "\n\n⚠️ warning");
    assert.equal(data.result.content, "original data\n\n⚠️ warning");
  });

  it("preserves empty string content", () => {
    const data: any = { result: { content: "" } };
    appendToToolResult(data, "prompt");
    assert.equal(data.result.content, "prompt");
  });

  it("appends text block to array content (multimodal)", () => {
    const data: any = {
      result: {
        content: [
          { type: "text", text: "file contents here" },
          { type: "image", data: "base64..." },
        ],
      },
    };
    appendToToolResult(data, "\n\n⚠️ warning");
    assert.equal(data.result.content.length, 3);
    assert.deepStrictEqual(data.result.content[2], { type: "text", text: "\n\n⚠️ warning" });
    // Original blocks are preserved
    assert.equal(data.result.content[0].text, "file contents here");
    assert.equal(data.result.content[1].type, "image");
  });

  it("handles empty array content", () => {
    const data: any = { result: { content: [] } };
    appendToToolResult(data, "prompt");
    assert.equal(data.result.content.length, 1);
    assert.deepStrictEqual(data.result.content[0], { type: "text", text: "prompt" });
  });

  it("stringifies and appends when content is an unexpected object", () => {
    const data: any = { result: { content: { nested: "value", count: 42 } } };
    appendToToolResult(data, "\n\nprompt");
    assert.ok(typeof data.result.content === "string");
    assert.ok(data.result.content.includes('"nested":"value"'));
    assert.ok(data.result.content.includes('"count":42'));
    assert.ok(data.result.content.endsWith("\n\nprompt"));
  });

  it("stringifies and appends when content is a number", () => {
    const data: any = { result: { content: 42 } };
    appendToToolResult(data, "\n\nprompt");
    assert.ok(typeof data.result.content === "string");
    assert.ok(data.result.content.startsWith("42"));
    assert.ok(data.result.content.endsWith("\n\nprompt"));
  });

  it("does not modify other properties on data.result", () => {
    const data: any = { result: { content: "original", otherProp: "keep" } };
    appendToToolResult(data, " appended");
    assert.equal(data.result.otherProp, "keep");
    assert.equal(data.result.content, "original appended");
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker error preservation (Issue 1)
// The actual guard is: if (!itemSummary.errorMessage?.includes("Cognitive circuit breaker"))
// We test the logic pattern here.
// ---------------------------------------------------------------------------

describe("circuit breaker error preservation pattern", () => {
  it("preserves circuit breaker message when catch fires", () => {
    // Simulate the itemSummary state after circuit breaker fires
    const itemSummary = {
      outcome: "error" as string,
      errorMessage: "Cognitive circuit breaker: exceeded 40 tool calls",
    };

    // Simulate the catch block logic
    const sdkError = "Session closed";
    if (!itemSummary.errorMessage?.includes("Cognitive circuit breaker")) {
      itemSummary.outcome = "error";
      itemSummary.errorMessage = sdkError;
    }

    // Circuit breaker message should survive
    assert.equal(itemSummary.errorMessage, "Cognitive circuit breaker: exceeded 40 tool calls");
  });

  it("allows overwrite when no circuit breaker", () => {
    const itemSummary = {
      outcome: "in-progress" as string,
      errorMessage: undefined as string | undefined,
    };

    const sdkError = "Network timeout";
    if (!itemSummary.errorMessage?.includes("Cognitive circuit breaker")) {
      itemSummary.outcome = "error";
      itemSummary.errorMessage = sdkError;
    }

    assert.equal(itemSummary.errorMessage, "Network timeout");
    assert.equal(itemSummary.outcome, "error");
  });

  it("allows overwrite for non-circuit-breaker errors", () => {
    const itemSummary = {
      outcome: "error" as string,
      errorMessage: "Some previous error",
    };

    const sdkError = "Session closed";
    if (!itemSummary.errorMessage?.includes("Cognitive circuit breaker")) {
      itemSummary.outcome = "error";
      itemSummary.errorMessage = sdkError;
    }

    assert.equal(itemSummary.errorMessage, "Session closed");
  });
});

// ---------------------------------------------------------------------------
// CI log truncation pattern (Issue 2)
// The inline constant is CI_LOG_CHAR_LIMIT = 15_000. We test the slicing
// logic in isolation.
// ---------------------------------------------------------------------------

describe("CI log truncation pattern", () => {
  const CI_LOG_CHAR_LIMIT = 15_000;

  function truncateCiLogs(ciLogs: string, ciStderr: string): string {
    let capturedOutput = [ciLogs, ciStderr].filter(Boolean).join("\n");
    if (capturedOutput.length > CI_LOG_CHAR_LIMIT) {
      capturedOutput = "[...TRUNCATED CI LOGS...]\n" + capturedOutput.slice(-CI_LOG_CHAR_LIMIT);
    }
    return capturedOutput;
  }

  it("passes through short logs unchanged", () => {
    const result = truncateCiLogs("Build succeeded", "");
    assert.equal(result, "Build succeeded");
  });

  it("truncates logs exceeding 15K chars", () => {
    const hugeLog = "X".repeat(50_000);
    const result = truncateCiLogs(hugeLog, "error at bottom");
    assert.ok(result.length <= CI_LOG_CHAR_LIMIT + 30); // +prefix
    assert.ok(result.startsWith("[...TRUNCATED CI LOGS...]"));
    // The tail (error) should be preserved
    assert.ok(result.endsWith("error at bottom"));
  });

  it("preserves the tail of the log (failure context)", () => {
    // Build a log where the important error is at the very end
    const padding = "webpack: compiling chunk 999...\n".repeat(2000);
    const errorTail = "ERROR: Module not found: @azure/functions\n  at resolve (/app/node_modules/...)";
    const result = truncateCiLogs(padding + errorTail, "");
    assert.ok(result.includes("ERROR: Module not found: @azure/functions"));
    assert.ok(result.startsWith("[...TRUNCATED CI LOGS...]"));
  });

  it("combines stdout and stderr before truncating", () => {
    const stdout = "A".repeat(10_000);
    const stderr = "B".repeat(10_000);
    const result = truncateCiLogs(stdout, stderr);
    assert.ok(result.startsWith("[...TRUNCATED CI LOGS...]"));
    // Should contain chars from both streams (tail portion)
    assert.ok(result.includes("B"));
  });
});
