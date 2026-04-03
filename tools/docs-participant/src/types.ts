import type * as vscode from "vscode";

/** Categorization of a documentation file by its location in the monorepo. */
export type DocCategory = "platform" | "operational" | "engine" | "app";

/** A documentation file discovered by the scanner. */
export interface DocFile {
  /** Absolute URI of the file. */
  uri: vscode.Uri;
  /** Workspace-relative path (forward slashes). */
  relativePath: string;
  /** Category inferred from the file's location. */
  category: DocCategory;
  /** Roam-code boundary scope for AST queries. Empty string = global (no boundary). */
  roamScope: string;
}

/** A single documentation update to be applied. */
export interface DocUpdate {
  /** Target file URI. */
  uri: vscode.Uri;
  /** Workspace-relative path. */
  relativePath: string;
  /** Full new content for the file. */
  newContent: string;
  /** One-line summary of what changed. */
  changeSummary: string;
}

/** Result of the staleness analysis (roam or git-fallback). */
export interface StalenessReport {
  /** Files that appear stale relative to code changes. */
  staleFiles: string[];
  /** Raw analysis text from roam or git. */
  rawAnalysis: string;
  /** Whether roam-code was used (true) or git-only fallback (false). */
  usedRoam: boolean;
}

/** Git diff context gathered for the current branch. */
export interface GitDiffContext {
  /** Files changed on the branch (relative paths). */
  changedFiles: string[];
  /** Summarized diff text (truncated to token budget). */
  diffSummary: string;
  /** The base branch name (e.g. "main", "develop"). */
  baseBranch: string;
}

/** Result returned from the chat handler via ChatResult.metadata. */
export interface DocsChatResult {
  /** Which slash command was used (or "inferred"). */
  command: string;
  /** Number of docs updated. */
  updatedCount: number;
  /** Paths of updated docs. */
  updatedFiles: string[];
}

/** Allowed roam-code tool names (read-only). */
export const ALLOWED_ROAM_TOOLS = [
  "roam_pr_diff",
  "roam_doc_staleness",
  "roam_context",
  "roam_understand",
] as const;

/** Denied roam-code tool names (mutation / write). */
export const DENIED_ROAM_TOOLS = [
  "roam_mutate",
  "roam_safe_delete",
  "roam_semantic_diff",
  "roam_syntax_check",
  "roam_prepare_change",
  "roam_review_change",
] as const;
