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
// Zero-Trust: Safe read-only tools (fail-closed write classification)
// ---------------------------------------------------------------------------

/**
 * Exhaustive set of tools known to be read-only. Any tool NOT in this set
 * (and not a shell tool, and not an MCP tool from a known prefix) is
 * classified as a write tool by `checkRbac`.
 * This is deliberately fail-closed: new tools must be explicitly added here.
 * Exported for unit testing.
 */
export const SAFE_READ_TOOLS = new Set([
  // SDK built-in read tools
  "read_file", "file_read", "view", "grep_search", "list_dir", "list_directory",
  "semantic_search", "search_code",
  // Custom / orchestrator tools
  "report_intent",
  // roam-code MCP tools (all are read-only analysis tools)
  "roam_understand", "roam_file_info", "roam_diff", "roam_health", "roam_deps",
  "roam_context", "roam_explore", "roam_search_symbol", "roam_trace", "roam_uses",
  "roam_batch_get", "roam_batch_search", "roam_impact", "roam_affected_tests",
  "roam_complexity_report", "roam_dead_code", "roam_diagnose", "roam_diagnose_issue",
  "roam_pr_risk", "roam_preflight", "roam_prepare_change", "roam_review_change",
  "roam_syntax_check", "roam_expand_toolset",
]);

/**
 * MCP tool name prefixes whose tools do not write to the local filesystem.
 * Tools matching these prefixes bypass write-path RBAC in `checkRbac`.
 * Playwright tools interact with the browser, not the repo.
 */
const MCP_NON_FILESYSTEM_PREFIXES = ["playwright-", "mermaid-"];

// ---------------------------------------------------------------------------
// Shell write detection — moved from session-runner.ts for RBAC reuse
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
      // Exclude paths outside the repo or pipeline state files
      if (!rel.startsWith("..") && !rel.includes("_STATE.json") && !rel.includes("_TRANS.md")) {
        files.push(rel);
      }
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// RBAC — Agentic Write Access Control ("The Bouncer")
// ---------------------------------------------------------------------------

/** Validator agents can ONLY write to test-related paths. */
export const VALIDATOR_ALLOW_RE = /(^|\/)(e2e|__tests__)\/|(\.test\.|\.spec\.)/;

/** Maker agents are BLOCKED from writing to infra, CI/CD, E2E, and integration test paths. */
export const MAKER_BLOCK_RE = /(^|\/)(infra|\.github|e2e|integration)\//;

/** Maker agents are BLOCKED from running cloud CLI commands. */
export const MAKER_CLOUD_CLI_RE = /(az |aws |terraform )/;

export const ERR_VALIDATOR_WRITE =
  "ERROR: Write Access Denied. You are a Validator. You are strictly forbidden from modifying application " +
  "source code. If the app logic or infra is broken, use pipeline:fail to return a diagnostic report so " +
  "the DAG can route it to the Makers.";

export const ERR_MAKER_WRITE =
  "ERROR: Write Access Denied. You are a Maker. You cannot modify infra state, CI/CD scripts, or " +
  "E2E/Integration tests. If you are missing cloud resources, use pipeline:fail -> infra. If a black-box " +
  "test is fundamentally flawed, use pipeline:fail -> test-code.";

export const ERR_MAKER_CLOUD_CLI =
  "ERROR: Write Access Denied. You are a Maker. You cannot execute cloud CLI commands (az, aws, terraform). " +
  "Infrastructure changes must go through the infra-architect agent via the DAG.";

/** Determine agent archetype from itemKey. Returns "validator", "maker", or null (unconstrained). */
function getAgentArchetype(itemKey: string): "validator" | "maker" | null {
  if (itemKey.includes("test") || itemKey.includes("ui")) return "validator";
  if (itemKey.includes("dev")) return "maker";
  return null;
}

/**
 * Normalize a file path to repo-relative for RBAC checks.
 * Handles absolute paths, repo-relative paths, and SDK arg key variations.
 */
