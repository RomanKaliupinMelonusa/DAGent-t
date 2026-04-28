/**
 * agent-branch-stash-exclude.test.ts — Phase C2 regression guard.
 *
 * `agent-branch.sh create-feature` previously ran
 *   git stash --include-untracked
 * which `unlink(2)`s any untracked file under `.dagent/` — including the
 * orchestrator's open `_events.jsonl`. The logger then keeps writing to an
 * orphan inode while `git stash pop` materialises a *new* inode at the same
 * path, silently truncating the on-disk log.
 *
 * The fix excludes `**\/.dagent/**` from the stash. This test asserts that
 * any pre-existing `.dagent/<slug>/<file>` retains its inode across a
 * `create-feature` invocation, while regular untracked source files still
 * round-trip through the stash.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const REAL_BRANCH_SCRIPT = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "agent-branch.sh",
);

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.com",
    },
  }).trim();
}

function setupRepo(): { repoRoot: string; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), "agent-branch-stash-"));
  const repoRoot = join(tmp, "repo");
  mkdirSync(repoRoot);
  git(repoRoot, ["init", "-b", "main", "-q"]);
  writeFileSync(join(repoRoot, "README.md"), "init\n");
  git(repoRoot, ["add", "README.md"]);
  git(repoRoot, ["commit", "-q", "-m", "init"]);

  // Bare remote so `agent-branch.sh create-feature` can pull origin/main.
  const remoteRoot = join(tmp, "remote.git");
  execFileSync("git", ["init", "--bare", "-q", remoteRoot]);
  git(repoRoot, ["remote", "add", "origin", remoteRoot]);
  git(repoRoot, ["push", "-q", "-u", "origin", "main"]);
  return { repoRoot, tmp };
}

let cleanups: string[] = [];
beforeEach(() => { cleanups = []; });
afterEach(() => {
  for (const dir of cleanups) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

describe("agent-branch.sh create-feature stash exclusion", () => {
  it("preserves .dagent/ inode and round-trips untracked source files", () => {
    const { repoRoot, tmp } = setupRepo();
    cleanups.push(tmp);

    // Untracked .dagent telemetry file — must NOT be stashed (inode must survive).
    const dagentDir = join(repoRoot, ".dagent", "test-slug");
    mkdirSync(dagentDir, { recursive: true });
    const eventsPath = join(dagentDir, "_events.jsonl");
    writeFileSync(eventsPath, '{"k":"pre"}\n');
    const inoBefore = statSync(eventsPath).ino;

    // Untracked tracked-source file — must round-trip through the stash.
    const srcDir = join(repoRoot, "src");
    mkdirSync(srcDir, { recursive: true });
    const srcPath = join(srcDir, "code.txt");
    writeFileSync(srcPath, "hello\n");

    execFileSync("bash", [REAL_BRANCH_SCRIPT, "create-feature", "test-slug"], {
      cwd: repoRoot,
      env: { ...process.env, BASE_BRANCH: "main", GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // .dagent file must exist with the same inode AND original content.
    assert.ok(existsSync(eventsPath), "_events.jsonl should still exist");
    const inoAfter = statSync(eventsPath).ino;
    assert.equal(
      inoAfter,
      inoBefore,
      `_events.jsonl inode rotated (before=${inoBefore} after=${inoAfter}) — stash unlinked the file`,
    );
    assert.equal(readFileSync(eventsPath, "utf-8"), '{"k":"pre"}\n');

    // src file must have round-tripped through the stash and still be on disk.
    assert.ok(existsSync(srcPath), "src/code.txt should round-trip via stash pop");
    assert.equal(readFileSync(srcPath, "utf-8"), "hello\n");

    // We must be on the new feature branch.
    const branch = git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    assert.equal(branch, "feature/test-slug");
  });
});
