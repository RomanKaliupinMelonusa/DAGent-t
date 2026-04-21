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

  /** Resolve an arbitrary git ref (branch name, tag, or ref expression)
   *  to its commit SHA. Used by `baseline-analyzer` freshness checks to
   *  detect when the captured baseline is stale relative to the current
   *  base branch tip. Returns `null` when the ref cannot be resolved
   *  (unknown ref, detached state, no git repo). MUST NOT throw. */
  getRefSha?(ref: string): Promise<string | null>;

  /** Get files changed between two refs (or HEAD~1..HEAD). */
  getChangedFiles(fromRef?: string, toRef?: string): Promise<string[]>;
}
