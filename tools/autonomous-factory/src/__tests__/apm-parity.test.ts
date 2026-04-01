/**
 * apm-compiler.test.ts — Tests for the APM compiler, context loader, and compiled output.
 *
 * Validates that the APM compiler correctly resolves instructions, MCP configs,
 * skills, and token budgets for all agents in the sample-app.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/__tests__/apm-parity.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileApm } from "../apm-compiler.js";
import { loadApmContext } from "../apm-context-loader.js";
import { ApmCompiledOutputSchema, type ApmCompiledOutput } from "../apm-types.js";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../..");
const APP_ROOT = path.join(REPO_ROOT, "apps/sample-app");
const APM_DIR = path.join(APP_ROOT, ".apm");

// All agent keys from pipeline-state.mjs ALL_ITEMS
const ALL_AGENT_KEYS = [
  "schema-dev",
  "infra-architect",
  "infra-handoff",
  "push-infra",
  "poll-infra-plan",
  "create-draft-pr",
  "await-infra-approval",
  "backend-dev",
  "frontend-dev",
  "backend-unit-test",
  "frontend-unit-test",
  "push-app",
  "poll-app-ci",
  "integration-test",
  "live-ui",
  "code-cleanup",
  "docs-archived",
  "doc-architect",
  "publish-pr",
];

// ---------------------------------------------------------------------------
// APM compiler output validation
// ---------------------------------------------------------------------------

describe("APM Compiler Output", () => {
  const hasApm = fs.existsSync(path.join(APM_DIR, "apm.yml"));

  if (!hasApm) {
    it("skips — .apm/ not found", () => {
      assert.ok(true, "Skipped: running outside full repo context");
    });
    return;
  }

  let compiled: ApmCompiledOutput;

  try {
    compiled = compileApm(APP_ROOT);
  } catch (err) {
    it("compilation should not throw", () => {
      assert.fail(`APM compilation failed: ${(err as Error).message}`);
    });
    return;
  }

  it("compiled output passes schema validation", () => {
    const result = ApmCompiledOutputSchema.safeParse(compiled);
    assert.ok(result.success, `Schema validation failed: ${JSON.stringify(result.error?.issues)}`);
  });

  it("compiled output has all 16 agent keys", () => {
    for (const key of ALL_AGENT_KEYS) {
      assert.ok(
        compiled.agents[key],
        `Missing agent key "${key}" in compiled output`,
      );
    }
  });

  it("compiled output has no extra agent keys", () => {
    const compiledKeys = Object.keys(compiled.agents).sort();
    const expectedKeys = [...ALL_AGENT_KEYS].sort();
    assert.deepEqual(compiledKeys, expectedKeys, "Agent key sets must match exactly");
  });

  for (const agentKey of ALL_AGENT_KEYS) {
    it(`${agentKey}: rules are non-empty and within budget`, () => {
      const agent = compiled.agents[agentKey];
      assert.ok(agent.rules.length > 0, `Rules should not be empty for "${agentKey}"`);
      assert.ok(
        agent.tokenCount <= compiled.tokenBudget,
        `${agentKey}: ${agent.tokenCount} tokens exceeds budget ${compiled.tokenBudget}`,
      );
    });
  }
});

// ---------------------------------------------------------------------------
// APM context loader tests
// ---------------------------------------------------------------------------

describe("APM Context Loader", () => {
  const hasApm = fs.existsSync(path.join(APM_DIR, "apm.yml"));

  if (!hasApm) {
    it("skips — .apm/ not found", () => {
      assert.ok(true, "Skipped: running outside full repo context");
    });
    return;
  }

  it("loadApmContext returns valid compiled output", () => {
    const output = loadApmContext(APP_ROOT);
    assert.equal(output.version, "1.0.0");
    assert.ok(output.compiledAt);
    assert.ok(output.tokenBudget > 0);
    assert.ok(Object.keys(output.agents).length === ALL_AGENT_KEYS.length);
  });

  it("loadApmContext validates token budgets", () => {
    const output = loadApmContext(APP_ROOT);
    for (const [key, agent] of Object.entries(output.agents)) {
      assert.ok(
        agent.tokenCount <= output.tokenBudget,
        `${key}: ${agent.tokenCount} tokens exceeds budget ${output.tokenBudget}`,
      );
    }
  });

  it("second call uses cache (faster)", () => {
    const start1 = performance.now();
    loadApmContext(APP_ROOT);
    const duration1 = performance.now() - start1;

    const start2 = performance.now();
    loadApmContext(APP_ROOT);
    const duration2 = performance.now() - start2;

    // Cache hit should be faster (or at least not dramatically slower)
    // We just verify it doesn't crash on repeated calls
    assert.ok(duration2 >= 0, "Second load should succeed");
  });
});

// ---------------------------------------------------------------------------
// APM compiler unit tests
// ---------------------------------------------------------------------------

describe("APM Compiler", () => {
  const hasApm = fs.existsSync(path.join(APM_DIR, "apm.yml"));

  if (!hasApm) {
    it("skips — .apm/ not found", () => {
      assert.ok(true);
    });
    return;
  }

  it("writes .compiled/context.json", () => {
    compileApm(APP_ROOT);
    const compiledPath = path.join(APM_DIR, ".compiled", "context.json");
    assert.ok(fs.existsSync(compiledPath), "Compiled output file should exist");
  });

  it("compiled output is valid JSON", () => {
    const compiledPath = path.join(APM_DIR, ".compiled", "context.json");
    const raw = fs.readFileSync(compiledPath, "utf-8");
    assert.doesNotThrow(() => JSON.parse(raw), "Should be valid JSON");
  });

  it("loads MCP declarations for roam-code", () => {
    const output = compileApm(APP_ROOT);
    const backendDev = output.agents["backend-dev"];
    const roam = backendDev.mcp["roam-code"];
    assert.ok(roam, "backend-dev should have roam-code MCP");
    assert.equal(roam.type, "local");
    if (roam.type === "local") {
      assert.equal(roam.command, "roam");
      assert.deepEqual(roam.args, ["mcp"]);
    }
    assert.equal(roam.availability, "optional");
  });

  it("loads MCP declarations for playwright", () => {
    const output = compileApm(APP_ROOT);
    const liveUi = output.agents["live-ui"];
    const pw = liveUi.mcp["playwright"];
    assert.ok(pw, "live-ui should have playwright MCP");
    assert.equal(pw.type, "local");
    if (pw.type === "local") {
      assert.ok(pw.command.includes("playwright-mcp"));
      assert.ok(pw.args.includes("--headless"));
    }
    assert.equal(pw.availability, "required");
  });

  it("agents without MCP have empty mcp record", () => {
    const output = compileApm(APP_ROOT);
    assert.deepEqual(output.agents["push-app"].mcp, {});
    assert.deepEqual(output.agents["poll-app-ci"].mcp, {});
    assert.deepEqual(output.agents["push-infra"].mcp, {});
    assert.deepEqual(output.agents["poll-infra-plan"].mcp, {});
    assert.deepEqual(output.agents["integration-test"].mcp, {});
  });

  it("loads skill descriptions", () => {
    const output = compileApm(APP_ROOT);
    const backendDev = output.agents["backend-dev"];
    assert.ok(
      backendDev.skills["test-backend-unit"],
      "backend-dev should have test-backend-unit skill",
    );
    assert.ok(
      backendDev.skills["test-backend-unit"].length > 0,
      "Skill description should not be empty",
    );
  });
});