function toRepoRelative(filePath: string, repoRoot: string): string {
  if (path.isAbsolute(filePath)) {
    const prefix = repoRoot + path.sep;
    if (filePath.startsWith(prefix)) return filePath.slice(prefix.length);
    if (filePath === repoRoot) return "";
    return filePath; // Outside repo — let the regex decide
  }
  return filePath;
}

/** Extract file path from SDK tool args (handles multiple key names). */
function extractFilePath(toolArgs: unknown): string | null {
  const args = toolArgs as Record<string, unknown> | undefined;
  if (!args) return null;
  const raw = args.filePath ?? args.path ?? args.file_path;
  return typeof raw === "string" ? raw : null;
}

/**
 * Run RBAC checks for a tool invocation. Returns a denial message string
 * if the action is blocked, or `null` if allowed.
 * @param hookCwd - The SDK session's working directory (from onPreToolUse input.cwd).
 *   Used to resolve relative shell write paths against the actual execution context.
 */
export function checkRbac(
  itemKey: string,
  toolName: string,
  toolArgs: unknown,
  repoRoot: string,
  hookCwd?: string,
): string | null {
  const archetype = getAgentArchetype(itemKey);
  if (!archetype) return null; // Unconstrained agent

  // Fail-closed write classification: any tool NOT in the safe-read set,
  // not a shell tool, and not from a non-filesystem MCP prefix is treated
  // as a write tool.
  const isShellTool = toolName === "bash" || toolName === "write_bash" || toolName === "shell";
  const isMcpNonFs = MCP_NON_FILESYSTEM_PREFIXES.some((p) => toolName.startsWith(p));
  const isWriteTool = !SAFE_READ_TOOLS.has(toolName) && !isShellTool && !isMcpNonFs;

  // --- File write RBAC ---
  if (isWriteTool) {
    const rawPath = extractFilePath(toolArgs);
    if (!rawPath) {
      return (
        `ERROR: Security Policy Violation. The platform cannot determine the target file path ` +
        `for the '${toolName}' tool. You MUST use standard 'write_file' or 'bash' tools.`
      );
    }
    const relPath = toRepoRelative(rawPath, repoRoot);

    if (archetype === "validator") {
      // Validators can ONLY write to test-related paths
      if (!VALIDATOR_ALLOW_RE.test(relPath)) return ERR_VALIDATOR_WRITE;
    } else {
      // Makers are BLOCKED from infra, CI/CD, E2E, integration
      if (MAKER_BLOCK_RE.test(relPath)) return ERR_MAKER_WRITE;
    }
  }

  // --- Shell RBAC ---
  if (isShellTool) {
    const args = toolArgs as { command?: string; cwd?: string } | undefined;
    const cmd = String(args?.command ?? "");

    // Determine the exact directory this command will execute in.
    // Priority: tool arg `cwd` > SDK hook `input.cwd` > repoRoot.
    const effectiveCwd = args?.cwd
      ? path.resolve(repoRoot, args.cwd)
      : (hookCwd || repoRoot);

    if (archetype === "maker") {
      // Block cloud CLI commands
      if (MAKER_CLOUD_CLI_RE.test(cmd)) return ERR_MAKER_CLOUD_CLI;
      // Block shell-based file writes to protected paths
      const shellFiles = extractShellWrittenFiles(cmd, repoRoot, effectiveCwd);
      for (const sf of shellFiles) {
        if (MAKER_BLOCK_RE.test(sf)) return ERR_MAKER_WRITE;
      }
    }

    if (archetype === "validator") {
      // Block shell-based file writes to non-test paths
      const shellFiles = extractShellWrittenFiles(cmd, repoRoot, effectiveCwd);
      for (const sf of shellFiles) {
        if (!VALIDATOR_ALLOW_RE.test(sf)) return ERR_VALIDATOR_WRITE;
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Shared bouncer logic
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

// ---------------------------------------------------------------------------
// Session Hooks
// ---------------------------------------------------------------------------

/**
 * Build SDK session hooks that enforce shell safety, RBAC sandboxing, and
 * file-read truncation on the built-in tools (`bash`, `write_bash`, `read_file`,
 * `write_file`, `edit_file`).
 */
export function buildSessionHooks(
  repoRoot: string,
  itemKey: string,
  allowedCoreTools: Set<string>,
  allowedMcpTools: Set<string>,
  onDenial?: (toolName: string) => void,
): SessionHooks {
  const onPreToolUse = (
    input: { toolName: string; toolArgs: unknown; timestamp: number; cwd: string },
  ): PreToolUseHookOutput | void => {
    // --- UNIVERSAL ZERO-TRUST GATE ---
    // Bypass the gate if the agent hasn't been migrated to explicit tool config yet.
    if (allowedCoreTools.size > 0 || allowedMcpTools.size > 0) {
      const mcpAllowed = allowedMcpTools.has("*") || allowedMcpTools.has(input.toolName);
      if (!allowedCoreTools.has(input.toolName) && !mcpAllowed) {
        const msg = `ERROR: Zero-Trust Policy Violation. The tool '${input.toolName}' is not authorized for your agent persona. Do not attempt to use it again.`;
        onDenial?.(input.toolName);
        return {
          permissionDecision: "deny",
          permissionDecisionReason: msg,
          additionalContext: msg,
        };
      }
    }

    // --- RBAC interceptor (runs before shell bouncers) ---
    const rbacDenial = checkRbac(itemKey, input.toolName, input.toolArgs, repoRoot, input.cwd);
    if (rbacDenial) {
      onDenial?.(input.toolName);
      return {
        permissionDecision: "deny",
        permissionDecisionReason: rbacDenial,
        additionalContext: rbacDenial,
      };
    }

    // --- Shell bouncers (existing logic) ---
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

    const content = input.toolResult?.textResultForLlm;
    if (typeof content !== "string") return;

    const lines = content.split("\n");

    // If the agent provided line boundaries, enforce the absolute cap on slice size.
    if (args?.startLine != null || args?.endLine != null) {
      if (lines.length <= FILE_READ_LINE_LIMIT) return;
      const truncated = lines.slice(0, FILE_READ_LINE_LIMIT).join("\n") +
        `\n\n[SYSTEM WARNING: Output capped at ${FILE_READ_LINE_LIMIT} lines to prevent token overflow.]`;
      return {
        modifiedResult: { ...input.toolResult, textResultForLlm: truncated } as any,
      };
    }

    // No line boundaries — truncate if over the limit.
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
export function buildCustomTools(repoRoot: string, itemKey: string): Tool<any>[] {
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
        const requestedEnd = args.end_line != null ? args.end_line : allLines.length;
        // Enforce absolute cap: never return more than FILE_READ_LINE_LIMIT lines
        const end = Math.min(requestedEnd, start + FILE_READ_LINE_LIMIT);
        let result = allLines.slice(start, end).join("\n");
        if (requestedEnd > start + FILE_READ_LINE_LIMIT) {
          result += `\n\n[SYSTEM WARNING: Requested line range exceeded limit. Output capped at ${FILE_READ_LINE_LIMIT} lines.]`;
        }
        return result;
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
      // Run RBAC checks first (no hookCwd — custom tool resolves cwd from args internally)
      const rbacDenial = checkRbac(itemKey, "shell", args, repoRoot);
      if (rbacDenial) return rbacDenial;

      // Run shared bouncer checks
      const rejection = checkShellCommand(args.command);
      if (rejection) return rejection;

      const cwd = args.cwd ? path.resolve(repoRoot, args.cwd) : repoRoot;

      // Security: prevent cwd traversal outside repo (CWE-22)
      if (cwd !== repoRoot && !cwd.startsWith(repoRoot + path.sep)) {
        return `ERROR: cwd "${args.cwd}" resolves outside the repository root. Use a repo-relative path.`;
      }

      // Coerce all env var values to strings — LLMs may hallucinate
      // booleans/numbers which would crash execSync with a TypeError.
      const safeEnvVars: Record<string, string> = {};
      for (const [key, value] of Object.entries(args.env_vars || {})) {
        safeEnvVars[key] = String(value);
      }
      const env = { ...process.env, ...safeEnvVars };

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
