/**
 * ports/shell.ts — Port interface for generic shell command execution.
 *
 * Abstracts `child_process` behind an async contract. Handlers that need
 * to shell out (local-exec, CI polling, artifact download) must depend on
 * this port; the composition root wires the Node-backed adapter.
 *
 * Ports are pure interface declarations — this file must not import
 * node:child_process or any adapter.
 */

export interface ShellExecOptions {
  /** Working directory for the command. */
  readonly cwd?: string;
  /** Environment variables (merged by the adapter with `process.env`). */
  readonly env?: Record<string, string | undefined>;
  /** Max buffer for stdout+stderr (bytes). */
  readonly maxBuffer?: number;
  /** Hard timeout (ms). On expiry the process is killed with SIGTERM. */
  readonly timeoutMs?: number;
}

export interface ShellExecResult {
  readonly stdout: string;
  readonly stderr: string;
  /** Process exit code. Null when the process was killed by signal. */
  readonly exitCode: number | null;
  /** Signal that killed the process, if any (e.g. "SIGTERM"). */
  readonly signal?: string;
  /** True when the process was killed because it exceeded `timeoutMs`. */
  readonly timedOut: boolean;
}

/**
 * Thrown (or returned via `exitCode !== 0`) by adapter implementations
 * when the command fails. The shape mirrors the useful fields of
 * `child_process.ExecException` so callers can migrate without churn.
 */
export interface ShellExecError extends Error {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode: number | null;
  readonly signal?: string;
  readonly timedOut: boolean;
}

export interface Shell {
  /**
   * Run a shell command asynchronously. Resolves with the collected
   * output + exit code on success; rejects with a `ShellExecError` on
   * non-zero exit, timeout, or spawn failure.
   */
  exec(command: string, opts?: ShellExecOptions): Promise<ShellExecResult>;

  /**
   * Run a shell command synchronously. Returns stdout as UTF-8 string.
   * Throws a `ShellExecError` on non-zero exit / timeout. Prefer `exec`;
   * `execSync` is provided for helpers that pipe through multiple calls.
   */
  execSync(command: string, opts?: ShellExecOptions): string;
}
