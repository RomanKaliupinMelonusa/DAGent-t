import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveAgentSandbox } from "../agent-sandbox.js";
import type { ApmCompiledOutput } from "../apm/types.js";

function makeContext(overrides?: Partial<ApmCompiledOutput>): ApmCompiledOutput {
  return {
    agents: {},
    config: {},
    ...overrides,
  } as ApmCompiledOutput;
}

describe("resolveAgentSandbox", () => {
  it("returns migration-mode defaults when no security profile exists", () => {
    const ctx = makeContext({
      agents: { "dev-backend": {} } as any,
    });
    const sandbox = resolveAgentSandbox("dev-backend", ctx, "/app");
    assert.equal(sandbox.hasSecurityProfile, false);
    assert.equal(sandbox.allowedWritePaths.length, 1);
    assert.ok(sandbox.allowedWritePaths[0].test("anything/goes"));
    assert.equal(sandbox.blockedCommandRegexes.length, 0);
  });

  it("compiles allowedWritePaths from string patterns", () => {
    const ctx = makeContext({
      agents: {
        "dev-backend": {
          security: {
            allowedWritePaths: ["^backend/", "^packages/schemas/"],
            blockedCommandRegexes: [],
          },
        },
      } as any,
    });
    const sandbox = resolveAgentSandbox("dev-backend", ctx, "/app");
    assert.equal(sandbox.hasSecurityProfile, true);
    assert.equal(sandbox.allowedWritePaths.length, 2);
    assert.ok(sandbox.allowedWritePaths[0].test("backend/src/index.ts"));
    assert.ok(!sandbox.allowedWritePaths[0].test("frontend/src/app.tsx"));
  });

  it("returns read-only when allowedWritePaths is empty", () => {
    const ctx = makeContext({
      agents: {
        "docs-archived": {
          security: { allowedWritePaths: [], blockedCommandRegexes: [] },
        },
      } as any,
    });
    const sandbox = resolveAgentSandbox("docs-archived", ctx, "/app");
    assert.equal(sandbox.hasSecurityProfile, true);
    assert.equal(sandbox.allowedWritePaths.length, 0);
  });

  it("extracts safeMcpPrefixes from fsMutator: false", () => {
    const ctx = makeContext({
      agents: {
        "live-ui": {
          mcp: {
            playwright: { fsMutator: false },
            "roam-code": { fsMutator: true },
          },
        },
      } as any,
    });
    const sandbox = resolveAgentSandbox("live-ui", ctx, "/app");
    assert.ok(sandbox.safeMcpPrefixes.has("playwright-"));
    assert.ok(!sandbox.safeMcpPrefixes.has("roam-code-"));
  });

  it("handles MCP tool wildcard", () => {
    const ctx = makeContext({
      agents: {
        "dev-backend": {
          tools: {
            core: ["read_file", "write_file"],
            mcp: { "roam-code": "*" },
          },
        },
      } as any,
    });
    const sandbox = resolveAgentSandbox("dev-backend", ctx, "/app");
    assert.ok(sandbox.allowedCoreTools.has("read_file"));
    assert.ok(sandbox.allowedCoreTools.has("write_file"));
    assert.ok(sandbox.allowedMcpTools.has("*"));
  });
});
