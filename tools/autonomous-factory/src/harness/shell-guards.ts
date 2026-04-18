/**
 * harness/shell-guards.ts — Shell command bouncers and write-pattern
 * detection.
 *
 * - Bouncer regexes + error messages for banned shell patterns
 *   (cd/pushd, stateless commands, recursive search, raw code reads).
 * - SHELL_WRITE_PATTERNS + extractShellWrittenFiles for RBAC reuse.
 * - checkShellCommand — the single entry point both the session hook and
 *   the custom shell tool call.
 */

import path from "node:path";

// ---------------------------------------------------------------------------
// Bouncer regexes
// ---------------------------------------------------------------------------

/** Matches standalone stateless commands that do nothing in a one-shot exec. */
export const STATELESS_CMD_RE = /^(cd|source|export|alias)\s/;

/** Matches cd/pushd anywhere in the command (standalone or chained).
 *  Forces agents to use the trackable `cwd` parameter instead. */
export const CD_CMD_RE = /(^|[;|&]\s*)(cd|pushd)\s/;

export const ERR_CD_CMD =
  "ERROR: Do not use `cd` or `pushd` in shell commands. " +
  "You MUST use the `cwd` parameter of the shell tool to set the working directory.";

/** Matches unbounded recursive text searches (grep -r, find, ag, rg). */
export const RECURSIVE_SEARCH_RE = /(grep\s+.*-[a-zA-Z]*[rR]|find\s+(?:\.|src|apps|packages|lib|bin)|ag\s+|rg\s+)/;

/** Source code file extensions that should not be raw-read via bash. */
export const CODE_FILE_RE = /\.(ts|tsx|js|jsx|py|go|java|rs|tf)$/;

/** Detects any shell compound/chaining operator (&&, ||, ;, newline). */
export const SHELL_CHAIN_RE = /(&&|\|\||;|\n)/;

/** Matches cat or grep commands (prefix check for code-read ban). */
export const CODE_READ_CMD_RE = /(cat|grep) /;

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

export const ERR_STATELESS_CMD =
  "ERROR: Shell executions are stateless. Standalone `cd`, `source`, `export`, or `alias` commands do nothing " +
  "and are FORBIDDEN. You MUST use the `cwd` and `env_vars` JSON parameters to control execution state.";

export const ERR_RECURSIVE_SEARCH =
  "ERROR: Unbounded recursive text search is disabled to prevent token overflow. " +
  "Target specific files using grep on individual paths, or use `roam-code` to semantically search the codebase.";

export const ERR_CODE_READ =
  "ERROR: You are attempting to raw-read or text-search a source code file via bash. " +
  "This causes silent context bloat. You MUST use the `file_read` tool with line limits, " +
  "or use `roam_context` to understand source code.";

// ---------------------------------------------------------------------------
// Shell write detection
// ---------------------------------------------------------------------------

/**
 * Shell command patterns that write files.
 * Used to detect file mutations done via bash/write_bash tool calls
 * (e.g. `sed -i`, `tee`, `echo >`) instead of SDK write_file/edit_file.
 * Each regex captures the target file path in group 1.
 * Exported for unit testing.
 */
export const SHELL_WRITE_PATTERNS: readonly RegExp[] = [
  /\bsed\s+-i(?:\s+'[^']*'|\s+"[^"]*"|\s+[^\s]+)*\s+([^\s;|&>]+)/,    // sed -i 's/x/y/' <file>
  /\btee\s+(?:-a\s+)?([^\s;|&>]+)/,                                       // tee <file> or tee -a <file>
  /\bcat\s*>\s*([^\s;|&]+)/,                                               // cat > <file>
  /\becho\s+.*?>{1,2}\s*([^\s;|&>]+)/,                                     // echo ... > <file> or echo ... >> <file>
  /\bprintf\s+.*?>{1,2}\s*([^\s;|&>]+)/,                                   // printf ... > <file> or printf ... >> <file>
  /\bcp\s+(?:-[a-zA-Z]+\s+)?[^\s]+\s+([^\s;|&]+)/,                        // cp <src> <dest>
  /\bmv\s+(?:-[a-zA-Z]+\s+)?[^\s]+\s+([^\s;|&]+)/,                        // mv <src> <dest>
];

/**
 * Extract file paths written by a shell command.
 * Matches against SHELL_WRITE_PATTERNS and returns workspace-relative paths.
 * @param execCwd - The actual working directory the command executes in.
 *   Relative paths in the command are resolved against this, not repoRoot.
 * Exported for unit testing.
 */
export function extractShellWrittenFiles(cmd: string, repoRoot: string, execCwd: string = repoRoot): string[] {
  const files: string[] = [];
  for (const re of SHELL_WRITE_PATTERNS) {
    const m = cmd.match(re);
    if (m?.[1]) {
      const raw = m[1].replace(/["']/g, "");
      // Resolve against the actual execution directory, NOT just repoRoot
      const abs = path.isAbsolute(raw) ? raw : path.resolve(execCwd, raw);
      const rel = path.relative(repoRoot, abs);
      // Only exclude paths outside the repository. The allow-list handles everything else.
      if (!rel.startsWith("..")) {
        files.push(rel);
      }
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// Shared bouncer entry point
// ---------------------------------------------------------------------------

/**
 * Run all shell command bouncers. Returns an error string if the command
 * is banned, or `null` if it should be allowed through.
 */
export function checkShellCommand(cmd: string): string | null {
  const trimmed = cmd.trim();

  // Ban 0: cd/pushd anywhere in command — forces use of trackable `cwd` param
  if (CD_CMD_RE.test(trimmed)) {
    return ERR_CD_CMD;
  }

  // Ban 1: Stateless commands (unless part of a compound/chained command)
  if (STATELESS_CMD_RE.test(trimmed) && !SHELL_CHAIN_RE.test(trimmed)) {
    return ERR_STATELESS_CMD;
  }

  // Ban 2: Recursive search
  if (RECURSIVE_SEARCH_RE.test(trimmed)) {
    return ERR_RECURSIVE_SEARCH;
  }

  // Ban 3: Raw-reading code files via cat/grep
  if (CODE_READ_CMD_RE.test(trimmed) && CODE_FILE_RE.test(trimmed)) {
    return ERR_CODE_READ;
  }

  return null;
}
