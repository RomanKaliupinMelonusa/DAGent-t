/**
 * Tests for Phase A.4 — read-scope enforcement in checkRbac.
 *
 * Complements the existing write-path tests in harness.test.ts.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkRbac } from "../harness/rbac.js";
import { resolveAgentSandbox } from "../harness/sandbox.js";
import type { ApmCompiledOutput } from "../apm/types.js";

const REPO_ROOT = "/workspaces/DAGent-t";
const APP_ROOT = "/workspaces/DAGent-t/apps/commerce-storefront";
const E2E_WRITE = [/^e2e\//];
const NO_CMD: RegExp[] = [];
const NO_MCP = new Set<string>();

// Allowed read list modelled on the apm.yml profile for @e2e-author.
const SDET_READS = [
  /^\.dagent\/[^/]+\/_kickoff\/(spec|acceptance)\./,
  /^e2e\//,
  /(^|\/)package\.json$/,
];

describe("checkRbac — read-scope enforcement", () => {
  it("allows read_file when target matches allowedReadPaths", () => {
    const d = checkRbac(
      "read_file",
      { filePath: "apps/commerce-storefront/.dagent/feat/_kickoff/acceptance.yml" },
      REPO_ROOT, E2E_WRITE, NO_CMD, NO_MCP, APP_ROOT, undefined, SDET_READS,
    );
    assert.equal(d, null);
  });

  it("allows reads under e2e/", () => {
    const d = checkRbac(
      "read_file",
      { filePath: "apps/commerce-storefront/e2e/storefront-smoke.spec.ts" },
      REPO_ROOT, E2E_WRITE, NO_CMD, NO_MCP, APP_ROOT, undefined, SDET_READS,
    );
    assert.equal(d, null);
  });

  it("denies reads of feature source under overrides/", () => {
    const d = checkRbac(
      "read_file",
      { filePath: "apps/commerce-storefront/overrides/app/components/quick-view/index.jsx" },
      REPO_ROOT, E2E_WRITE, NO_CMD, NO_MCP, APP_ROOT, undefined, SDET_READS,
    );
    assert.ok(d && /Read Access Denied/.test(d), d ?? "expected denial");
  });

  it("denies reads of config/", () => {
    const d = checkRbac(
      "read_file",
      { filePath: "apps/commerce-storefront/config/default.js" },
      REPO_ROOT, E2E_WRITE, NO_CMD, NO_MCP, APP_ROOT, undefined, SDET_READS,
    );
    assert.ok(d && /Read Access Denied/.test(d));
  });

  it("is a no-op when allowedReadPaths is undefined (no enforcement)", () => {
    const d = checkRbac(
      "read_file",
      { filePath: "apps/commerce-storefront/overrides/app/components/thing.jsx" },
      REPO_ROOT, E2E_WRITE, NO_CMD, NO_MCP, APP_ROOT, undefined, undefined,
    );
    assert.equal(d, null);
  });

  it("enforces on `view` tool as well", () => {
    const d = checkRbac(
      "view",
      { path: "apps/commerce-storefront/app/pages/home.jsx" },
      REPO_ROOT, E2E_WRITE, NO_CMD, NO_MCP, APP_ROOT, undefined, SDET_READS,
    );
    assert.ok(d && /Read Access Denied/.test(d));
  });

  it("does not enforce on grep_search (directory-scope tool)", () => {
    const d = checkRbac(
      "grep_search",
      { pattern: "data-testid", path: "apps/commerce-storefront/overrides" },
      REPO_ROOT, E2E_WRITE, NO_CMD, NO_MCP, APP_ROOT, undefined, SDET_READS,
    );
    assert.equal(d, null);
  });
});

describe("resolveAgentSandbox — allowedReadPaths compilation", () => {
  function ctxWith(security: object | undefined): ApmCompiledOutput {
    return {
      agents: {
        sdet: {
          rules: "", tokenCount: 0, mcp: {}, skills: {},
          systemPromptTemplate: "",
          ...(security ? { security } : {}),
        },
      },
    } as unknown as ApmCompiledOutput;
  }

  it("leaves allowedReadPaths undefined when security block omits it", () => {
    const sb = resolveAgentSandbox("sdet", ctxWith({ allowedWritePaths: ["^e2e/"] }), APP_ROOT);
    assert.equal(sb.allowedReadPaths, undefined);
  });

  it("compiles allowedReadPaths regexes when present", () => {
    const sb = resolveAgentSandbox("sdet", ctxWith({
      allowedWritePaths: ["^e2e/"],
      allowedReadPaths: ["^e2e/", "^.dagent/.*\\.yml$"],
    }), APP_ROOT);
    assert.ok(Array.isArray(sb.allowedReadPaths));
    assert.equal(sb.allowedReadPaths!.length, 2);
    assert.ok(sb.allowedReadPaths![0].test("e2e/foo.spec.ts"));
    assert.ok(sb.allowedReadPaths![1].test(".dagent/feat/_kickoff/acceptance.yml"));
    assert.ok(!sb.allowedReadPaths![0].test("overrides/app/thing.jsx"));
  });

  it("treats empty allowedReadPaths array as enforcement-on (deny-all)", () => {
    const sb = resolveAgentSandbox("sdet", ctxWith({
      allowedWritePaths: ["^e2e/"],
      allowedReadPaths: [],
    }), APP_ROOT);
    assert.ok(Array.isArray(sb.allowedReadPaths));
    assert.equal(sb.allowedReadPaths!.length, 0);
    // checkRbac with empty list → every read denied.
    const d = checkRbac(
      "read_file",
      { filePath: "apps/commerce-storefront/e2e/x.spec.ts" },
      REPO_ROOT, E2E_WRITE, NO_CMD, NO_MCP, APP_ROOT, undefined, sb.allowedReadPaths,
    );
    assert.ok(d && /Read Access Denied/.test(d));
  });
});
