/**
 * harness/limits.ts — Harness defaults, resolved limits, and file-read
 * truncation warnings.
 *
 * Limits resolution cascade:
 *   per-agent toolLimits → config.defaultToolLimits → DEFAULT_* constants.
 */

/** Default max lines returned by file_read per call. */
export const DEFAULT_FILE_READ_LINE_LIMIT = 500;
/** Default max file size (bytes) for file_read. */
export const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
/** Default max bytes returned from shell stdout. */
export const DEFAULT_SHELL_OUTPUT_LIMIT = 64_000;
/** Default timeout for shell executions (ms). */
export const DEFAULT_SHELL_TIMEOUT_MS = 600_000;

/** @deprecated Use DEFAULT_FILE_READ_LINE_LIMIT instead. Kept for backward compatibility with tests. */
export const FILE_READ_LINE_LIMIT = DEFAULT_FILE_READ_LINE_LIMIT;
/** @deprecated Use DEFAULT_MAX_FILE_SIZE instead. */
export const MAX_FILE_SIZE = DEFAULT_MAX_FILE_SIZE;

/**
 * Per-agent resolved harness limits.
 * Built by the copilot-agent handler via resolution cascade:
 *   per-agent toolLimits → config.defaultToolLimits → DEFAULT_* constants.
 */
export interface ResolvedHarnessLimits {
  fileReadLineLimit: number;
  maxFileSize: number;
  shellOutputLimit: number;
  shellTimeoutMs: number;
}

/** Construct ResolvedHarnessLimits from all defaults (used when no per-agent config). */
export function defaultHarnessLimits(): ResolvedHarnessLimits {
  return {
    fileReadLineLimit: DEFAULT_FILE_READ_LINE_LIMIT,
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    shellOutputLimit: DEFAULT_SHELL_OUTPUT_LIMIT,
    shellTimeoutMs: DEFAULT_SHELL_TIMEOUT_MS,
  };
}

export const FILE_TRUNCATION_WARNING =
  "\n\n[SYSTEM WARNING: File truncated at 500 lines to prevent token overflow. " +
  "Use start_line/end_line parameters to paginate, or use roam-code tools for structural AST querying.]";

/** Build a truncation warning with the actual per-agent line limit. */
export function fileTruncationWarning(limit: number): string {
  return (
    `\n\n[SYSTEM WARNING: File truncated at ${limit} lines to prevent token overflow. ` +
    "Use start_line/end_line parameters to paginate, or use roam-code tools for structural AST querying.]"
  );
}
