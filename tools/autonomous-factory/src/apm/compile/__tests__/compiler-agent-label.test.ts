/**
 * compiler-agent-label.test.ts — validates `node.agent` label alignment.
 *
 * Covers the Phase 3 validator added to `compiler.ts`: every `type: "agent"`
 * node must reference a declared agent key (after stripping the leading `@`).
 * Drift produces an `ApmCompileError` with a nearest-neighbour suggestion.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";

import { compileApm } from "../compiler.js";

function writeFixture(agentLabel: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apm-agent-label-"));
  const apmDir = path.join(root, ".apm");
  fs.mkdirSync(apmDir, { recursive: true });
  fs.mkdirSync(path.join(apmDir, "instructions/always"), { recursive: true });
  fs.mkdirSync(path.join(apmDir, "agents"), { recursive: true });

  fs.writeFileSync(path.join(apmDir, "instructions/always/common.md"), "# always\n");
  fs.writeFileSync(path.join(apmDir, "agents/dev.agent.md"), "You are dev.\n");

  const apm = {
    name: "fixture",
    version: "1.0.0",
    description: "",
    tokenBudget: 8000,
    agents: {
      dev: {
        instructions: ["always"],
        promptFile: "dev.agent.md",
        mcp: [],
        skills: [],
        toolLimits: { soft: 10, hard: 20 },
        security: {},
        tools: { core: ["read_file"] },
      },
    },
    nodes: {
      dev: { type: "agent", category: "dev", agent: agentLabel, timeout_minutes: 5 },
    },
  };

  fs.writeFileSync(path.join(apmDir, "apm.yml"), yaml.dump(apm));

  const workflowsDir = path.join(apmDir, "workflows");
  fs.mkdirSync(workflowsDir, { recursive: true });
  const workflow = {
    name: "default",
    nodes: {
      dev: { depends_on: [] },
    },
  };
  fs.writeFileSync(path.join(workflowsDir, "default.yml"), yaml.dump(workflow));

  return root;
}

describe("compileApm — node.agent label validation", () => {
  it("accepts a node whose agent label matches a declared agent key", () => {
    const root = writeFixture("@dev");
    assert.doesNotThrow(() => compileApm(root));
  });

  it("rejects a node whose agent label has no declared counterpart", () => {
    const root = writeFixture("@dv");
    assert.throws(
      () => compileApm(root),
      (err: Error) =>
        /node "dev": agent label "@dv" does not match/.test(err.message) &&
        /Did you mean "@dev"\?/.test(err.message),
    );
  });

  it("rejects a node with a fully unrelated agent label", () => {
    const root = writeFixture("@completely-different-agent");
    assert.throws(
      () => compileApm(root),
      (err: Error) => /does not match any declared agent key/.test(err.message),
    );
  });
});
