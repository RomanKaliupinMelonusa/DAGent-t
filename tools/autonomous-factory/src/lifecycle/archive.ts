/**
 * archive.ts — Feature directory archiving and state commit/push plumbing.
 *
 * Extracted from watchdog.ts for Single Responsibility.
 * Contains deterministic archive logic and the centralized state commit mutex.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Feature archiving
// ---------------------------------------------------------------------------

/**
 * Deterministic archiving — moves the feature's `<inProgress>/<slug>/`
 * directory (state, trans, kickoff inputs, per-invocation tree, telemetry,
 * reporting outputs) to `<root>/archive/features/<slug>/`. The whole-dir
 * move is atomic on the same filesystem.
 *
 * Replaces LLM-driven shell commands that previously lived in the
 * pr-creator agent prompt.
 */
export function archiveFeatureFiles(featureSlug: string, root: string, repoRootDir: string): void {
  const inProgress = path.join(root, "in-progress");
  const archiveRoot = path.join(root, "archive", "features");
  const archiveDir = path.join(archiveRoot, featureSlug);

  try {
    fs.mkdirSync(archiveRoot, { recursive: true });

    // Whole-directory move: every per-feature artifact (state, trans,
    // _kickoff/*, telemetry, reporting outputs, per-invocation tree)
    // lives under `in-progress/<slug>/` after the Slice-D hard cutover,
    // so a single rename completes the migration to the archive.
    const slugDir = path.join(inProgress, featureSlug);
    if (fs.existsSync(slugDir) && fs.statSync(slugDir).isDirectory()) {
      // If a stale archive dir exists from a prior run, remove it first
      // so `renameSync` can complete cleanly.
      if (fs.existsSync(archiveDir)) {
        fs.rmSync(archiveDir, { recursive: true, force: true });
      }
      fs.renameSync(slugDir, archiveDir);
    } else {
      // Nothing to archive (already archived, or feature never produced
      // artifacts). Still create the empty archive dir so the commit step
      // has something to add.
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    // Remove PR_BODY.md if it exists
    const prBody = path.join(root, "PR_BODY.md");
    if (fs.existsSync(prBody)) {
      fs.unlinkSync(prBody);
    }

    // Commit the archive via the wrapper script
    const commitScript = path.join(repoRootDir, "tools", "autonomous-factory", "agent-commit.sh");
    execSync(
      `bash "${commitScript}" pr "chore(${featureSlug}): archive feature files"`,
      { cwd: repoRootDir, stdio: "inherit", timeout: 30_000 },
    );

    console.log(`  📦 Archived feature files to archive/features/${featureSlug}/`);
  } catch (err) {
    // Non-fatal — the PR was already created; archiving failure shouldn't crash the pipeline
    console.warn(
      `  ⚠ Archiving failed: ${err instanceof Error ? err.message : err}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Centralized state mutex — single-threaded commit after parallel batch
// ---------------------------------------------------------------------------

/**
 * Commit and push pipeline state files after a parallel execution batch completes.
 * This replaces per-agent state commits, eliminating Git contention between
 * parallel agents fighting over _STATE.json rebases.
 *
 * Only the orchestrator commits state files. Agents commit code only (local).
 *
 * CRITICAL GUARD: The push step checks whether the local branch contains
 * unpushed code commits (files outside in-progress/ or archive/). If so, the
 * push is skipped — state stays committed locally and gets pushed later by
 * the deterministic push-* DAG node. This prevents premature
 * pushes from triggering deploy-* CI workflows before the pipeline formally
 * reaches the push-code DAG node, which caused stale deployment artifacts
 * and $130+ in wasted agent sessions (health-badge incident).
 */
export function commitAndPushState(
  repoRootDir: string,
  appRootDir: string,
  branch: string,
  batchNumber: number,
): void {
  const appRel = path.relative(repoRootDir, appRootDir);
  const stateGlob = path.join(appRel, "in-progress");

  try {
    // Check for uncommitted state changes
    const hasChanges = execSync(
      `git status --porcelain -- "${stateGlob}"`,
      { cwd: repoRootDir, encoding: "utf-8", timeout: 10_000 },
    ).trim();

    if (!hasChanges) return; // No state changes to commit

    // Stage state files only
    execSync(`git add "${stateGlob}"`, {
      cwd: repoRootDir, timeout: 10_000,
    });

    // Commit with batch number for traceability.
    // [skip ci] prevents state-only pushes from triggering CI workflows.
    execSync(
      `git commit -m "chore(pipeline): state update [batch ${batchNumber}] [skip ci]" --no-verify`,
      { cwd: repoRootDir, timeout: 10_000, stdio: "pipe" },
    );

    // ── PUSH GUARD: only push when no unpushed code commits exist ──────
    // If local branch has commits containing files outside in-progress/ or
    // archive/ that haven't been pushed yet, defer the push to push-* nodes.
    // This prevents deploy-* workflows from triggering prematurely.
    let hasUnpushedCodeCommits = false;
    try {
      const unpushedFiles = execSync(
        `git diff --name-only origin/${branch}..HEAD`,
        { cwd: repoRootDir, encoding: "utf-8", timeout: 10_000 },
      ).trim();
      if (unpushedFiles) {
        hasUnpushedCodeCommits = unpushedFiles.split("\n").some(
          (f) => !f.includes("in-progress/") && !f.includes("archive/"),
        );
      }
    } catch {
      // If origin/<branch> doesn't exist yet (first push), allow the push —
      // the first push-* node will trigger CI properly.
      // This initial push only contains state/spec files.
    }

    if (hasUnpushedCodeCommits) {
      console.log(`  🔒 State committed locally [batch ${batchNumber}] — push deferred (unpushed code commits exist)`);
      return;
    }

    // Push with exponential backoff retry (2s, 4s, 8s) using --force-with-lease
    for (let i = 0; i < 3; i++) {
      const result = spawnSync("git", ["push", "--force-with-lease", "origin", branch], {
        cwd: repoRootDir, timeout: 30_000,
      });
      if (result.status === 0) {
        console.log(`  🔒 State committed and pushed [batch ${batchNumber}]`);
        return;
      }
      // Pull --rebase before retry to resolve fast-forward
      spawnSync("git", ["pull", "--rebase", "origin", branch], {
        cwd: repoRootDir, timeout: 30_000,
      });
      const backoff = 2000 * Math.pow(2, i);
      execSync(`sleep ${backoff / 1000}`, { timeout: backoff + 5000 });
    }
    console.warn(`  ⚠ Failed to push state after 3 retries — state committed locally only`);
  } catch (err) {
    // Non-fatal — state is persisted locally, will be pushed with next code push
    console.warn(`  ⚠ State commit failed: ${err instanceof Error ? err.message : err}`);
  }
}
