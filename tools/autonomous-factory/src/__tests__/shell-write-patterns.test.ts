/**
 * shell-write-patterns.test.ts — Unit tests for shell-based file write detection.
 *
 * Validates that SHELL_WRITE_PATTERNS + extractShellWrittenFiles() correctly
 * identify file paths written by common shell commands (sed -i, tee, echo >,
 * cat >, cp, mv, printf >) and ignore read-only commands.
 *
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 * Run: npx tsx src/__tests__/shell-write-patterns.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SHELL_WRITE_PATTERNS, extractShellWrittenFiles } from "../tool-harness.js";

const REPO_ROOT = "/workspaces/DAGent-t";

// ---------------------------------------------------------------------------
// SHELL_WRITE_PATTERNS constant
// ---------------------------------------------------------------------------

describe("SHELL_WRITE_PATTERNS", () => {
  it("is a non-empty array of RegExp", () => {
    assert.ok(Array.isArray(SHELL_WRITE_PATTERNS));
    assert.ok(SHELL_WRITE_PATTERNS.length > 0);
    for (const p of SHELL_WRITE_PATTERNS) {
      assert.ok(p instanceof RegExp, `Expected RegExp, got ${typeof p}`);
    }
  });
});

// ---------------------------------------------------------------------------
// extractShellWrittenFiles
// ---------------------------------------------------------------------------

describe("extractShellWrittenFiles", () => {
  // --- Positive cases: should detect file writes ---

  it("detects sed -i with single quotes", () => {
    const files = extractShellWrittenFiles(
      "sed -i 's/old/new/g' apps/sample-app/backend/src/index.ts",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/backend/src/index.ts"]);
  });

  it("detects sed -i with double quotes", () => {
    const files = extractShellWrittenFiles(
      `sed -i "s/old/new/g" apps/sample-app/frontend/src/app/page.tsx`,
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/frontend/src/app/page.tsx"]);
  });

  it("detects tee (overwrite)", () => {
    const files = extractShellWrittenFiles(
      "echo content | tee apps/sample-app/config.json",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/config.json"]);
  });

  it("detects tee -a (append)", () => {
    const files = extractShellWrittenFiles(
      "echo line | tee -a apps/sample-app/log.txt",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/log.txt"]);
  });

  it("detects cat > (redirect)", () => {
    const files = extractShellWrittenFiles(
      "cat > apps/sample-app/output.json",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/output.json"]);
  });

  it("detects echo > (redirect)", () => {
    const files = extractShellWrittenFiles(
      "echo 'hello world' > apps/sample-app/hello.txt",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/hello.txt"]);
  });

  it("detects echo >> (append)", () => {
    const files = extractShellWrittenFiles(
      "echo 'appended' >> apps/sample-app/hello.txt",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/hello.txt"]);
  });

  it("detects printf >", () => {
    const files = extractShellWrittenFiles(
      `printf '%s\\n' "data" > apps/sample-app/data.txt`,
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/data.txt"]);
  });

  it("detects cp", () => {
    const files = extractShellWrittenFiles(
      "cp apps/sample-app/src/old.ts apps/sample-app/src/new.ts",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/src/new.ts"]);
  });

  it("detects cp -r", () => {
    const files = extractShellWrittenFiles(
      "cp -r apps/sample-app/src apps/sample-app/src-backup",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/src-backup"]);
  });

  it("detects mv", () => {
    const files = extractShellWrittenFiles(
      "mv apps/sample-app/old.ts apps/sample-app/new.ts",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/new.ts"]);
  });

  // --- Negative cases: should NOT detect file reads or unrelated commands ---

  it("ignores cat without redirect (read-only)", () => {
    const files = extractShellWrittenFiles("cat apps/sample-app/config.json", REPO_ROOT);
    assert.deepStrictEqual(files, []);
  });

  it("ignores echo without redirect", () => {
    const files = extractShellWrittenFiles("echo 'hello world'", REPO_ROOT);
    assert.deepStrictEqual(files, []);
  });

  it("ignores grep (read-only)", () => {
    const files = extractShellWrittenFiles(
      "grep -r 'pattern' apps/sample-app/",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, []);
  });

  it("ignores ls (read-only)", () => {
    const files = extractShellWrittenFiles("ls -la apps/sample-app/", REPO_ROOT);
    assert.deepStrictEqual(files, []);
  });

  it("ignores npm/npx commands", () => {
    const files = extractShellWrittenFiles("npx jest --verbose", REPO_ROOT);
    assert.deepStrictEqual(files, []);
  });

  it("ignores git commands", () => {
    const files = extractShellWrittenFiles("git add apps/sample-app/src/index.ts", REPO_ROOT);
    assert.deepStrictEqual(files, []);
  });

  // --- Edge cases ---

  it("excludes _STATE.json from results", () => {
    const files = extractShellWrittenFiles(
      "echo '{}' > apps/sample-app/in-progress/slug_STATE.json",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, []);
  });

  it("excludes _TRANS.md from results", () => {
    const files = extractShellWrittenFiles(
      "echo 'log' >> apps/sample-app/in-progress/slug_TRANS.md",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, []);
  });

  it("handles empty command", () => {
    const files = extractShellWrittenFiles("", REPO_ROOT);
    assert.deepStrictEqual(files, []);
  });

  it("handles command with pipes before the write", () => {
    const files = extractShellWrittenFiles(
      "jq '.key' input.json | tee apps/sample-app/output.json",
      REPO_ROOT,
    );
    assert.deepStrictEqual(files, ["apps/sample-app/output.json"]);
  });
});
