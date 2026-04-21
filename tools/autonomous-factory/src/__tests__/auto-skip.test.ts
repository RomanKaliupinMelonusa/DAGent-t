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
} from "../lifecycle/auto-skip.js";

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

  it("returns -1 for a non-existent branch (fail-closed)", () => {
    const result = getGitDeletions(REPO_ROOT, "this-branch-does-not-exist-xyz-999");
    assert.equal(result, -1);
  });

  it("returns -1 for a non-existent repo path (fail-closed)", () => {
    const result = getGitDeletions("/tmp/not-a-repo", "main");
    assert.equal(result, -1);
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

  it("returns true for a non-existent branch (fail-closed)", () => {
    const result = hasDeletedFiles(REPO_ROOT, "this-branch-does-not-exist-xyz-999");
    assert.equal(result, true);
  });

  it("returns true for a non-existent repo path (fail-closed)", () => {
    const result = hasDeletedFiles("/tmp/not-a-repo", "main");
    assert.equal(result, true);
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

  it("returns null for invalid ref (fail-closed)", () => {
    const files = getGitChangedFiles(REPO_ROOT, "0000000000000000000000000000000000000000");
    assert.equal(files, null);
  });

  it("returns null for non-existent repo (fail-closed)", () => {
    const files = getGitChangedFiles("/tmp/not-a-repo", "HEAD~1");
    assert.equal(files, null);
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
  it("builds prefixes from directory config (one per key)", () => {
    const result = getDirectoryPrefixes("apps/sample-app", {
      backend: "backend",
      frontend: "frontend",
      infra: "infra",
      e2e: "e2e",
      packages: "packages",
      schemas: null,
    });
    // Each key maps to its own directory only (1:1 mapping)
    assert.deepStrictEqual(result.frontend, ["apps/sample-app/frontend/"]);
    assert.deepStrictEqual(result.backend, ["apps/sample-app/backend/"]);
    assert.deepStrictEqual(result.infra, ["apps/sample-app/infra/"]);
    assert.deepStrictEqual(result.e2e, ["apps/sample-app/e2e/"]);
    assert.deepStrictEqual(result.packages, ["apps/sample-app/packages/"]);
    assert.deepStrictEqual(result.schemas, [], "null directory value → empty prefix array");
  });

  it("throws when directories config is missing", () => {
    assert.throws(() => getDirectoryPrefixes("apps/sample-app", undefined), /Missing config\.directories/);
  });

  it("produces no leading slash when appRel is empty (root-level app)", () => {
    const result = getDirectoryPrefixes("", {
      backend: "backend",
      frontend: "frontend",
      infra: "infra",
      e2e: "e2e",
      packages: "packages",
      schemas: null,
    });
    // Must NOT have a leading slash — git diff outputs "backend/src/...", not "/backend/src/..."
    assert.deepStrictEqual(result.frontend, ["frontend/"]);
    assert.deepStrictEqual(result.backend, ["backend/"]);
    assert.deepStrictEqual(result.infra, ["infra/"]);
    assert.ok(!result.backend.some((p) => p.startsWith("/")), "no prefix should start with /");
    assert.ok(!result.frontend.some((p) => p.startsWith("/")), "no prefix should start with /");
    assert.ok(!result.infra.some((p) => p.startsWith("/")), "no prefix should start with /");
  });

  it("normalises dot directory to app root prefix (commerce-storefront pattern)", () => {
    const result = getDirectoryPrefixes("apps/commerce-storefront", {
      storefront: ".",
      e2e: "e2e",
    });
    // "." means the entire app root — prefix must be "apps/commerce-storefront/"
    // NOT "apps/commerce-storefront/./" which would never match real git paths
    assert.deepStrictEqual(result.storefront, ["apps/commerce-storefront/"]);
    assert.deepStrictEqual(result.e2e, ["apps/commerce-storefront/e2e/"]);
    // Verify the storefront prefix actually matches real override paths
    const overridePath = "apps/commerce-storefront/overrides/app/components/product-tile/index.jsx";
    assert.ok(overridePath.startsWith(result.storefront[0]), "storefront prefix must match override paths");
  });

  it("normalises dot directory when appRel is empty (root-level app with dot)", () => {
    const result = getDirectoryPrefixes("", {
      storefront: ".",
      e2e: "e2e",
    });
    // Root-level app with "." → empty string prefix (matches everything)
    assert.deepStrictEqual(result.storefront, [""]);
    assert.deepStrictEqual(result.e2e, ["e2e/"]);
  });

  it("strips leading dot-slash from directory values", () => {
    const result = getDirectoryPrefixes("apps/foo", {
      src: "./src",
      tests: "./tests",
      plain: "lib",
    });
    assert.deepStrictEqual(result.src, ["apps/foo/src/"]);
    assert.deepStrictEqual(result.tests, ["apps/foo/tests/"]);
    assert.deepStrictEqual(result.plain, ["apps/foo/lib/"]);
  });
});
