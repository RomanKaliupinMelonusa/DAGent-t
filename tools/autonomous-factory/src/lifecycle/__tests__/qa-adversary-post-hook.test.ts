/**
 * Regression test for the qa-adversary post-hook (transient-spec cleanup).
 *
 * Background: qa-adversary writes `apps/<app>/e2e/_qa_<slug>.spec.ts`
 * during its run. Historically this file leaked into the feature
 * branch / PR because:
 *  1. cleanup lived in `e2e-runner-post.sh`, which fires BEFORE
 *     qa-adversary; and
 *  2. the agent itself runs `agent-commit.sh e2e ...` mid-session,
 *     committing the spec before any post-hook can act.
 *
 * Fix: dedicated `.apm/hooks/qa-adversary-post.sh` that
 *  (a) `git rm`s the transient,
 *  (b) amends the qa-adversary commit when HEAD is its own
 *      (`test(qa):` subject) so the file never reaches origin, OR
 *  (c) adds a single `chore(qa):` commit otherwise.
 *
 * These tests exercise the hook end-to-end against a throwaway git
 * repo and assert: working tree clean, `git ls-files` clean,
 * single commit on top of the original test commit (amend path) or
 * exactly one extra chore commit (fallback path).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOOK_SOURCE = path.resolve(
  __dirname,
  "../../../../../apps/commerce-storefront/.apm/hooks/qa-adversary-post.sh",
);

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

function setupRepo(): { repoRoot: string; appRoot: string } {
  const repoRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "qa-adversary-post-"),
  );
  // Init a real git repo with quiet defaults so commits work.
  git(repoRoot, "init", "--quiet", "-b", "main");
  git(repoRoot, "config", "user.email", "test@example.com");
  git(repoRoot, "config", "user.name", "Test");
  git(repoRoot, "config", "commit.gpgsign", "false");

  // App root + hooks. The hook resolves its sibling lib via
  // `dirname ${BASH_SOURCE}/lib/dev-server-lifecycle.sh`, so we copy
  // both into the throwaway repo at the same relative layout.
  const appRoot = path.join(repoRoot, "apps", "commerce-storefront");
  const hooksDir = path.join(appRoot, ".apm", "hooks");
  fs.mkdirSync(path.join(hooksDir, "lib"), { recursive: true });
  fs.copyFileSync(HOOK_SOURCE, path.join(hooksDir, "qa-adversary-post.sh"));
  // Stub the dev-server lib to a no-op so the hook can run without a
  // real PWA Kit dev server present.
  fs.writeFileSync(
    path.join(hooksDir, "lib", "dev-server-lifecycle.sh"),
    "#!/usr/bin/env bash\nexit 0\n",
    { mode: 0o755 },
  );
  fs.chmodSync(path.join(hooksDir, "qa-adversary-post.sh"), 0o755);

  // e2e directory + a sibling real spec we MUST NOT touch.
  fs.mkdirSync(path.join(appRoot, "e2e"), { recursive: true });
  fs.writeFileSync(
    path.join(appRoot, "e2e", "real.spec.ts"),
    "// real spec — must survive cleanup\n",
  );

  // Initial commit so HEAD exists.
  git(repoRoot, "add", ".");
  git(repoRoot, "commit", "--quiet", "-m", "chore: bootstrap");
  return { repoRoot, appRoot };
}

function runHook(repoRoot: string): { stdout: string; stderr: string } {
  // Mirror the env vars the lifecycle-hooks middleware injects:
  // APP_ROOT / REPO_ROOT are ABSOLUTE; hook cwd == ctx.appRoot.
  // (See tools/autonomous-factory/src/handlers/middlewares/lifecycle-hooks.ts
  //  and tools/autonomous-factory/src/entry/cli.ts.)
  const appRootAbs = path.join(repoRoot, "apps", "commerce-storefront");
  const env = {
    ...process.env,
    REPO_ROOT: repoRoot,
    APP_ROOT: appRootAbs,
    SLUG: "demo",
    BASE_BRANCH: "main",
    ITEM_KEY: "qa-adversary",
  };
  try {
    const stdout = execFileSync(
      "bash",
      [".apm/hooks/qa-adversary-post.sh"],
      {
        cwd: appRootAbs,
        env,
        encoding: "utf-8",
      },
    );
    return { stdout, stderr: "" };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string };
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

describe("qa-adversary-post.sh — transient spec cleanup", () => {
  let ctx: { repoRoot: string; appRoot: string };

  before(() => {
    ctx = setupRepo();
  });

  after(() => {
    fs.rmSync(ctx.repoRoot, { recursive: true, force: true });
  });

  it("amends the qa-adversary commit (preserves subject) when it carries other changes besides the transient", () => {
    const { repoRoot, appRoot } = ctx;
    // Simulate qa-adversary's mid-session commit: stage and commit the
    // transient spec ALONGSIDE another e2e file (the agent's other
    // genuine changes) under a `test(qa):` subject. The amend path
    // is only safe when stripping the transient leaves real content.
    const transient = path.join(appRoot, "e2e", "_qa_demo.spec.ts");
    const sibling = path.join(appRoot, "e2e", "fixtures.helpers.ts");
    fs.writeFileSync(transient, "// transient qa-adversary probe spec\n");
    fs.writeFileSync(sibling, "// real fixture helper from qa-adversary\n");
    git(repoRoot, "add", "apps/commerce-storefront/e2e/");
    git(repoRoot, "commit", "--quiet", "-m", "test(qa): adversarial probes for demo");
    const headBefore = git(repoRoot, "rev-parse", "HEAD");
    const countBefore = Number(git(repoRoot, "rev-list", "--count", "HEAD"));

    runHook(repoRoot);

    // Working tree: spec gone.
    assert.equal(
      fs.existsSync(transient),
      false,
      "transient spec must be deleted from working tree",
    );
    // Index: spec gone, sibling kept.
    const tracked = git(repoRoot, "ls-files");
    assert.equal(
      tracked.includes("e2e/_qa_demo.spec.ts"),
      false,
      `spec must not be tracked, got:\n${tracked}`,
    );
    assert.ok(
      tracked.includes("e2e/fixtures.helpers.ts"),
      "sibling real change must remain tracked after amend",
    );
    // History: amend path → same number of commits, different SHA, same
    // subject preserved.
    const countAfter = Number(git(repoRoot, "rev-list", "--count", "HEAD"));
    assert.equal(
      countAfter,
      countBefore,
      "amend path must keep commit count constant",
    );
    const headAfter = git(repoRoot, "rev-parse", "HEAD");
    assert.notEqual(headAfter, headBefore, "amend must produce a new SHA");
    const subj = git(repoRoot, "log", "-1", "--format=%s");
    assert.match(
      subj,
      /^test\(qa\):/,
      `amended commit must keep qa subject, got: ${subj}`,
    );
    // Defensive: real spec still tracked.
    assert.ok(
      tracked.includes("e2e/real.spec.ts"),
      "sibling specs must not be touched",
    );
  });

  it("drops the qa-adversary commit entirely when it ONLY introduced the transient", () => {
    // Most common production case: the agent's mid-session commit is
    // just the transient spec. Amending would leave an empty commit,
    // which git refuses; the hook must reset --hard HEAD^ so the spec
    // never appears in history.
    const fresh = setupRepo();
    const transient = path.join(
      fresh.appRoot,
      "e2e",
      "_qa_demo.spec.ts",
    );
    fs.writeFileSync(transient, "// transient probe — only content\n");
    git(fresh.repoRoot, "add", "apps/commerce-storefront/e2e/_qa_demo.spec.ts");
    git(fresh.repoRoot, "commit", "--quiet", "-m", "test(qa): demo probes");
    const countBefore = Number(
      git(fresh.repoRoot, "rev-list", "--count", "HEAD"),
    );

    runHook(fresh.repoRoot);

    assert.equal(
      fs.existsSync(transient),
      false,
      "transient spec must be deleted from working tree (drop path)",
    );
    const tracked = git(fresh.repoRoot, "ls-files");
    assert.equal(
      tracked.includes("e2e/_qa_demo.spec.ts"),
      false,
      "spec must not be tracked after drop",
    );
    const countAfter = Number(
      git(fresh.repoRoot, "rev-list", "--count", "HEAD"),
    );
    assert.equal(
      countAfter,
      countBefore - 1,
      "drop path must remove the qa-adversary commit",
    );
    const subj = git(fresh.repoRoot, "log", "-1", "--format=%s");
    assert.doesNotMatch(
      subj,
      /^test\(qa\):/,
      `qa-adversary commit must be gone, got HEAD subject: ${subj}`,
    );

    fs.rmSync(fresh.repoRoot, { recursive: true, force: true });
  });

  it("adds a single chore(qa) commit when HEAD is not qa-adversary's", () => {
    // Fresh repo so amend-path state from the previous test doesn't bleed.
    const fresh = setupRepo();
    const transient = path.join(
      fresh.appRoot,
      "e2e",
      "_qa_demo.spec.ts",
    );
    fs.writeFileSync(transient, "// transient probe\n");
    // Track + commit the transient under an UNRELATED subject (simulates
    // some other agent / human committing it before we run).
    git(fresh.repoRoot, "add", "apps/commerce-storefront/e2e/_qa_demo.spec.ts");
    git(fresh.repoRoot, "commit", "--quiet", "-m", "feat: unrelated work");
    const countBefore = Number(
      git(fresh.repoRoot, "rev-list", "--count", "HEAD"),
    );

    runHook(fresh.repoRoot);

    assert.equal(
      fs.existsSync(transient),
      false,
      "transient spec must be deleted from working tree (chore path)",
    );
    const tracked = git(fresh.repoRoot, "ls-files");
    assert.equal(
      tracked.includes("e2e/_qa_demo.spec.ts"),
      false,
      "spec must not be tracked after chore-path cleanup",
    );
    const countAfter = Number(
      git(fresh.repoRoot, "rev-list", "--count", "HEAD"),
    );
    assert.equal(
      countAfter,
      countBefore + 1,
      "chore path must add exactly one commit",
    );
    const subj = git(fresh.repoRoot, "log", "-1", "--format=%s");
    assert.match(
      subj,
      /^chore\(qa\):/,
      `chore commit subject must start with chore(qa):, got: ${subj}`,
    );

    fs.rmSync(fresh.repoRoot, { recursive: true, force: true });
  });

  it("is a no-op when there is no transient spec to clean up", () => {
    const fresh = setupRepo();
    const headBefore = git(fresh.repoRoot, "rev-parse", "HEAD");
    const countBefore = Number(
      git(fresh.repoRoot, "rev-list", "--count", "HEAD"),
    );

    runHook(fresh.repoRoot);

    const headAfter = git(fresh.repoRoot, "rev-parse", "HEAD");
    const countAfter = Number(
      git(fresh.repoRoot, "rev-list", "--count", "HEAD"),
    );
    assert.equal(headAfter, headBefore, "no-op must not move HEAD");
    assert.equal(countAfter, countBefore, "no-op must not change commit count");

    fs.rmSync(fresh.repoRoot, { recursive: true, force: true });
  });
});

describe("agent-commit.sh — transient qa-adversary guard", () => {
  // Belt-and-suspenders: even if a future agent ignores the prompt and
  // calls `agent-commit.sh e2e ...` (which globs the whole e2e/ dir),
  // the wrapper must refuse to stage `_qa_*.spec.ts`. The hook is the
  // primary defense; this is the secondary one.
  const AGENT_COMMIT = path.resolve(
    __dirname,
    "../../../agent-commit.sh",
  );

  function bootstrap(): { repoRoot: string; appRoot: string } {
    const repoRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "agent-commit-guard-"),
    );
    git(repoRoot, "init", "--quiet", "-b", "main");
    git(repoRoot, "config", "user.email", "test@example.com");
    git(repoRoot, "config", "user.name", "Test");
    git(repoRoot, "config", "commit.gpgsign", "false");
    const appRoot = path.join(repoRoot, "apps", "commerce-storefront");
    fs.mkdirSync(path.join(appRoot, "e2e"), { recursive: true });
    fs.mkdirSync(path.join(appRoot, ".dagent"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "README.md"), "boot\n");
    git(repoRoot, "add", ".");
    git(repoRoot, "commit", "--quiet", "-m", "chore: bootstrap");
    return { repoRoot, appRoot };
  }

  it("refuses to stage e2e/_qa_*.spec.ts under scope `e2e` (default ON)", () => {
    const { repoRoot, appRoot } = bootstrap();
    fs.writeFileSync(path.join(appRoot, "e2e", "real.spec.ts"), "// real\n");
    fs.writeFileSync(
      path.join(appRoot, "e2e", "_qa_demo.spec.ts"),
      "// transient\n",
    );

    execFileSync(
      "bash",
      [AGENT_COMMIT, "e2e", "test(qa): demo"],
      {
        cwd: repoRoot,
        // Production reality: APP_ROOT is absolute (entry/cli.ts uses
        // path.resolve). Test it that way. Explicitly scrub the
        // rollback flag from the inherited env so a developer who
        // happens to have `AGENT_COMMIT_BLOCK_TRANSIENT_QA=0` exported
        // doesn't silently break this test.
        env: (() => {
          const e = { ...process.env, APP_ROOT: appRoot };
          delete e.AGENT_COMMIT_BLOCK_TRANSIENT_QA;
          return e;
        })(),
        encoding: "utf-8",
      },
    );

    const tracked = git(repoRoot, "ls-files");
    assert.ok(
      tracked.includes("apps/commerce-storefront/e2e/real.spec.ts"),
      "real spec must be committed",
    );
    assert.equal(
      tracked.includes("apps/commerce-storefront/e2e/_qa_demo.spec.ts"),
      false,
      `transient spec must NOT be committed, got tracked:\n${tracked}`,
    );

    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it("respects the env-flag rollback (AGENT_COMMIT_BLOCK_TRANSIENT_QA=0 disables guard)", () => {
    // The flag exists for one-cycle rollback safety per the implementation
    // notes. When explicitly disabled, the legacy behaviour (transient
    // sneaks into the commit) should reproduce — confirming the guard,
    // not some other change, is what's blocking the leak.
    const { repoRoot, appRoot } = bootstrap();
    fs.writeFileSync(
      path.join(appRoot, "e2e", "_qa_demo.spec.ts"),
      "// transient\n",
    );

    execFileSync(
      "bash",
      [AGENT_COMMIT, "e2e", "test(qa): demo"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          APP_ROOT: appRoot,
          AGENT_COMMIT_BLOCK_TRANSIENT_QA: "0",
        },
        encoding: "utf-8",
      },
    );

    const tracked = git(repoRoot, "ls-files");
    assert.ok(
      tracked.includes("apps/commerce-storefront/e2e/_qa_demo.spec.ts"),
      "with guard disabled, legacy leak must reproduce (proves the guard is what blocks it)",
    );

    fs.rmSync(repoRoot, { recursive: true, force: true });
  });
});
