/**
 * compiler-freshness-prefix.test.ts — Phase B regression guard.
 *
 * The Copilot SDK delivers MCP tool names server-prefixed
 * (`<server>-<tool>`) to `hooks.onPreToolUse`. Per-server runtime config
 * keeps bare tool names (it's a property of the server config), but the
 * per-agent `freshnessRefreshTools` set consumed by the harness gate is
 * aggregated and prefixed at compile time so the gate can use a plain
 * `Set.has(toolName)` against the SDK-delivered name without learning a
 * translation table.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

import { compileApm } from "../compiler.js";

function writeFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apm-freshness-prefix-"));
  const apmDir = path.join(root, ".apm");
  fs.mkdirSync(path.join(apmDir, "instructions/always"), { recursive: true });
  fs.mkdirSync(path.join(apmDir, "agents"), { recursive: true });
  fs.mkdirSync(path.join(apmDir, "mcp"), { recursive: true });

  fs.writeFileSync(path.join(apmDir, "instructions/always/common.md"), "# always\n");
  fs.writeFileSync(path.join(apmDir, "agents/dev.agent.md"), "You are dev.\n");

  fs.writeFileSync(
    path.join(apmDir, "mcp", "roam-code.mcp.yml"),
    yaml.dump({
      name: "roam-code",
      description: "fixture indexer",
      type: "local",
      command: "true",
      args: [],
      tools: ["*"],
      availability: "optional",
      freshness: {
        requires_index_refresh: ["roam_review_change", "roam_dead_code"],
      },
    }),
  );

  fs.writeFileSync(
    path.join(apmDir, "apm.yml"),
    yaml.dump({
      name: "fixture",
      version: "1.0.0",
      description: "",
      tokenBudget: 8000,
      agents: {
        dev: {
          instructions: ["always"],
          promptFile: "dev.agent.md",
          mcp: ["roam-code"],
          skills: [],
          toolLimits: { soft: 10, hard: 20 },
          security: {},
          tools: { core: ["read_file"] },
        },
      },
      nodes: {
        dev: { type: "agent", category: "dev", agent: "@dev", timeout_minutes: 5 },
      },
    }),
  );

  fs.writeFileSync(
    path.join(apmDir, "workflows.yml"),
    yaml.dump({
      default: {
        description: "fixture",
        nodes: { dev: { depends_on: [] } },
      },
    }),
  );

  return root;
}

describe("APM compiler freshness-tool prefixing", () => {
  const root = writeFixture();
  const out = compileApm(root);
  const dev = out.agents["dev"];

  it("prefixes per-agent freshnessRefreshTools with the MCP server name", () => {
    assert.deepEqual(
      [...dev.freshnessRefreshTools].sort(),
      ["roam-code-roam_dead_code", "roam-code-roam_review_change"],
      "expected per-agent freshnessRefreshTools to be `<serverName>-<toolName>`",
    );
  });

  it("preserves bare tool names in the per-server runtime config", () => {
    const server = dev.mcp["roam-code"];
    assert.ok(server, "expected roam-code in agent's mcp config");
    assert.deepEqual(
      [...server.freshnessRefreshTools].sort(),
      ["roam_dead_code", "roam_review_change"],
      "per-server config must keep bare tool names — it's a property of the server",
    );
  });
});
