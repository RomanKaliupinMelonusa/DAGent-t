/**
 * adapters/shell-hook-executor.ts — HookExecutor adapter over hooks.ts.
 *
 * Wraps the synchronous executeHook function behind the async port interface.
 */

import type { HookExecutor, HookResult } from "../ports/hook-executor.js";
import { executeHook } from "../lifecycle/hooks.js";

export class ShellHookExecutor implements HookExecutor {
  private readonly cwd: string;
  private readonly timeout: number;

  constructor(cwd: string, timeout: number = 30_000) {
    this.cwd = cwd;
    this.timeout = timeout;
  }

  async run(hookCommand: string, env: Record<string, string>): Promise<HookResult> {
    const result = executeHook(hookCommand, env, this.cwd, this.timeout);
    if (!result) {
      return { exitCode: 0, output: "" };
    }
    return { exitCode: result.exitCode, output: result.stdout };
  }
}
