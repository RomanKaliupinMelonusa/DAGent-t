/**
 * tool-harness.ts — Stateless shell enforcement & token overflow protection.
 *
 * Provides two SDK integration surfaces:
 *   1. Session hooks (onPreToolUse / onPostToolUse) that intercept the built-in
 *      `bash`/`write_bash`/`read_file` tools to enforce architectural bans.
 *   2. Custom tools (`file_read`, `shell`) registered via defineTool() that
 *      give agents structured, safe alternatives.
 *
 * All bouncer regexes and error messages are exported as named constants
 * for unit testing.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { defineTool } from "@github/copilot-sdk";
import type { Tool, ToolResultObject } from "@github/copilot-sdk";

// SessionHooks / PreToolUseHookOutput / PostToolUseHookOutput are not
// re-exported from the SDK's main entry point, so we define minimal
// structural types to stay decoupled from the SDK's internal paths.

interface PreToolUseHookInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
}
interface PreToolUseHookOutput {
  permissionDecision?: "allow" | "deny" | "ask";
  permissionDecisionReason?: string;
  modifiedArgs?: unknown;
  additionalContext?: string;
  suppressOutput?: boolean;
}
interface PostToolUseHookInput {
  timestamp: number;
  cwd: string;
  toolName: string;
  toolArgs: unknown;
  toolResult: ToolResultObject;
}
interface PostToolUseHookOutput {
  modifiedResult?: ToolResultObject;
  additionalContext?: string;
  suppressOutput?: boolean;
}
interface SessionHooks {
  onPreToolUse?: (input: PreToolUseHookInput, invocation: { sessionId: string }) => PreToolUseHookOutput | void | Promise<PreToolUseHookOutput | void>;
  onPostToolUse?: (input: PostToolUseHookInput, invocation: { sessionId: string }) => PostToolUseHookOutput | void | Promise<PostToolUseHookOutput | void>;
}

// ---------------------------------------------------------------------------
// Constants — exported for testing
// ---------------------------------------------------------------------------

/** Max lines returned by file_read (and post-hook truncation) when no line range is specified. */
export const FILE_READ_LINE_LIMIT = 500;

/** Max file size (bytes) that file_read will load into memory. Prevents OOM on huge logs/dumps. */
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

/** Max bytes returned from shell stdout to prevent context bloat. */
const SHELL_OUTPUT_LIMIT = 64_000;

/** Timeout for shell executions (ms). */
const SHELL_TIMEOUT_MS = 120_000;

// --- Bouncer regexes ---

/** Matches standalone stateless commands that do nothing in a one-shot exec. */
export const STATELESS_CMD_RE = /^(cd|source|export|alias)\s/;

/** Matches unbounded recursive text searches (grep -r, find, ag, rg). */
export const RECURSIVE_SEARCH_RE = /(grep\s+.*-[a-zA-Z]*[rR]|find\s+(?:\.|src|apps|packages|lib|bin)|ag\s+|rg\s+)/;

/** Source code file extensions that should not be raw-read via bash. */
export const CODE_FILE_RE = /\.(ts|tsx|js|jsx|py|go|java|rs|tf)$/;

/** Detects any shell compound/chaining operator (&&, ||, ;, newline). */
export const SHELL_CHAIN_RE = /(&&|\|\||;|\n)/;

/** Matches cat or grep commands (prefix check for code-read ban). */
export const CODE_READ_CMD_RE = /(cat|grep) /;

// --- Error messages ---

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

export const FILE_TRUNCATION_WARNING =
  "\n\n[SYSTEM WARNING: File truncated at 500 lines to prevent token overflow. " +
  "Use start_line/end_line parameters to paginate, or use roam-code tools for structural AST querying.]";

// ---------------------------------------------------------------------------
// Shared bouncer logic
// ---------------------------------------------------------------------------

/**
 * Run all shell command bouncers. Returns an error string if the command
 * is banned, or `null` if it should be allowed through.
 */
