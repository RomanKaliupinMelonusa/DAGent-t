/**
 * adapters/node-shell-adapter.ts — Shell port adapter over node:child_process.
 *
 * Translates the generic `Shell` port into concrete `exec` / `execSync`
 * calls. All error paths produce a `ShellExecError` that preserves the
 * captured stdout/stderr and the exit signal metadata.
 */

import { exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import type {
  Shell,
  ShellExecError,
  ShellExecOptions,
  ShellExecResult,
} from "../ports/shell.js";

const execAsync = promisify(exec);

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB

function buildEnv(env?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  if (!env) return process.env;
  return { ...process.env, ...env };
}

function toShellError(
  err: unknown,
  timeoutMs: number | undefined,
): ShellExecError {
  const execErr = err as {
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    code?: number;
    status?: number;
    killed?: boolean;
    signal?: string;
    message?: string;
  };
  const stdout =
    typeof execErr.stdout === "string"
      ? execErr.stdout
      : execErr.stdout?.toString() ?? "";
  const stderr =
    typeof execErr.stderr === "string"
      ? execErr.stderr
      : execErr.stderr?.toString() ?? "";
  const exitCode =
    typeof execErr.code === "number"
      ? execErr.code
      : typeof execErr.status === "number"
        ? execErr.status
        : null;
  const signal = execErr.signal ?? undefined;
  const timedOut =
    Boolean(execErr.killed) && signal === "SIGTERM" && timeoutMs !== undefined;

  const error = new Error(execErr.message ?? "shell execution failed") as Error & {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal?: string;
    timedOut: boolean;
  };
  error.stdout = stdout;
  error.stderr = stderr;
  error.exitCode = exitCode;
  if (signal) error.signal = signal;
  error.timedOut = timedOut;
  return error;
}

export class NodeShellAdapter implements Shell {
  async exec(
    command: string,
    opts: ShellExecOptions = {},
  ): Promise<ShellExecResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: opts.cwd,
        env: buildEnv(opts.env),
        maxBuffer: opts.maxBuffer ?? DEFAULT_MAX_BUFFER,
        timeout: opts.timeoutMs,
      });
      return {
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
        exitCode: 0,
        timedOut: false,
      };
    } catch (err) {
      throw toShellError(err, opts.timeoutMs);
    }
  }

  execSync(command: string, opts: ShellExecOptions = {}): string {
    try {
      return execSync(command, {
        cwd: opts.cwd,
        env: buildEnv(opts.env),
        maxBuffer: opts.maxBuffer ?? DEFAULT_MAX_BUFFER,
        timeout: opts.timeoutMs,
        stdio: "pipe",
      }).toString();
    } catch (err) {
      throw toShellError(err, opts.timeoutMs);
    }
  }
}
