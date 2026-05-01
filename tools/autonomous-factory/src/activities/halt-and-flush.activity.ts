/**
 * src/activities/halt-and-flush.activity.ts — Unconditional pre-halt flush.
 *
 * When the pipeline workflow halts/blocks/fails for any reason, it runs
 * this activity exactly once before returning. It commits any pending
 * `.dagent/` artifacts on the feature branch and pushes. The intent is
 * forensic capture — operators landing on a halted run should see the
 * full state of the feature branch (including the failing artifact and
 * any partially-applied feature edits) without needing to attach the
 * worker's filesystem.
 *
 * Best-effort by design: any subprocess failure becomes a logged warning
 * — the workflow's terminal status must not be masked by a flush
 * failure (e.g. detached HEAD, no remote, dirty rebase state).
 *
 * Safety guards (ported from the retired `lifecycle/flush-branch.ts`):
 *   - wrong-branch     — HEAD must equal `feature/<slug>`. Prevents
 *                        polluting trunk after a preflight failure that
 *                        terminated the workflow before `create-branch`
 *                        ran.
 *   - no-commits-ahead — clean tree + branch up-to-date with origin →
 *                        skip. Keeps the activity idempotent and avoids
 *                        spurious push failures on no-op flushes.
 */

import { Context } from "@temporalio/activity";
import { spawn } from "node:child_process";
import path from "node:path";
import type { ActivityDeps } from "./deps.js";

export interface HaltAndFlushInput {
  slug: string;
  appRoot: string;
  reason: string;
}

export interface HaltAndFlushResult {
  ok: boolean;
  pushed: boolean;
  message: string;
}

function run(
  cmd: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (b) => (stdout += b.toString()));
    child.stderr.on("data", (b) => (stderr += b.toString()));
    child.on("close", (code) =>
      resolve({ code: code ?? 1, stdout, stderr }),
    );
    child.on("error", (err) =>
      resolve({ code: 1, stdout, stderr: stderr + String(err) }),
    );
  });
}

export function makeHaltAndFlushActivity(
  _deps: ActivityDeps,
): (input: HaltAndFlushInput) => Promise<HaltAndFlushResult> {
  return async function haltAndFlushActivity(
    input,
  ): Promise<HaltAndFlushResult> {
    Context.current().heartbeat({ stage: "halt-and-flush:start" });
    const { slug, appRoot, reason } = input;

    const repoRootResult = await run(
      "git",
      ["rev-parse", "--show-toplevel"],
      appRoot || process.cwd(),
      {},
    );
    if (repoRootResult.code !== 0) {
      return {
        ok: false,
        pushed: false,
        message: `git-toplevel-failed: ${repoRootResult.stderr.trim()}`,
      };
    }
    const repoRoot = repoRootResult.stdout.trim();
    const env = {
      APP_ROOT: appRoot,
      SLUG: slug,
      REPO_ROOT: repoRoot,
    };

    // Safety guard #1 — wrong-branch.
    // When a preflight/bootstrap failure terminates the workflow before
    // the `create-branch` DAG node runs, HEAD still points at whatever
    // branch the worker was launched from (typically `main`,
    // `develop`, or a long-lived integration branch like
    // `project/temporal-migration`). Without this guard, halt-and-flush
    // would commit + push the partial `.dagent/` tree to that branch,
    // polluting trunk history with bootstrap detritus.
    //
    // Ported from the deleted `lifecycle/flush-branch.ts` (Phase 1.2 /
    // 4.4 reorg). DO NOT REMOVE without re-implementing the equivalent
    // check upstream (e.g. in agent-commit.sh).
    const expectedBranch = `feature/${slug}`;
    const currentBranch = await run(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      repoRoot,
      {},
    );
    if (currentBranch.code !== 0) {
      return {
        ok: false,
        pushed: false,
        message: `git-branch-resolve-failed: ${currentBranch.stderr.trim()}`,
      };
    }
    const headBranch = currentBranch.stdout.trim();
    if (headBranch !== expectedBranch) {
      return {
        ok: true,
        pushed: false,
        message: `skipped:wrong-branch (HEAD=${headBranch}, expected=${expectedBranch})`,
      };
    }

    // Safety guard #2 — no-commits-ahead idempotency.
    // If the feature branch is already up-to-date with origin (no local
    // commits ahead and a clean working tree), we have nothing to flush.
    // Skipping here both keeps the activity idempotent across retries
    // and avoids `agent-branch.sh push` exiting non-zero on a no-op
    // push.
    const status = await run(
      "git",
      ["status", "--porcelain"],
      repoRoot,
      {},
    );
    const dirty = status.code === 0 && status.stdout.trim().length > 0;
    const aheadCheck = await run(
      "git",
      ["rev-list", "--count", `@{upstream}..HEAD`],
      repoRoot,
      {},
    );
    const ahead =
      aheadCheck.code === 0 && Number(aheadCheck.stdout.trim()) > 0;
    if (!dirty && !ahead) {
      return {
        ok: true,
        pushed: false,
        message: "skipped:no-commits-ahead",
      };
    }

    const commitScript = path.join(
      repoRoot,
      "tools/autonomous-factory/agent-commit.sh",
    );
    const branchScript = path.join(
      repoRoot,
      "tools/autonomous-factory/agent-branch.sh",
    );

    Context.current().heartbeat({ stage: "halt-and-flush:commit" });
    const commit = await run(
      "bash",
      [
        commitScript,
        "pipeline",
        `chore(${slug}): halt-and-flush — ${reason.slice(0, 120)}`,
      ],
      repoRoot,
      env,
    );

    Context.current().heartbeat({ stage: "halt-and-flush:push" });
    const push = await run("bash", [branchScript, "push"], repoRoot, env);
    const pushed = push.code === 0;

    return {
      ok: true,
      pushed,
      message: pushed
        ? "flushed"
        : `commit=${commit.code} push=${push.code}: ${push.stderr.trim().slice(0, 200)}`,
    };
  };
}
