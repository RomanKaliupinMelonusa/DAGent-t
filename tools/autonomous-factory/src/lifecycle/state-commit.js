/**
 * state-commit.ts — Centralized state mutex: single-threaded commit
 * after a parallel execution batch completes.
 *
 * Only the orchestrator commits state files. Agents commit code only (local).
 * Replaces per-agent state commits, eliminating Git contention between
 * parallel agents fighting over `_state.json` rebases.
 */
import path from "node:path";
import { execSync, spawnSync } from "node:child_process";
/**
 * Commit and push pipeline state files after a parallel execution batch completes.
 *
 * CRITICAL GUARD: The push step checks whether the local branch contains
 * unpushed code commits (files outside `.dagent/`). If so, the push is
 * skipped — state stays committed locally and gets pushed later by the
 * deterministic push-* DAG node. This prevents premature pushes from
 * triggering deploy-* CI workflows before the pipeline formally reaches
 * the push-code DAG node, which caused stale deployment artifacts and
 * $130+ in wasted agent sessions (health-badge incident).
 */
export function commitAndPushState(repoRootDir, appRootDir, branch, batchNumber) {
    const appRel = path.relative(repoRootDir, appRootDir);
    const stateGlob = path.join(appRel, ".dagent");
    try {
        // Check for uncommitted state changes
        const hasChanges = execSync(`git status --porcelain -- "${stateGlob}"`, { cwd: repoRootDir, encoding: "utf-8", timeout: 10_000 }).trim();
        if (!hasChanges)
            return; // No state changes to commit
        // Stage state files only
        execSync(`git add "${stateGlob}"`, {
            cwd: repoRootDir, timeout: 10_000,
        });
        // Commit with batch number for traceability.
        // [skip ci] prevents state-only pushes from triggering CI workflows.
        execSync(`git commit -m "chore(pipeline): state update [batch ${batchNumber}] [skip ci]" --no-verify`, { cwd: repoRootDir, timeout: 10_000, stdio: "pipe" });
        // ── PUSH GUARD: only push when no unpushed code commits exist ──────
        // If local branch has commits containing files outside .dagent/ that
        // haven't been pushed yet, defer the push to push-* nodes. This
        // prevents deploy-* workflows from triggering prematurely.
        let hasUnpushedCodeCommits = false;
        try {
            const unpushedFiles = execSync(`git diff --name-only origin/${branch}..HEAD`, { cwd: repoRootDir, encoding: "utf-8", timeout: 10_000 }).trim();
            if (unpushedFiles) {
                hasUnpushedCodeCommits = unpushedFiles.split("\n").some((f) => !f.includes(".dagent/"));
            }
        }
        catch {
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
    }
    catch (err) {
        // Non-fatal — state is persisted locally, will be pushed with next code push
        console.warn(`  ⚠ State commit failed: ${err instanceof Error ? err.message : err}`);
    }
}
//# sourceMappingURL=state-commit.js.map