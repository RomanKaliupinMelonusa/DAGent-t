/**
 * archive.ts — Feature file archiving and state commit/push plumbing.
 *
 * Extracted from watchdog.ts for Single Responsibility.
 * Contains deterministic archive logic and the centralized state commit mutex.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Spec file matching
// ---------------------------------------------------------------------------

/**
 * Find the spec file for a feature in a list of directory entries.
 * Uses three matching strategies in priority order:
 *   1. Exact slug match (e.g. "my-feature_SPEC.md")
 *   2. Hyphen-to-underscore variant (e.g. "my_feature_SPEC.md")
 *   3. Generic fallback — any _spec.md or _deploy_spec.md that isn't
 *      from another feature
 */
export function findSpecFile(entries: string[], featureSlug: string): string | undefined {
  const specTarget1 = `${featureSlug}_spec.md`.toLowerCase();
  const specTarget2 = `${featureSlug.replace(/-/g, "_")}_spec.md`.toLowerCase();
  return entries.find((f) => {
    const lower = f.toLowerCase();
    if (lower === specTarget1 || lower === specTarget2) return true;
    // Fallback: match any file ending in _spec.md or _deploy_spec.md that isn't
    // from another feature (i.e. not prefixed with a different slug)
    if (lower.endsWith("_spec.md") || lower.endsWith("_deploy_spec.md")) {
      // Accept if no other slug prefix is present (standalone spec files)
      const hasSlugPrefix = lower.startsWith(featureSlug.toLowerCase())
        || lower.startsWith(featureSlug.replace(/-/g, "_").toLowerCase());
      const isGenericSpec = !lower.includes("_state.") && !entries.some(
        (other) => other !== f && other.toLowerCase().startsWith(lower.split("_spec")[0])
          && other.toLowerCase().endsWith("_state.json"),
      );
      return hasSlugPrefix || isGenericSpec;
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Feature archiving
// ---------------------------------------------------------------------------

/**
 * Deterministic archiving — moves all feature artifacts from in-progress/
 * to archive/features/<slug>/. This replaces LLM-driven shell commands that
 * previously lived in the pr-creator agent prompt.
 */
export function archiveFeatureFiles(featureSlug: string, root: string, repoRootDir: string): void {
  const inProgress = path.join(root, "in-progress");
  const archiveDir = path.join(root, "archive", "features", featureSlug);
  const screenshotsDir = path.join(archiveDir, "screenshots");

  try {
    fs.mkdirSync(screenshotsDir, { recursive: true });

    // Move known feature artifacts
    const artifacts = [
      `${featureSlug}_TRANS.md`,
      `${featureSlug}_STATE.json`,
      `${featureSlug}_SUMMARY.md`,
      `${featureSlug}_SUMMARY-DATA.json`,
      `${featureSlug}_TERMINAL-LOG.md`,
      `${featureSlug}_PLAYWRIGHT-LOG.md`,
      `${featureSlug}_CHANGES.json`,
    ];

    // Dynamically find the SPEC file
    const entries = fs.readdirSync(inProgress);
    const specFile = findSpecFile(entries, featureSlug);
    if (specFile) artifacts.push(specFile);

    for (const artifact of artifacts) {
      const src = path.join(inProgress, artifact);
      const dst = path.join(archiveDir, artifact);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dst);
      }
    }

    // Move screenshots
    const screenshotsSrc = path.join(inProgress, "screenshots");
    if (fs.existsSync(screenshotsSrc)) {
      const entries = fs.readdirSync(screenshotsSrc);
      if (entries.length > 0) {
        for (const entry of entries) {
          const srcEntry = path.join(screenshotsSrc, entry);
          const dstEntry = path.join(screenshotsDir, entry);
          fs.renameSync(srcEntry, dstEntry);
        }
      }
      fs.rmSync(screenshotsSrc, { recursive: true, force: true });
    }

    // Archive any remaining slug-prefixed files (e.g. _FLIGHT_DATA.json,
    // _PIPELINE-TRIAGE.md, _CI-FAILURE.log) that weren't in the known list
    const remaining = fs.readdirSync(inProgress).filter(
      (f) => f.startsWith(`${featureSlug}_`) || f.startsWith(`${featureSlug}.`),
    );
    for (const f of remaining) {
      fs.renameSync(path.join(inProgress, f), path.join(archiveDir, f));
    }

    // Clean up non-slug-prefixed feature files
    // that shouldn't persist after the feature is archived.  Keep only README.md.
    const stragglers = fs.readdirSync(inProgress).filter((f) => {
      if (f.toLowerCase() === "readme.md") return false;
      // Skip directories (screenshots already handled above)
      const stat = fs.statSync(path.join(inProgress, f));
      return stat.isFile();
    });
    for (const f of stragglers) {
      fs.renameSync(path.join(inProgress, f), path.join(archiveDir, f));
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
