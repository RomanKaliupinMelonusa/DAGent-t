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
 *
 * Throws if any value still contains an unresolved `${VAR}` reference,
 * which means the required env var was not set when the APM context was
 * compiled. This fail-fast avoids silent pass-through of literal
 * `${SWA_URL}` strings that cause hooks to curl nonsensical URLs.
 */
export function buildHookEnv(
  config: ApmConfig | undefined,
  overrides: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {
    ...(config?.environment ?? {}),
    ...overrides,
  };

  const UNRESOLVED_RE = /\$\{[A-Z_][A-Z0-9_]*\}/;
  const unresolved = Object.entries(env)
    .filter(([, v]) => UNRESOLVED_RE.test(v));
  if (unresolved.length > 0) {
    const details = unresolved.map(([k, v]) => `${k}=${v}`).join(", ");
    throw new Error(
      `Unresolved environment variables in hook env: ${details}. ` +
      `Export them in your shell, or configure a resolveEnvironment hook in apm.yml ` +
      `to auto-resolve from Terraform outputs.`,
    );
  }

  return env;
}

// ---------------------------------------------------------------------------
// Environment resolution hook
// ---------------------------------------------------------------------------

/**
 * Run the `hooks.resolveEnvironment` script and merge its KEY=VALUE output
 * into config.environment. This runs BEFORE any other hook so that downstream
 * hooks (validateApp, validateInfra) receive resolved URLs.
 *
 * The hook script must print `KEY=VALUE` lines to stdout. Lines that don't
 * match are silently ignored. The resolved values are written directly into
 * the in-memory `config.environment` map AND exported to `process.env` so
 * they survive APM recompilation within the same orchestrator process.
 *
 * Returns the number of environment variables resolved, or 0 if no hook is configured.
 */
export function runResolveEnvironment(
  config: ApmConfig | undefined,
  appRoot: string,
  repoRoot: string,
): number {
  const hookCmd = config?.hooks?.resolveEnvironment;
  if (!hookCmd) return 0;

  const result = executeHook(
    hookCmd,
    { APP_ROOT: appRoot, REPO_ROOT: repoRoot },
    appRoot,
    60_000, // terraform output can be slow
  );

  if (!result || result.exitCode !== 0) {
    const detail = result?.stdout ? `: ${result.stdout}` : "";
    throw new Error(`resolveEnvironment hook failed (exit ${result?.exitCode ?? "??"})${detail}`);
  }

  const KV_RE = /^([A-Z_][A-Z0-9_]*)=(.*)$/;
  let count = 0;

  for (const line of result.stdout.split("\n")) {
    const match = line.trim().match(KV_RE);
    if (!match) continue;
    const [, key, value] = match;

    // Merge into config.environment so buildHookEnv() sees it
    if (config?.environment) {
      // Replace any unresolved ${KEY} reference in existing values
      for (const [envKey, envVal] of Object.entries(config.environment)) {
        if (envVal.includes(`\${${key}}`)) {
          config.environment[envKey] = envVal.replace(`\${${key}}`, value);
        }
      }
    }

    // Also export to process.env so APM recompilation picks it up
    process.env[key] = value;
    count++;
  }

  return count;
}
