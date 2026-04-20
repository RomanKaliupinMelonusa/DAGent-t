/**
 * harness/rbac.ts — Config-driven write access control ("The Bouncer").
 *
 * - SAFE_READ_TOOLS — exhaustive registry of tools known to be read-only.
 *   Fail-closed: any tool NOT in this set (and not shell, not a safe MCP
 *   prefix) is treated as a write tool.
 * - checkRbac — single RBAC entry point called by both the session hook
 *   (built-in tools) and the custom shell tool.
 */

import path from "node:path";
import { extractShellWrittenFiles } from "./shell-guards.js";

// ---------------------------------------------------------------------------
// Zero-Trust safe-read registry
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
  "report_outcome",
  // roam-code MCP tools (all are read-only analysis tools)
  "roam_understand", "roam_file_info", "roam_diff", "roam_health", "roam_deps",
  "roam_context", "roam_explore", "roam_search_symbol", "roam_trace", "roam_uses",
  "roam_batch_get", "roam_batch_search", "roam_impact", "roam_affected_tests",
  "roam_complexity_report", "roam_dead_code", "roam_diagnose", "roam_diagnose_issue",
  "roam_pr_risk", "roam_preflight", "roam_prepare_change", "roam_review_change",
  "roam_syntax_check", "roam_expand_toolset",
]);

// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------

export const ERR_WRITE_DENIED =
  "ERROR: Write Access Denied. Your security profile forbids modifying this path. " +
  "If fixing an out-of-scope bug, use report_outcome with status: 'failed' to route the error to the appropriate agent.";

export const ERR_COMMAND_BLOCKED =
  "ERROR: Command execution denied by security profile. " +
  "This command is not authorized for your agent persona.";

// ---------------------------------------------------------------------------
// Path normalization helpers
// ---------------------------------------------------------------------------

/**
 * Convert a repo-relative path to app-relative by stripping the app prefix.
 * Example: "apps/sample-app/service-a/src/index.ts" → "service-a/src/index.ts"
 */
function toAppRelative(repoRelPath: string, appRoot: string, repoRoot: string): string {
  const appPrefix = path.relative(repoRoot, appRoot);
  if (appPrefix && repoRelPath.startsWith(appPrefix + "/")) {
    return repoRelPath.slice(appPrefix.length + 1);
  }
  return repoRelPath;
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

// ---------------------------------------------------------------------------
// RBAC entry point
// ---------------------------------------------------------------------------

/**
 * Run RBAC checks for a tool invocation. Returns a denial message string
 * if the action is blocked, or `null` if allowed.
 *
 * Config-driven: uses `allowedWritePaths`, `blockedCommandRegexes`, and
 * `safeMcpPrefixes` from the agent's security profile instead of hardcoded
 * archetype-based rules.
 *
 * @param hookCwd - The SDK session's working directory (from onPreToolUse input.cwd).
 *   Used to resolve relative shell write paths against the actual execution context.
 */
export function checkRbac(
  toolName: string,
  toolArgs: unknown,
  repoRoot: string,
  allowedWritePaths: RegExp[],
  blockedCommandRegexes: RegExp[],
  safeMcpPrefixes: Set<string>,
  appRoot: string,
  hookCwd?: string,
  /**
   * Read-scope enforcement. `undefined` (default) ⇒ no read check; any
   * array (including empty) ⇒ reads denied unless they match one of these
   * regexes (tested against the app-relative path). Used for Phase A.4
   * SDET blindness: the e2e-author can read the spec + acceptance + tests
   * but not the implementation.
   */
  allowedReadPaths?: RegExp[],
): string | null {
  // Fail-closed write classification: any tool NOT in the safe-read set,
  // not a shell tool, and not from a safe MCP prefix is treated as a write tool.
  const isShellTool = toolName === "bash" || toolName === "write_bash" || toolName === "shell";
  const isMcpNonFs = [...safeMcpPrefixes].some((p) => toolName.startsWith(p));
  const isWriteTool = !SAFE_READ_TOOLS.has(toolName) && !isShellTool && !isMcpNonFs;

  // --- Read-path RBAC (opt-in, via allowedReadPaths) ---
  // Applies to known file-read tools. `report_intent` / `report_outcome`
  // are exempt (they have no file argument). Grep/list tools are exempt
  // because their target is a directory root, not a single file — enforcing
  // on them would break legitimate scanning. Enforcement is on *file*
  // reads: read_file, file_read, view.
  if (allowedReadPaths !== undefined && (toolName === "read_file" || toolName === "file_read" || toolName === "view")) {
    const rawPath = extractFilePath(toolArgs);
    if (rawPath) {
      const relPath = toRepoRelative(rawPath, repoRoot);
      const appRelPath = toAppRelative(relPath, appRoot, repoRoot);
      const isAllowed = allowedReadPaths.some((re) => re.test(appRelPath));
      if (!isAllowed) {
        return (
          `ERROR: Read Access Denied. Your security profile forbids reading '${appRelPath}'. ` +
          `This agent's read scope is restricted to enforce blind-to-impl testing. ` +
          `Work from the spec and acceptance contract instead.`
        );
      }
    }
  }

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
    const appRelPath = toAppRelative(relPath, appRoot, repoRoot);
    if (allowedWritePaths.length === 0) return ERR_WRITE_DENIED;
    const isAllowed = allowedWritePaths.some((re) => re.test(appRelPath));
    if (!isAllowed) {
      return `ERROR: Write Access Denied. Your security profile forbids modifying '${appRelPath}'.`;
    }
  }

  // --- Shell RBAC ---
  if (isShellTool) {
    const args = toolArgs as { command?: string; cwd?: string } | undefined;
    const cmd = String(args?.command ?? "");

    // Check blocked commands first
    for (const re of blockedCommandRegexes) {
      if (re.test(cmd)) return ERR_COMMAND_BLOCKED;
    }

    // Determine the exact directory this command will execute in.
    const effectiveCwd = args?.cwd
      ? path.resolve(repoRoot, args.cwd)
      : (hookCwd || repoRoot);

    // Check shell-based file writes against allowedWritePaths
    const shellFiles = extractShellWrittenFiles(cmd, repoRoot, effectiveCwd);
    for (const sf of shellFiles) {
      const appRelSf = toAppRelative(sf, appRoot, repoRoot);
      if (allowedWritePaths.length === 0) return ERR_WRITE_DENIED;
      if (!allowedWritePaths.some((re) => re.test(appRelSf))) {
        return `ERROR: Write Access Denied. Your security profile forbids modifying '${appRelSf}'.`;
      }
    }
  }

  return null;
}
