import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitDiffContext } from "./types.js";

const execFileAsync = promisify(execFile);

const MAX_DIFF_CHARS = 60_000; // ~15k tokens — fits comfortably in most model contexts

/**
 * Run a git command safely in the given working directory.
 * Uses execFile (no shell) to prevent command injection.
 */
async function git(
  args: string[],
  cwd: string,
): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 10 * 1024 * 1024, // 10 MB
    timeout: 30_000,
  });
  return stdout.trim();
}

/** Detect the base branch (origin/main or origin/develop). */
export async function getBaseBranch(cwd: string): Promise<string> {
  try {
    await git(["rev-parse", "--verify", "origin/main"], cwd);
    return "origin/main";
  } catch {
    try {
      await git(["rev-parse", "--verify", "origin/develop"], cwd);
      return "origin/develop";
    } catch {
      // Fallback: use HEAD~10 if no remote branch found
      return "HEAD~10";
    }
  }
}

/** Get the list of files changed between the base branch and HEAD. */
async function getChangedFiles(
  cwd: string,
  base: string,
): Promise<string[]> {
  try {
    const output = await git(
      ["diff", `${base}...HEAD`, "--name-only", "--diff-filter=ACMRT"],
      cwd,
    );
    return output ? output.split("\n").filter(Boolean) : [];
  } catch {
    // Fallback to staged changes
    const output = await git(
      ["diff", "--staged", "--name-only", "--diff-filter=ACMRT"],
      cwd,
    );
    return output ? output.split("\n").filter(Boolean) : [];
  }
}

/** Get a summarized diff of changes on the current branch. */
export async function getDetailedDiff(
  cwd: string,
  base?: string,
): Promise<string> {
  const b = base ?? await getBaseBranch(cwd);
  try {
    const output = await git(
      ["diff", `${b}...HEAD`, "--stat", "--patch", "--no-color"],
      cwd,
    );
    return truncate(output);
  } catch {
    const output = await git(
      ["diff", "--staged", "--stat", "--patch", "--no-color"],
      cwd,
    );
    return truncate(output);
  }
}

/** Get a compact stat summary of changes. */
async function getDiffStat(cwd: string, base: string): Promise<string> {
  try {
    return await git(["diff", `${base}...HEAD`, "--stat", "--no-color"], cwd);
  } catch {
    return await git(["diff", "--staged", "--stat", "--no-color"], cwd);
  }
}

/** Get recent commit messages on the branch. */
export async function getCommitLog(
  cwd: string,
  base?: string,
): Promise<string> {
  const b = base ?? await getBaseBranch(cwd);
  try {
    return await git(
      ["log", `${b}..HEAD`, "--oneline", "--no-decorate", "-n", "30"],
      cwd,
    );
  } catch {
    return "";
  }
}

/**
 * Gather all git diff context into a single object.
 * Calls getBaseBranch once and passes it to all sub-functions.
 */
export async function gatherGitContext(cwd: string): Promise<GitDiffContext> {
  const baseBranch = await getBaseBranch(cwd);

  const [changedFiles, diffSummary] = await Promise.all([
    getChangedFiles(cwd, baseBranch),
    getDiffStat(cwd, baseBranch),
  ]);

  return { changedFiles, diffSummary, baseBranch };
}

function truncate(text: string): string {
  if (text.length <= MAX_DIFF_CHARS) return text;
  return (
    text.slice(0, MAX_DIFF_CHARS) +
    "\n\n[... diff truncated to fit token budget ...]"
  );
}