export function checkShellCommand(cmd: string): string | null {
  const trimmed = cmd.trim();

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

// ---------------------------------------------------------------------------
// Session Hooks
// ---------------------------------------------------------------------------

/**
 * Build SDK session hooks that enforce shell safety and file-read truncation
 * on the built-in tools (`bash`, `write_bash`, `read_file`).
 */
export function buildSessionHooks(
  repoRoot: string,
  onDenial?: (toolName: string) => void,
): SessionHooks {
  const onPreToolUse = (
    input: { toolName: string; toolArgs: unknown; timestamp: number; cwd: string },
  ): PreToolUseHookOutput | void => {
    // Only intercept bash/write_bash
    if (input.toolName !== "bash" && input.toolName !== "write_bash") return;

    const args = input.toolArgs as { command?: string } | undefined;
    const cmd = String(args?.command ?? "");
    const rejection = checkShellCommand(cmd);

    if (rejection) {
      onDenial?.(input.toolName);
      return {
        permissionDecision: "deny",
        permissionDecisionReason: rejection,
        additionalContext: rejection,
      };
    }
  };

  const onPostToolUse = (
    input: { toolName: string; toolArgs: unknown; toolResult: { textResultForLlm: string; resultType: string }; timestamp: number; cwd: string },
  ): PostToolUseHookOutput | void => {
    // Belt-and-suspenders truncation on the built-in read_file
    if (input.toolName !== "read_file") return;

    const args = input.toolArgs as { startLine?: number; endLine?: number } | undefined;
    // Only truncate when the agent didn't provide line boundaries
    if (args?.startLine != null || args?.endLine != null) return;

    const content = input.toolResult?.textResultForLlm;
    if (typeof content !== "string") return;

    const lines = content.split("\n");
    if (lines.length <= FILE_READ_LINE_LIMIT) return;

    const truncated = lines.slice(0, FILE_READ_LINE_LIMIT).join("\n") + FILE_TRUNCATION_WARNING;
    return {
      modifiedResult: {
        ...input.toolResult,
        textResultForLlm: truncated,
      } as any,
    };
  };

  return { onPreToolUse, onPostToolUse };
}

// ---------------------------------------------------------------------------
// Custom Tools
// ---------------------------------------------------------------------------

/**
 * Build custom tools that provide structured, safe alternatives to the
 * built-in bash and read_file tools.
 */
export function buildCustomTools(repoRoot: string): Tool<any>[] {
  // -- file_read tool --
  const fileReadTool = defineTool("file_read", {
    description: "Read the contents of a file safely. Use this instead of 'cat'.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Absolute or repo-relative path to the file." },
        start_line: { type: "number", description: "OPTIONAL: 1-indexed start line." },
        end_line: { type: "number", description: "OPTIONAL: 1-indexed end line." },
      },
      required: ["file_path"],
    },
    handler: (args: { file_path: string; start_line?: number; end_line?: number }) => {
      const filePath = path.isAbsolute(args.file_path)
        ? args.file_path
        : path.resolve(repoRoot, args.file_path);

      // Security: prevent path traversal outside repo (CWE-22)
      // Use separator-boundary check to prevent sibling-directory bypass
      // e.g. /workspaces/DAGent-t-evil/ would pass a naive startsWith check
      const resolved = path.resolve(filePath);
      if (resolved !== repoRoot && !resolved.startsWith(repoRoot + path.sep)) {
        return `ERROR: Path "${args.file_path}" resolves outside the repository root.`;
      }

      // Guard against OOM: check file size before reading into memory.
      // Node.js will crash the entire process on multi-GB files.
      let stats: fs.Stats;
      try {
        stats = fs.statSync(resolved);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `ERROR: Could not stat file: ${msg}`;
      }
      if (stats.size > MAX_FILE_SIZE) {
        return (
          `ERROR: File is too large (${(stats.size / 1024 / 1024).toFixed(2)} MB). ` +
          `Maximum allowed size for file_read is ${MAX_FILE_SIZE / 1024 / 1024} MB. ` +
          "Use shell tools like 'head', 'tail', or 'grep' to extract specific information from large files."
        );
      }

      let content: string;
      try {
        content = fs.readFileSync(resolved, "utf-8");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return `ERROR: Could not read file: ${msg}`;
      }

      const allLines = content.split("\n");
      const hasLineRange = args.start_line != null || args.end_line != null;

      if (hasLineRange) {
        // 1-indexed → 0-indexed slicing
        const start = Math.max(0, (args.start_line ?? 1) - 1);
        const end = args.end_line != null ? args.end_line : allLines.length;
        return allLines.slice(start, end).join("\n");
      }

      // No line range — enforce truncation limit
      if (allLines.length > FILE_READ_LINE_LIMIT) {
        return allLines.slice(0, FILE_READ_LINE_LIMIT).join("\n") + FILE_TRUNCATION_WARNING;
      }

      return content;
    },
  });

  // -- shell tool --
  const shellTool = defineTool("shell", {
    description:
      "Execute a stateless shell command. Use `cwd` to set the working directory " +
      "and `env_vars` to inject environment variables instead of `cd`, `export`, or `source`.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command to run." },
        cwd: {
          type: "string",
          description: "OPTIONAL: Absolute or repo-relative path (e.g., 'apps/sample-app/backend').",
        },
        env_vars: {
          type: "object",
          description: 'OPTIONAL: Key-value pairs to inject (e.g., {"NODE_ENV": "test"}).',
        },
      },
      required: ["command"],
    },
    handler: (args: { command: string; cwd?: string; env_vars?: Record<string, string> }) => {
      // Run shared bouncer checks
      const rejection = checkShellCommand(args.command);
      if (rejection) return rejection;

      const cwd = args.cwd ? path.resolve(repoRoot, args.cwd) : repoRoot;

      // Security: prevent cwd traversal outside repo (CWE-22)
      if (cwd !== repoRoot && !cwd.startsWith(repoRoot + path.sep)) {
        return `ERROR: cwd "${args.cwd}" resolves outside the repository root. Use a repo-relative path.`;
      }

      const env = { ...process.env, ...(args.env_vars || {}) };

      try {
        const stdout = execSync(args.command, {
          cwd,
          env,
          encoding: "utf-8",
          timeout: SHELL_TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024, // 10 MB
        });

        // Cap output to prevent token bloat
        if (stdout.length > SHELL_OUTPUT_LIMIT) {
          return (
            stdout.slice(0, SHELL_OUTPUT_LIMIT) +
            `\n\n[SYSTEM WARNING: Output truncated at ${SHELL_OUTPUT_LIMIT} characters. ` +
            "Pipe through head/tail/grep to narrow results.]"
          );
        }
        return stdout;
      } catch (err: unknown) {
        if (err && typeof err === "object" && "stderr" in err) {
          const e = err as { stderr?: string; stdout?: string; status?: number };
          const stderr = String(e.stderr ?? "").slice(0, 4000);
          const stdout = String(e.stdout ?? "").slice(0, 4000);
          return `EXIT ${e.status ?? 1}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
        }
        return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });

  return [fileReadTool, shellTool];
}
