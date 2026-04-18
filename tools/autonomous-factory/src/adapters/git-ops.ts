/**
 * git-ops.ts — Deterministic git plumbing for the orchestrator.
 *
 * Thin wrappers around shell git commands and the agent-branch.sh script.
 * All functions are synchronous (git ops are fast) except `pushWithRetry`
 * which uses async backoff.
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { GitError } from "../errors.js";
import type { PipelineLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Branch operations
// ---------------------------------------------------------------------------

/**
 * Create (or switch to) the feature branch via `agent-branch.sh create-feature`.
 * @throws {GitError} if the branch script fails
 */
export function createFeatureBranch(
  repoRoot: string,
  slug: string,
  baseBranch: string,
): void {
  const branchScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-branch.sh");
  try {
    execSync(`bash "${branchScript}" create-feature "${slug}"`, {
      cwd: repoRoot,
      stdio: "inherit",
      timeout: 30_000,
      env: { ...process.env, BASE_BRANCH: baseBranch },
    });
  } catch (err) {
    throw new GitError(
      `Failed to create feature branch: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Get the current git branch name.
 * @throws {GitError} on failure
 */
export function getCurrentBranch(repoRoot: string): string {
  try {
    return execSync("git branch --show-current", {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
  } catch (err) {
    throw new GitError(
      `Failed to determine current branch: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Pull --rebase from origin. Non-fatal — swallows errors
 * (the local branch may be ahead of remote).
 */
export function syncBranch(repoRoot: string): void {
  try {
    const branch = getCurrentBranch(repoRoot);
    execSync(`git pull --rebase origin "${branch}"`, {
      cwd: repoRoot,
      stdio: "pipe",
      timeout: 30_000,
    });
  } catch {
    /* non-fatal — may be ahead of remote */
  }
}

/**
 * Push to origin via `agent-branch.sh push` with exponential backoff retry.
 * @throws {GitError} after exhausting all retries
 */
export async function pushWithRetry(
  repoRoot: string,
  baseBranch: string,
  logger: PipelineLogger,
  maxRetries = 3,
): Promise<void> {
  const branchScript = path.join(repoRoot, "tools", "autonomous-factory", "agent-branch.sh");
  const branch = getCurrentBranch(repoRoot);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync(`bash "${branchScript}" push`, {
        cwd: repoRoot,
        stdio: "inherit",
        timeout: 60_000,
        env: { ...process.env, BASE_BRANCH: baseBranch },
      });
      logger.event("git.push", null, { branch, sha: null, deferred: false });
      return;
    } catch (pushErr) {
      if (attempt < maxRetries) {
        const backoff = 2_000 * Math.pow(2, attempt - 1);
        console.warn(`  ⚠ Push attempt ${attempt}/${maxRetries} failed, retrying in ${backoff / 1000}s...`);
        await new Promise((r) => setTimeout(r, backoff));
      } else {
        throw new GitError(
          `Failed to push after ${maxRetries} attempts: ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`,
        );
      }
    }
  }
}
