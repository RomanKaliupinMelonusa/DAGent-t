/**
 * ports/hook-executor.ts — Port interface for lifecycle hook execution.
 *
 * Abstracts shell-based pre/post hooks behind an async interface.
 */

export interface HookResult {
  /** Exit code of the hook script. */
  exitCode: number;
  /** Combined stdout + stderr output. */
  output: string;
}

export interface HookExecutor {
  /** Execute a named lifecycle hook (e.g. "preflightAuth", "prePush"). */
  run(hookName: string, env: Record<string, string>): Promise<HookResult>;
}
