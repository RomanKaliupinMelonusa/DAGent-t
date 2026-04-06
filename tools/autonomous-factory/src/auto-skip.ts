/**
 * auto-skip.ts — Git-based change detection for auto-skipping no-op pipeline items.
 *
 * When a test or post-deploy item is queued but no relevant source files changed
 * since the last dev step, the item can be completed immediately (auto-skipped)
 * to save 10+ minutes of wall-clock time per cycle.
 */

import { execSync } from "node:child_process";

/**
 * Compute the merge-base between HEAD and the target branch.
 * Falls back to null if git fails (e.g. shallow clone).
 */
export function getMergeBase(repoRoot: string, targetBranch: string): string | null {
  try {
    // Ensure we have the remote ref available
    const remoteBranch = `origin/${targetBranch}`;
    return execSync(`git merge-base HEAD ${remoteBranch}`, {
      cwd: repoRoot, encoding: "utf-8", timeout: 10_000,
    }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Returns a function that picks the best base ref for auto-skip diffs.
 * Prefers the per-step snapshot (first dev run), but falls back to the
 * merge-base with the target branch when a redevelopment cycle overwrites
 * the snapshot with a no-op run (which would cause false auto-skips).
 */
export function getAutoSkipBaseRef(
  repoRoot: string,
  targetBranch: string,
  preStepRefs: Record<string, string>,
): (devKey: string) => string | null {
  // Cache the merge-base so we only compute it once per loop iteration
  let mergeBase: string | null | undefined;
  return (devKey: string): string | null => {
    const stepRef = preStepRefs[devKey];
    if (stepRef) return stepRef;
    if (mergeBase === undefined) {
      mergeBase = getMergeBase(repoRoot, targetBranch);
    }
    return mergeBase;
  };
}

/**
 * Get the list of files changed since a given git ref, using `git diff --name-only`.
 * Returns workspace-relative paths (e.g. "backend/src/functions/fn-list-generations.ts").
 */
export function getGitChangedFiles(repoRoot: string, sinceRef: string): string[] | null {
  try {
    const output = execSync(`git diff --name-only ${sinceRef} HEAD`, {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    // Fail-closed: signal that git diff failed so callers skip the
    // optimisation rather than assuming no files changed.
    return null;
  }
}

/**
 * Build path prefix lists for auto-skip change detection from apm.yml config.directories.
 * Throws if directories config is missing — every app must declare its layout explicitly.
 */
export function getDirectoryPrefixes(
  appRel: string,
  dirs: Record<string, string | null> | undefined,
): Record<string, string[]> {
  if (!dirs) {
    throw new Error(
      "Missing config.directories in apm.yml. " +
      "Each app must declare its directory layout (backend, frontend, infra, etc.) in the config section.",
    );
  }
  const d = dirs;
  // Safely construct base prefix — when appRel is "" (root-level app),
  // avoid a leading slash that would never match git diff output paths.
  const basePrefix = appRel ? `${appRel}/` : "";
  const pfx = (key: string) => {
    const val = d[key];
    return val ? `${basePrefix}${val}/` : null;
  };
  // Build a prefix set for every directory key declared in config.directories
  const result: Record<string, string[]> = {};
  for (const key of Object.keys(d)) {
    const p = pfx(key);
    result[key] = p ? [p] : [];
  }
  return result;
}

/**
 * Count the number of line deletions on the current branch compared to the
 * base branch, using `git diff --shortstat`.
 *
 * Returns 0 when: no deletions or empty diff.
 * Returns -1 on git error (fail-closed: prevents false auto-skip).
 */
export function getGitDeletions(repoRoot: string, baseBranch: string): number {
  try {
    // Pathspec magic (':!**/in-progress/**') excludes pipeline state files
    // so orchestrator mutations don't falsely trigger the dead-code scanner.
    const output = execSync(`git diff origin/${baseBranch}...HEAD --shortstat -- . ":!**/in-progress/**"`, {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    if (!output) return 0;
    // e.g. "5 files changed, 100 insertions(+), 23 deletions(-)"
    const match = output.match(/(\d+)\s+deletion/);
    return match ? parseInt(match[1], 10) : 0;
  } catch {
    // Fail-closed: -1 ensures `deletions === 0` never matches on error,
    // so the cleanup phase runs rather than being accidentally skipped.
    return -1;
  }
}

/**
 * Check whether the current branch has any entirely deleted files compared to
 * the base branch (git diff --diff-filter=D).
 *
 * Returns `true` if at least one file was deleted.
 */
export function hasDeletedFiles(repoRoot: string, baseBranch: string): boolean {
  try {
    const output = execSync(`git diff origin/${baseBranch}...HEAD --diff-filter=D --name-only -- . ":!**/in-progress/**"`, {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    return output.length > 0;
  } catch {
    // Fail-closed: assume deleted files exist on error so the cleanup
    // phase runs rather than being accidentally skipped.
    return true;
  }
}
