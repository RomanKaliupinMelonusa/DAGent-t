/**
 * ports/version-control.ts — Port interface for git operations.
 *
 * Abstracts synchronous git plumbing behind an async interface.
 * Production adapter wraps git-ops.ts; tests use a stub.
 */

export interface VersionControl {
  /** Create and checkout a feature branch. */
  createFeatureBranch(slug: string, baseBranch: string): Promise<void>;

  /** Get the current branch name. */
  getCurrentBranch(): Promise<string>;

  /** Sync the feature branch with the base branch (rebase or merge). */
  syncBranch(baseBranch: string): Promise<void>;

  /** Push with retry logic. Returns the pushed SHA. */
  pushWithRetry(branch: string, maxRetries?: number): Promise<string>;

  /** Get the current HEAD SHA. */
  getHeadSha(): Promise<string>;

  /** Get files changed between two refs (or HEAD~1..HEAD). */
  getChangedFiles(fromRef?: string, toRef?: string): Promise<string[]>;
}
