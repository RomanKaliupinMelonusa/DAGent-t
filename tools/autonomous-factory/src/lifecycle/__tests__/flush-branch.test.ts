/**
 * flush-branch.test.ts — A2 contract for the terminal flush hook.
 *
 * Each test sets up a real (but tiny) git repo in a temp dir so the
 * underlying `git rev-parse` / `git rev-list` calls inside flushFeatureBranch
 * exercise the same code paths they will in production.
 *
 * Cases:
 *   1. up-to-date branch        → skipped:"no-commits-ahead", no push
 *   2. wrong branch (on base)   → skipped:"wrong-branch"
 *   3. not a git repo           → skipped:"not-a-repo"
 *   4. push fails (no remote)   → status:"failed", returns cleanly
 *   5. happy path (bare remote) → status:"pushed", remote ref exists
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { flushFeatureBranch } from "../flush-branch.js";

// The flush shells `tools/autonomous-factory/agent-branch.sh push` from the
// repoRoot it's given. To exercise the real script in tests, every test sets
// up a tmp `repoRoot` containing a copy of agent-branch.sh at that path.
const REAL_BRANCH_SCRIPT = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "agent-branch.sh",
);
const REAL_COMMIT_SCRIPT = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "agent-commit.sh",
);

interface RecordedEvent { category: string; data: Record<string, unknown> }
interface RecordingLogger {
  events: RecordedEvent[];
  warnings: string[];
  event(category: string, _key: string | null, data?: Record<string, unknown>): void;
  warn(message: string): void;
  info(_message: string): void;
}

function makeLogger(): RecordingLogger {
  const events: RecordedEvent[] = [];
  const warnings: string[] = [];
  return {
    events,
    warnings,
    event(category, _key, data) { events.push({ category, data: data ?? {} }); },
    warn(message) { warnings.push(message); },
    info() {},
  };
}

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

function setupRepo(opts: { withBranch: boolean; withCommit: boolean; withRemote: "none" | "bare" }): {
  repoRoot: string; remoteRoot: string | null;
} {
  const tmp = mkdtempSync(join(tmpdir(), "flush-branch-"));
  const repoRoot = join(tmp, "repo");
  mkdirSync(repoRoot);
  git(repoRoot, ["init", "-b", "main", "-q"]);
  // Initial commit on main so `main..HEAD` is computable.
  writeFileSync(join(repoRoot, "README.md"), "init\n");
  git(repoRoot, ["add", "README.md"]);
  git(repoRoot, ["commit", "-q", "-m", "init"]);

  // Drop the real agent-branch.sh + agent-commit.sh into the expected
  // path so flushFeatureBranch can shell out to them. Commit them onto
  // `main` so the working tree is clean before any feature branch is
  // checked out — otherwise the new dirty-tree commit step would treat
  // the wrappers themselves as stranded changes.
  const toolsDir = join(repoRoot, "tools", "autonomous-factory");
  mkdirSync(toolsDir, { recursive: true });
  cpSync(REAL_BRANCH_SCRIPT, join(toolsDir, "agent-branch.sh"));
  cpSync(REAL_COMMIT_SCRIPT, join(toolsDir, "agent-commit.sh"));
  git(repoRoot, ["add", "tools"]);
  git(repoRoot, ["commit", "-q", "-m", "tools"]);

  let remoteRoot: string | null = null;
  if (opts.withRemote === "bare") {
    remoteRoot = join(tmp, "remote.git");
    execFileSync("git", ["init", "--bare", "-q", remoteRoot]);
    git(repoRoot, ["remote", "add", "origin", remoteRoot]);
  }

  if (opts.withBranch) {
    git(repoRoot, ["checkout", "-q", "-b", "feature/foo"]);
    if (opts.withCommit) {
      writeFileSync(join(repoRoot, "feature.txt"), "x\n");
      git(repoRoot, ["add", "feature.txt"]);
      git(repoRoot, ["commit", "-q", "-m", "feat"]);
    }
  }
  return { repoRoot, remoteRoot };
}

let cleanups: string[] = [];
beforeEach(() => { cleanups = []; });
afterEach(() => {
  for (const dir of cleanups) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

function track(repoRoot: string): void { cleanups.push(resolve(repoRoot, "..")); }

describe("flushFeatureBranch", () => {
  it("skips with no-commits-ahead when branch is up-to-date with base", async () => {
    // Branch exists but has zero commits ahead of main.
    const { repoRoot } = setupRepo({ withBranch: true, withCommit: false, withRemote: "none" });
    track(repoRoot);
    const logger = makeLogger();
    await flushFeatureBranch({
      slug: "foo", appRoot: repoRoot, repoRoot, baseBranch: "main", logger,
    });
    const pushEvent = logger.events.find((e) => e.category === "pipeline.flush.push");
    assert.ok(pushEvent, "expected pipeline.flush.push event");
    assert.equal(pushEvent.data.skipped, "no-commits-ahead");
    assert.equal(logger.warnings.length, 0);
  });

  it("skips with wrong-branch when current branch != feature/<slug>", async () => {
    // Stay on `main` — never check out a feature branch.
    const { repoRoot } = setupRepo({ withBranch: false, withCommit: false, withRemote: "none" });
    track(repoRoot);
    const logger = makeLogger();
    await flushFeatureBranch({
      slug: "foo", appRoot: repoRoot, repoRoot, baseBranch: "main", logger,
    });
    assert.equal(logger.events[0].data.skipped, "wrong-branch");
    assert.equal(logger.events[0].data.branch, "main");
    assert.equal(logger.warnings.length, 0);
  });

  it("skips with not-a-repo when repoRoot is not a git work-tree", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "flush-branch-"));
    cleanups.push(tmp);
    const logger = makeLogger();
    await flushFeatureBranch({
      slug: "foo", appRoot: tmp, repoRoot: tmp, baseBranch: "main", logger,
    });
    assert.equal(logger.events[0].data.skipped, "not-a-repo");
    assert.equal(logger.warnings.length, 0);
  });

  it("logs failed status without throwing when push fails (no origin configured)", async () => {
    const { repoRoot } = setupRepo({ withBranch: true, withCommit: true, withRemote: "none" });
    track(repoRoot);
    const logger = makeLogger();
    await flushFeatureBranch({
      slug: "foo", appRoot: repoRoot, repoRoot, baseBranch: "main", logger,
    });
    const event = logger.events.find((e) => e.category === "pipeline.flush.push");
    assert.ok(event, "expected pipeline.flush.push event");
    assert.equal(event.data.status, "failed");
    assert.equal(event.data.branch, "feature/foo");
    assert.equal(event.data.ahead, 1);
    assert.ok(typeof event.data.error === "string" && (event.data.error as string).length > 0);
    assert.equal(logger.warnings.length, 1);
  });

  it("pushes successfully and emits status:pushed when origin is configured", async () => {
    const { repoRoot, remoteRoot } = setupRepo({
      withBranch: true, withCommit: true, withRemote: "bare",
    });
    track(repoRoot);
    assert.ok(remoteRoot);
    const logger = makeLogger();
    await flushFeatureBranch({
      slug: "foo", appRoot: repoRoot, repoRoot, baseBranch: "main", logger,
    });
    const event = logger.events.find((e) => e.category === "pipeline.flush.push");
    assert.ok(event, "expected pipeline.flush.push event");
    assert.equal(event.data.status, "pushed", JSON.stringify(event.data));
    assert.equal(event.data.branch, "feature/foo");
    assert.equal(event.data.ahead, 1);
    // Remote must now have a feature/foo ref.
    const ls = execFileSync("git", ["ls-remote", "--heads", remoteRoot!, "feature/foo"], {
      encoding: "utf-8",
    });
    assert.match(ls, /refs\/heads\/feature\/foo/);
    assert.equal(logger.warnings.length, 0);
  });

  it("is idempotent — second flush of an already-pushed branch is a no-op", async () => {
    const { repoRoot } = setupRepo({
      withBranch: true, withCommit: true, withRemote: "bare",
    });
    track(repoRoot);
    const logger1 = makeLogger();
    await flushFeatureBranch({
      slug: "foo", appRoot: repoRoot, repoRoot, baseBranch: "main", logger: logger1,
    });
    const push1 = logger1.events.find((e) => e.category === "pipeline.flush.push");
    assert.ok(push1);
    assert.equal(push1.data.status, "pushed");

    // After the push, the branch tracks origin so `main..HEAD` is still 1
    // ahead — but `agent-branch.sh push` will succeed as a no-op (already
    // up-to-date). We still expect status:"pushed" or no error; the
    // important contract is "no throw, no warning".
    const logger2 = makeLogger();
    await flushFeatureBranch({
      slug: "foo", appRoot: repoRoot, repoRoot, baseBranch: "main", logger: logger2,
    });
    assert.equal(logger2.warnings.length, 0, "second flush must not warn");
    const push2 = logger2.events.find((e) => e.category === "pipeline.flush.push");
    assert.ok(push2, "expected pipeline.flush.push event");
    assert.ok(
      push2.data.status === "pushed" || push2.data.skipped === "no-commits-ahead",
      `unexpected idempotent outcome: ${JSON.stringify(push2.data)}`,
    );
  });

  it("commits dirty tree before push and surfaces files_changed in telemetry", async () => {
    const { repoRoot, remoteRoot } = setupRepo({
      withBranch: true, withCommit: true, withRemote: "bare",
    });
    track(repoRoot);
    assert.ok(remoteRoot);
    // Stage stranded changes — both an untracked file and a modified one.
    writeFileSync(join(repoRoot, "stranded.txt"), "leftover\n");
    writeFileSync(join(repoRoot, "feature.txt"), "modified\n");
    const headBefore = git(repoRoot, ["rev-parse", "HEAD"]);
    const logger = makeLogger();
    await flushFeatureBranch({
      slug: "foo",
      appRoot: repoRoot,
      repoRoot,
      baseBranch: "main",
      logger,
      finalStatus: "complete",
    });
    const commitEvent = logger.events.find((e) => e.category === "pipeline.flush.commit");
    assert.ok(commitEvent, "expected pipeline.flush.commit event");
    assert.equal(commitEvent.data.status, "committed");
    assert.ok(
      typeof commitEvent.data.files_changed === "number" && (commitEvent.data.files_changed as number) >= 2,
      `files_changed should reflect dirty tree, got ${JSON.stringify(commitEvent.data)}`,
    );
    assert.equal(commitEvent.data.final_status, "complete");
    // A new commit must have landed on top of the original.
    const headAfter = git(repoRoot, ["rev-parse", "HEAD"]);
    assert.notEqual(headAfter, headBefore, "expected an additional commit on top");
    // Working tree must now be clean.
    const status = git(repoRoot, ["status", "--porcelain"]);
    assert.equal(status, "", `working tree must be clean after flush, got: ${status}`);
    // Push must still happen for the new commit.
    const pushEvent = logger.events.find((e) => e.category === "pipeline.flush.push");
    assert.ok(pushEvent, "expected pipeline.flush.push event");
    assert.equal(pushEvent.data.status, "pushed");
  });

  it("does NOT commit dirty tree when on the wrong branch", async () => {
    // Stay on main + dirty tree → flush must abort at the wrong-branch
    // gate without ever staging or committing on the base branch.
    const { repoRoot } = setupRepo({ withBranch: false, withCommit: false, withRemote: "none" });
    track(repoRoot);
    writeFileSync(join(repoRoot, "leakage.txt"), "must-not-commit\n");
    const headBefore = git(repoRoot, ["rev-parse", "HEAD"]);
    const logger = makeLogger();
    await flushFeatureBranch({
      slug: "foo", appRoot: repoRoot, repoRoot, baseBranch: "main", logger,
    });
    // The wrong-branch event must be the only event — no commit, no push.
    assert.ok(
      logger.events.every((e) => e.category === "pipeline.flush.push" && e.data.skipped === "wrong-branch"),
      `expected only wrong-branch skip events, got: ${JSON.stringify(logger.events)}`,
    );
    const headAfter = git(repoRoot, ["rev-parse", "HEAD"]);
    assert.equal(headAfter, headBefore, "no commit must land on the base branch");
  });
});
