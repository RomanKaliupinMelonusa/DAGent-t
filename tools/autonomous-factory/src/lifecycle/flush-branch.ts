/**
 * lifecycle/flush-branch.ts — Terminal flush for stranded local commits.
 *
 * Run from the orchestrator's outer `finally` block in watchdog.ts so every
 * termination path (completed / halted / blocked / crash / SIGINT) gets a
 * best-effort `git push` of the feature branch. Without this, commits made
 * by late-stage agents (e.g. the docs-archived agent's `_change-manifest.json`
 * commit) can be stranded locally when an earlier salvage skipped the
 * publish-pr node and no subsequent node ran `agent-branch.sh push`.
 *
 * Contract:
 *   - Best-effort: NEVER throws. Push failures are logged + telemetry'd.
 *   - Idempotent: a no-op when the branch is already up-to-date with origin
 *     (gated by an `AHEAD == 0` pre-check, since `agent-branch.sh push`
 *     itself exits 1 in that case).
 *   - Stack-agnostic: shells `agent-branch.sh push` exclusively (no raw git
 *     state mutations). Detection uses one `git rev-parse` + one `git rev-list`.
 *   - Skip cases (each emits `pipeline.flush.push` with `skipped: <reason>`):
 *       * not-a-repo        — repoRoot is not a git work-tree
 *       * wrong-branch      — current branch is not `feature/<slug>` (covers
 *                             preflight failures where the branch was never
 *                             created — `create-branch` is a DAG node).
 *       * no-commits-ahead  — branch is up-to-date with baseBranch.
 */

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import type { Telemetry } from "../ports/telemetry.js";

export interface FlushBranchOpts {
  slug: string;
  appRoot: string;
  repoRoot: string;
  baseBranch: string;
  logger: Pick<Telemetry, "event" | "warn" | "info">;
  /** Final pipeline status — embedded in the auto-commit message when the
   *  flush stages a dirty tree. Optional; defaults to "unknown". */
  finalStatus?: string;
}

/** Run a git command sync, returning trimmed stdout or `null` on any failure. */
function gitCapture(repoRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

export async function flushFeatureBranch(opts: FlushBranchOpts): Promise<void> {
  const { slug, appRoot, repoRoot, baseBranch, logger, finalStatus } = opts;
  const expectedBranch = `feature/${slug}`;

  // 1. Are we even in a git repo? (`git rev-parse --is-inside-work-tree`
  //    returns "true" inside a checkout, fails / non-zero otherwise.)
  const inside = gitCapture(repoRoot, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") {
    logger.event("pipeline.flush.push", null, { skipped: "not-a-repo" });
    return;
  }

  // 2. On the right branch?
  //    Hard safety gate: never stage / commit / push when we are not on
  //    the expected feature branch. Protects `main`, `develop`, and any
  //    other base branch from accidental flush commits if preflight
  //    failed before `create-branch` ran.
  const currentBranch = gitCapture(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (currentBranch !== expectedBranch) {
    logger.event("pipeline.flush.push", null, {
      skipped: "wrong-branch",
      branch: currentBranch ?? "",
      expected: expectedBranch,
    });
    return;
  }

  // 2b. Stage + commit any dirty working tree before counting commits ahead.
  //     `agent-branch.sh push` only ships committed work, so a stranded
  //     uncommitted change would never reach origin without this step.
  //     `git status --porcelain` lists both staged and unstaged paths;
  //     a non-empty result means we have something to commit.
  const statusBefore = gitCapture(repoRoot, ["status", "--porcelain"]);
  if (statusBefore && statusBefore.length > 0) {
    const fileCount = statusBefore.split(/\r?\n/).filter((l) => l.length > 0).length;
    const commitScript = resolve(repoRoot, "tools", "autonomous-factory", "agent-commit.sh");
    const statusTag = finalStatus ?? "unknown";
    const message = `chore(pipeline): flush stranded changes for ${slug} [${statusTag}]`;
    try {
      execFileSync("bash", [commitScript, "all", message], {
        cwd: repoRoot,
        env: { ...process.env, APP_ROOT: appRoot },
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      logger.event("pipeline.flush.commit", null, {
        status: "committed",
        branch: currentBranch,
        files_changed: fileCount,
        final_status: statusTag,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.warn(
        `flushFeatureBranch: commit of dirty tree failed for ${currentBranch}: ${errorMessage}`,
      );
      logger.event("pipeline.flush.commit", null, {
        status: "failed",
        branch: currentBranch,
        files_changed: fileCount,
        final_status: statusTag,
        error: errorMessage,
      });
      // continue to push — any prior commits ahead of origin still need to ship
    }
  } else {
    logger.event("pipeline.flush.commit", null, {
      status: "skipped",
      branch: currentBranch,
      files_changed: 0,
      ...(finalStatus ? { final_status: finalStatus } : {}),
    });
  }

  // 3. Any commits ahead of the base branch? agent-branch.sh push refuses
  //    to push when AHEAD=0; skip cleanly so re-runs of an up-to-date
  //    branch are no-ops. Recompute AFTER the optional commit above so
  //    a freshly-staged change is included in the count.
  const aheadStr = gitCapture(repoRoot, ["rev-list", `${baseBranch}..HEAD`, "--count"]);
  const ahead = aheadStr !== null ? Number.parseInt(aheadStr, 10) : NaN;
  if (!Number.isFinite(ahead) || ahead <= 0) {
    logger.event("pipeline.flush.push", null, {
      skipped: "no-commits-ahead",
      branch: currentBranch,
      base: baseBranch,
    });
    return;
  }

  // 4. Push via the canonical wrapper. `BASE_BRANCH` is honoured by the
  //    script's own ahead-check, so propagate it for parity.
  const branchScript = resolve(repoRoot, "tools", "autonomous-factory", "agent-branch.sh");
  try {
    execFileSync("bash", [branchScript, "push"], {
      cwd: repoRoot,
      env: { ...process.env, BASE_BRANCH: baseBranch },
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    logger.event("pipeline.flush.push", null, {
      status: "pushed",
      branch: currentBranch,
      ahead,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`flushFeatureBranch: push failed for ${currentBranch}: ${message}`);
    logger.event("pipeline.flush.push", null, {
      status: "failed",
      branch: currentBranch,
      ahead,
      error: message,
    });
    // swallow — best-effort
  }
}
