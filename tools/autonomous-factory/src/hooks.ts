/**
 * hooks.ts — Lifecycle hook execution for the agentic pipeline.
 *
 * Hooks are shell commands configured in apm.yml (`config.hooks`) that abstract
 * cloud-specific operations (deployment verification, smoke checks, auth validation)
 * out of the orchestrator engine. Each app provides its own hook scripts in
 * `.apm/hooks/`, keeping the engine stack-agnostic.
 */

import { execSync } from "node:child_process";
import type { ApmConfig } from "./apm-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HookResult {
  stdout: string;
  exitCode: number;
}

// ---------------------------------------------------------------------------
// Hook execution
// ---------------------------------------------------------------------------

/**
 * Execute a lifecycle hook command configured in apm.yml.
 * Returns null if no hook command is provided.
 *
 * Environment variables from config.environment are merged with the provided
 * overrides and passed to the child process.
 */
export function executeHook(
  hookCommand: string | undefined,
  env: Record<string, string>,
  cwd: string,
  timeout: number = 30_000,
): HookResult | null {
  if (!hookCommand) return null;
  try {
    const stdout = execSync(hookCommand, {
      cwd,
      encoding: "utf-8",
      timeout,
      stdio: "pipe",
      env: { ...process.env, ...env },
    }).trim();
    return { stdout, exitCode: 0 };
  } catch (err: unknown) {
    const exitCode = (err as { status?: number }).status ?? 1;
    const stdout = ((err as { stdout?: Buffer | string }).stdout ?? "").toString().trim();
    return { stdout, exitCode };
  }
}

/**
 * Build the environment variables to pass to a lifecycle hook.
 * Merges config.environment with orchestrator-provided context vars.
 */
export function buildHookEnv(
  config: ApmConfig | undefined,
  overrides: Record<string, string>,
): Record<string, string> {
  return {
    ...(config?.environment ?? {}),
    ...overrides,
  };
}
