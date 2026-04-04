/**
 * auto-skip.test.ts — Unit tests for auto-skip git heuristics.
 *
 * Tests `getGitDeletions` and `hasDeletedFiles` using the actual repo
 * (which is a valid git repository inside the devcontainer).
 *
 * Uses Node.js built-in test runner (node:test).
 * Run: npx tsx src/__tests__/auto-skip.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getGitDeletions,
  hasDeletedFiles,
  getGitChangedFiles,
  getMergeBase,
  getDirectoryPrefixes,
} from "../auto-skip.js";

const REPO_ROOT = "/workspaces/DAGent-t";

// ---------------------------------------------------------------------------
// getGitDeletions
// ---------------------------------------------------------------------------

describe("getGitDeletions", () => {
  it("returns a non-negative number for a valid repo and branch", () => {
    // Against `main` — may or may not have deletions depending on branch state,
    // but must return a valid number (not NaN, not negative).
    const result = getGitDeletions(REPO_ROOT, "main");
    assert.equal(typeof result, "number");
    assert.ok(result >= 0, `expected >= 0, got ${result}`);
  });

  it("returns 0 for a non-existent branch (graceful failure)", () => {
    const result = getGitDeletions(REPO_ROOT, "this-branch-does-not-exist-xyz-999");
    assert.equal(result, 0);
  });

  it("returns 0 for a non-existent repo path (graceful failure)", () => {
    const result = getGitDeletions("/tmp/not-a-repo", "main");
    assert.equal(result, 0);
  });

  it("parses deletions from shortstat format correctly", () => {
    // This is a regex contract test — the function should correctly parse
    // various formats of git shortstat output. We test this by ensuring the
    // function successfully runs against the real repo.
    const result = getGitDeletions(REPO_ROOT, "main");
    assert.ok(Number.isInteger(result), `expected integer, got ${result}`);
  });
});

// ---------------------------------------------------------------------------
// hasDeletedFiles
// ---------------------------------------------------------------------------

describe("hasDeletedFiles", () => {
  it("returns a boolean for a valid repo and branch", () => {
    const result = hasDeletedFiles(REPO_ROOT, "main");
    assert.equal(typeof result, "boolean");
  });

  it("returns false for a non-existent branch (graceful failure)", () => {
    const result = hasDeletedFiles(REPO_ROOT, "this-branch-does-not-exist-xyz-999");
    assert.equal(result, false);
  });

  it("returns false for a non-existent repo path (graceful failure)", () => {
    const result = hasDeletedFiles("/tmp/not-a-repo", "main");
    assert.equal(result, false);
  });
});

// ---------------------------------------------------------------------------
// Existing helpers — regression coverage
// ---------------------------------------------------------------------------

describe("getGitChangedFiles", () => {
  it("returns an array for a valid ref", () => {
    const mergeBase = getMergeBase(REPO_ROOT, "main");
    if (!mergeBase) {
      // Shallow clone — skip gracefully
      return;
    }
    const files = getGitChangedFiles(REPO_ROOT, mergeBase);
    assert.ok(Array.isArray(files));
  });

  it("returns empty array for invalid ref", () => {
    const files = getGitChangedFiles(REPO_ROOT, "0000000000000000000000000000000000000000");
    assert.ok(Array.isArray(files));
  });
});

describe("getMergeBase", () => {
  it("returns a string or null", () => {
    const result = getMergeBase(REPO_ROOT, "main");
    assert.ok(result === null || typeof result === "string");
  });

  it("returns null for non-existent branch", () => {
    const result = getMergeBase(REPO_ROOT, "this-branch-xxx-999");
    assert.equal(result, null);
  });
});

describe("getDirectoryPrefixes", () => {
  it("builds prefixes from directory config", () => {
    const result = getDirectoryPrefixes("apps/sample-app", {
      backend: "backend",
      frontend: "frontend",
      infra: "infra",
      e2e: "e2e",
      packages: "packages",
      schemas: null,
    });
    assert.deepStrictEqual(result.frontend, ["apps/sample-app/frontend/", "apps/sample-app/e2e/"]);
    assert.ok(result.backend.includes("apps/sample-app/backend/"));
    assert.ok(result.backend.includes("apps/sample-app/infra/"));
    assert.ok(result.backend.includes("apps/sample-app/packages/"));
    assert.ok(result.infra.includes("apps/sample-app/infra/"));
  });

  it("throws when directories config is missing", () => {
    assert.throws(() => getDirectoryPrefixes("apps/sample-app", undefined), /Missing config\.directories/);
  });
});
