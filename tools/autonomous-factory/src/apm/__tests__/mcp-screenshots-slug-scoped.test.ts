/**
 * apm/__tests__/mcp-screenshots-slug-scoped.test.ts
 *
 * Regression test for the slug-scoped Playwright MCP screenshots fix.
 *
 * Contract:
 *   - `resolveMcpPlaceholders` (called from `getAgentConfig`) substitutes
 *     `{repoRoot}`, `{appRoot}`, `{slug}`, and `{invocationDir}` in MCP
 *     command/args strings.
 *   - When `{invocationDir}` is referenced in any MCP arg, the resolved
 *     path lands under
 *     `<appRoot>/.dagent/<slug>/<itemKey>/<invocationId>/...`
 *     (per `ports/invocation-filesystem.ts` layout).
 *   - Unsafe values for any substituted path are rejected before
 *     materialising into the SDK config.
 *   - When the agent declares `{invocationDir}` but no invocationDir was
 *     populated in the context, resolution throws (no silent fall-through
 *     to a literal `{invocationDir}` string in the MCP args).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAgentConfig, type AgentContext } from "../agents.js";
import type { ApmCompiledOutput } from "../types.js";

const APP_ROOT = "/repo/apps/sample-app";
const REPO_ROOT = "/repo";
const SLUG = "product-quick-view-plp";
const NODE_KEY = "frontend-unit-test";
const INVOCATION_ID = "inv_01h0000000000000000000000a";
const INVOCATION_DIR = `${APP_ROOT}/.dagent/${SLUG}/${NODE_KEY}/${INVOCATION_ID}`;

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    featureSlug: SLUG,
    specPath: `${APP_ROOT}/.dagent/${SLUG}/_kickoff/spec.md`,
    deployedUrl: null,
    workflowName: "storefront",
    repoRoot: REPO_ROOT,
    appRoot: APP_ROOT,
    itemKey: NODE_KEY,
    baseBranch: "main",
    invocationDir: INVOCATION_DIR,
    ...overrides,
  };
}

function makeApmContext(
  args: string[],
  command = "{repoRoot}/node_modules/.bin/playwright-mcp",
): ApmCompiledOutput {
  return {
    agents: {
      [NODE_KEY]: {
        systemPromptTemplate: "no-op",
        rules: "",
        mcp: {
          playwright: {
            type: "local",
            command,
            args,
            tools: ["*"],
            cwd: "{appRoot}",
          },
        },
      },
    },
    workflows: {
      storefront: {
        nodes: {
          [NODE_KEY]: { consumes_artifacts: [] },
        },
      },
    },
  } as unknown as ApmCompiledOutput;
}

describe("MCP placeholder resolution — slug + invocationDir", () => {
  it("substitutes {invocationDir} into the Playwright --output-dir arg", () => {
    const apm = makeApmContext([
      "--headless",
      "--output-dir",
      "{invocationDir}/outputs/screenshots",
    ]);
    const ctx = makeContext();
    const cfg = getAgentConfig(NODE_KEY, ctx, apm);
    const playwright = cfg.mcpServers?.playwright;
    assert.ok(playwright && playwright.type === "local");
    assert.deepEqual(playwright.args, [
      "--headless",
      "--output-dir",
      `${INVOCATION_DIR}/outputs/screenshots`,
    ]);
    // The resolved path MUST live under <slug>/<nodeKey>/<inv>/... and
    // MUST NOT equal the legacy shared `<appRoot>/.dagent/screenshots`.
    const outputDir = playwright.args[2];
    assert.ok(
      outputDir.startsWith(`${APP_ROOT}/.dagent/${SLUG}/${NODE_KEY}/`),
      `output-dir ${outputDir} is not slug+invocation scoped`,
    );
    assert.ok(
      !outputDir.includes("/.dagent/screenshots"),
      `output-dir leaked to legacy shared path: ${outputDir}`,
    );
  });

  it("substitutes {slug} independently of {invocationDir}", () => {
    const apm = makeApmContext(["--name", "feature-{slug}"]);
    const cfg = getAgentConfig(NODE_KEY, makeContext(), apm);
    const playwright = cfg.mcpServers?.playwright;
    assert.ok(playwright && playwright.type === "local");
    assert.deepEqual(playwright.args, ["--name", `feature-${SLUG}`]);
  });

  it("throws when an MCP arg references {invocationDir} but context omits it", () => {
    const apm = makeApmContext(["--output-dir", "{invocationDir}/outputs/screenshots"]);
    const ctx = makeContext({ invocationDir: undefined });
    assert.throws(
      () => getAgentConfig(NODE_KEY, ctx, apm),
      /\{invocationDir\}/,
    );
  });

  it("rejects unsafe slug values before materialising into MCP args", () => {
    const apm = makeApmContext(["--output-dir", "{invocationDir}/outputs/screenshots"]);
    const ctx = makeContext({ featureSlug: "bad slug;rm -rf" });
    assert.throws(
      () => getAgentConfig(NODE_KEY, ctx, apm),
      /Unsafe slug path/,
    );
  });

  it("rejects unsafe invocationDir values", () => {
    const apm = makeApmContext(["--output-dir", "{invocationDir}/outputs/screenshots"]);
    const ctx = makeContext({ invocationDir: '"; touch pwn"' });
    assert.throws(
      () => getAgentConfig(NODE_KEY, ctx, apm),
      /Unsafe invocationDir path/,
    );
  });

  it("does not require {invocationDir} when no MCP arg references it", () => {
    const apm = makeApmContext(["--headless"]);
    const ctx = makeContext({ invocationDir: undefined });
    const cfg = getAgentConfig(NODE_KEY, ctx, apm);
    assert.deepEqual(cfg.mcpServers?.playwright?.type === "local"
      ? cfg.mcpServers.playwright.args
      : null, ["--headless"]);
  });
});
