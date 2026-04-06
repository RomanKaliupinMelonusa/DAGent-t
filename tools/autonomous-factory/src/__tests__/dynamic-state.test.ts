/**
 * dynamic-state.test.ts — Validates that pipeline-state.mjs bootstraps from
 * context.json and that graph traversal (getDownstream/getUpstream) works.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/__tests__/dynamic-state.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../../pipeline-state.mjs");
const REPO_ROOT = join(__dirname, "../../../..");
const APP_ROOT = join(REPO_ROOT, "apps/sample-app");

const TEST_SLUG = `__test-dynamic-${Date.now()}`;

function runCli(args: string): { exitCode: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync(`node ${SCRIPT} ${args}`, {
      cwd: REPO_ROOT,
      env: { ...process.env, APP_ROOT },
      encoding: "utf-8",
      timeout: 10_000,
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { exitCode: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

function readState(): Record<string, unknown> {
  const p = join(APP_ROOT, "in-progress", `${TEST_SLUG}_STATE.json`);
  return JSON.parse(readFileSync(p, "utf-8"));
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

describe("Dynamic state from context.json", () => {
  before(() => {
    const result = runCli(`init ${TEST_SLUG} Full-Stack`);
    assert.equal(result.exitCode, 0, `Init failed: ${result.stderr}`);
  });

  after(() => {
    const dir = join(APP_ROOT, "in-progress");
    for (const suffix of ["_STATE.json", "_TRANS.md"]) {
      const p = join(dir, `${TEST_SLUG}${suffix}`);
      if (existsSync(p)) rmSync(p);
    }
  });

  it("state has dependencies object", () => {
    const state = readState();
    assert.ok(state.dependencies, "State should have a dependencies object");
    assert.ok(typeof state.dependencies === "object");
  });

  it("state has phases array", () => {
    const state = readState();
    assert.ok(Array.isArray(state.phases), "State should have a phases array");
    assert.ok((state.phases as string[]).length > 0, "Phases should not be empty");
  });

  it("state has nodeTypes object", () => {
    const state = readState();
    assert.ok(state.nodeTypes, "State should have a nodeTypes object");
  });

  it("state has nodeCategories object", () => {
    const state = readState();
    assert.ok(state.nodeCategories, "State should have a nodeCategories object");
  });

  it("all items have corresponding dependency entries", () => {
    const state = readState();
    const items = state.items as Array<{ key: string }>;
    const deps = state.dependencies as Record<string, string[]>;
    for (const item of items) {
      assert.ok(
        item.key in deps,
        `Item "${item.key}" missing from dependencies`,
      );
    }
  });

  it("all items have a nodeCategory", () => {
    const state = readState();
    const items = state.items as Array<{ key: string }>;
    const cats = state.nodeCategories as Record<string, string>;
    for (const item of items) {
      assert.ok(
        item.key in cats,
        `Item "${item.key}" missing from nodeCategories`,
      );
      assert.ok(
        ["dev", "test", "deploy", "finalize"].includes(cats[item.key]),
        `Item "${item.key}" has invalid category "${cats[item.key]}"`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// getDownstream / getUpstream
// ---------------------------------------------------------------------------

describe("getDownstream and getUpstream", () => {
  // Use a simple inline script to call the functions (they aren't CLI commands)
  function callGraphFn(fn: string, seeds: string[]): string[] {
    const seedsJson = JSON.stringify(seeds);
    const stateFilePath = join(APP_ROOT, "in-progress", `${TEST_SLUG}_STATE.json`);
    const script = `
      import { readFileSync } from "node:fs";
      const m = await import("./pipeline-state.mjs");
      const state = JSON.parse(readFileSync("${stateFilePath}", "utf-8"));
      const result = m.${fn}(state, ${seedsJson});
      console.log(JSON.stringify(result));
    `;
    try {
      const stdout = execSync(`node --input-type=module -e '${script}'`, {
        cwd: join(__dirname, "../.."),
        env: { ...process.env, APP_ROOT },
        encoding: "utf-8",
        timeout: 10_000,
      });
      return JSON.parse(stdout.trim());
    } catch {
      return [];
    }
  }

  before(() => {
    // Ensure state exists (from prior describe block's before)
    if (!existsSync(join(APP_ROOT, "in-progress", `${TEST_SLUG}_STATE.json`))) {
      const result = runCli(`init ${TEST_SLUG} Full-Stack`);
      assert.equal(result.exitCode, 0);
    }
  });

  after(() => {
    const dir = join(APP_ROOT, "in-progress");
    for (const suffix of ["_STATE.json", "_TRANS.md"]) {
      const p = join(dir, `${TEST_SLUG}${suffix}`);
      if (existsSync(p)) rmSync(p);
    }
  });

  it("getDownstream returns non-empty for a root node", () => {
    const downstream = callGraphFn("getDownstream", ["backend-dev"]);
    assert.ok(downstream.length > 0, "backend-dev should have downstream items");
  });

  it("getDownstream includes the seed itself", () => {
    const downstream = callGraphFn("getDownstream", ["backend-dev"]);
    assert.ok(downstream.includes("backend-dev"), "Seed should appear in downstream (inclusive BFS)");
  });

  it("getUpstream returns non-empty for a leaf node", () => {
    const upstream = callGraphFn("getUpstream", ["publish-pr"]);
    assert.ok(upstream.length > 0, "publish-pr should have upstream items");
  });

  it("getUpstream includes the seed itself", () => {
    const upstream = callGraphFn("getUpstream", ["publish-pr"]);
    assert.ok(upstream.includes("publish-pr"), "Seed should appear in upstream (inclusive BFS)");
  });
});
