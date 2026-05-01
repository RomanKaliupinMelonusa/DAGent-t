/**
 * adapters/git-shell-adapter.ts — VersionControl adapter over git.
 *
 * Wraps synchronous git shell operations and the agent-branch.sh
 * wrapper script behind the async VersionControl port. Branch-management
 * helpers (`createFeatureBranch`, `getCurrentBranch`, `syncBranch`,
 * `pushWithRetry`) are private module functions — they used to live in
 * a separate `git-ops.ts`, but `GitShellAdapter` was their only consumer.
 */

import { execSync } from "node:child_process";
import path from "node:path";
import type { VersionControl } from "../ports/version-control.js";
import { GitError } from "../errors.js";
import type { PipelineLogger } from "../telemetry/index.js";

// ---------------------------------------------------------------------------
// Branch helpers — synchronous; git is fast enough that async wrappers
// add no value here. `pushWithRetry` is async only because of the
// exponential backoff sleep.
// ---------------------------------------------------------------------------

function createFeatureBranch(
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

function getCurrentBranch(repoRoot: string): string {
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

/** Pull --rebase from origin. Non-fatal — swallows errors (the local
 *  branch may be ahead of remote). */
function syncBranch(repoRoot: string): void {
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

async function pushWithRetry(
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

// ---------------------------------------------------------------------------
// VersionControl port adapter
// ---------------------------------------------------------------------------

export class GitShellAdapter implements VersionControl {
  private readonly repoRoot: string;
  private readonly logger: PipelineLogger;

  constructor(repoRoot: string, logger: PipelineLogger) {
    this.repoRoot = repoRoot;
    this.logger = logger;
  }

  async createFeatureBranch(slug: string, baseBranch: string): Promise<void> {
    createFeatureBranch(this.repoRoot, slug, baseBranch);
  }

  async getCurrentBranch(): Promise<string> {
    return getCurrentBranch(this.repoRoot);
  }

  async syncBranch(baseBranch: string): Promise<void> {
    syncBranch(this.repoRoot);
  }

  async pushWithRetry(branch: string, maxRetries?: number): Promise<string> {
    await pushWithRetry(this.repoRoot, branch, this.logger, maxRetries);
    return this.getHeadSha();
  }

  async getHeadSha(): Promise<string> {
    return execSync("git rev-parse HEAD", {
      cwd: this.repoRoot,
      encoding: "utf-8",
    }).trim();
  }

  async getRefSha(ref: string): Promise<string | null> {
    // Reject obvious injection shapes — ref is passed straight to `git`.
    // Git refs are alphanumerics plus `/._-` (and `@` / `~` / `^` for rev
    // expressions). Anything else is rejected silently; the caller treats
    // `null` as "couldn't resolve", not "error".
    if (!/^[A-Za-z0-9_./@~^-]+$/.test(ref)) return null;
    try {
      return execSync(`git rev-parse --verify ${ref}`, {
        cwd: this.repoRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null;
    } catch {
      return null;
    }
  }

  async getChangedFiles(fromRef?: string, toRef?: string): Promise<string[]> {
    const from = fromRef ?? "HEAD~1";
    const to = toRef ?? "HEAD";
    const output = execSync(`git diff --name-only ${from} ${to}`, {
      cwd: this.repoRoot,
      encoding: "utf-8",
    }).trim();
    return output ? output.split("\n") : [];
  }
}
