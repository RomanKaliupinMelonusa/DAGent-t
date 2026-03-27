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
export function getGitChangedFiles(repoRoot: string, sinceRef: string): string[] {
  try {
    const output = execSync(`git diff --name-only ${sinceRef} HEAD`, {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Build path prefix lists for auto-skip change detection from apm.yml config.directories.
 * Throws if directories config is missing — every app must declare its layout explicitly.
 */
export function getDirectoryPrefixes(
  appRel: string,
  dirs: Record<string, string | null> | undefined,
): { backend: string[]; frontend: string[]; infra: string[] } {
  if (!dirs) {
    throw new Error(
      "Missing config.directories in apm.yml. " +
      "Each app must declare its directory layout (backend, frontend, infra, etc.) in the config section.",
    );
  }
  const d = dirs;
  const pfx = (key: string) => {
    const val = d[key];
    return val ? `${appRel}/${val}/` : null;
  };
  return {
    backend: [pfx("backend"), pfx("infra"), pfx("packages"), pfx("schemas")].filter(Boolean) as string[],
    frontend: [pfx("frontend"), pfx("e2e")].filter(Boolean) as string[],
    infra: [pfx("infra")].filter(Boolean) as string[],
  };
}
