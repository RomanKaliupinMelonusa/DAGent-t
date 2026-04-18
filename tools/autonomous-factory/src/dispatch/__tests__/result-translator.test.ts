/**
 * Tests for dispatch/result-translator.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { translateResult } from "../result-translator.js";
import type { NodeResult } from "../../handlers/types.js";

describe("translateResult", () => {
  it("maps completed outcome to complete-item command", () => {
    const result: NodeResult = {
      outcome: "completed",
      summary: {},
    };
    const cmds = translateResult("backend-dev", result);
    assert.equal(cmds.length, 1);
    assert.equal(cmds[0].type, "complete-item");
    assert.equal((cmds[0] as { itemKey: string }).itemKey, "backend-dev");
  });

  it("maps failed outcome to fail-item command with message", () => {
    const result: NodeResult = {
      outcome: "failed",
      errorMessage: "Test failed: assertion error",
      summary: {},
    };
    const cmds = translateResult("test-run", result);
    assert.equal(cmds[0].type, "fail-item");
    assert.equal((cmds[0] as { message: string }).message, "Test failed: assertion error");
  });

  it("maps error outcome to fail-item command", () => {
    const result: NodeResult = {
      outcome: "error",
      errorMessage: "Handler threw: ENOENT",
      summary: {},
    };
    const cmds = translateResult("push-app", result);
    assert.equal(cmds[0].type, "fail-item");
  });

  it("defaults message to 'Unknown failure' when errorMessage is absent", () => {
    const result: NodeResult = {
      outcome: "failed",
      summary: {},
    };
    const cmds = translateResult("deploy", result);
    assert.equal((cmds[0] as { message: string }).message, "Unknown failure");
  });

  it("wraps DagCommands after state transition", () => {
    const result: NodeResult = {
      outcome: "completed",
      summary: {},
      commands: [
        { type: "reset-nodes", seedKey: "dev", reason: "retry" },
      ],
    };
    const cmds = translateResult("triage-node", result);
    assert.equal(cmds.length, 2);
    assert.equal(cmds[0].type, "complete-item");
    assert.equal(cmds[1].type, "dag-command");
  });

  it("records handler output after transition and DagCommands", () => {
    const result: NodeResult = {
      outcome: "completed",
      summary: {},
      commands: [{ type: "reset-nodes", seedKey: "x", reason: "r" }],
      handlerOutput: { lastPushedSha: "abc123" },
    };
    const cmds = translateResult("push-step", result);
    assert.equal(cmds.length, 3);
    assert.equal(cmds[0].type, "complete-item");
    assert.equal(cmds[1].type, "dag-command");
    assert.equal(cmds[2].type, "record-handler-output");
  });

  it("does not emit record-handler-output for empty output", () => {
    const result: NodeResult = {
      outcome: "completed",
      summary: {},
      handlerOutput: {},
    };
    const cmds = translateResult("step", result);
    assert.equal(cmds.length, 1);
  });
});
