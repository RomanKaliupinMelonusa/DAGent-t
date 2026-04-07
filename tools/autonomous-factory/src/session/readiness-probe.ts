/**
 * session/readiness-probe.ts — Data-plane readiness probing and validation hooks.
 *
 * Extracted from session-runner.ts for Single Responsibility.
 * Contains pollReadiness, runValidateApp, and runValidateInfra.
 */

import { executeHook, buildHookEnv } from "../hooks.js";
import type { PipelineRunConfig } from "../session-runner.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum total time (ms) to wait for data-plane readiness before proceeding.
 * If all probes time out, the agent session starts anyway — the agent will
 * produce a structured diagnostic that triage can route.
 */
export const READINESS_PROBE_TIMEOUT_MS = 180_000;

/**
 * HTTP status codes that indicate the data plane is live.
 * 200 = healthy, 401/403 = endpoint exists but auth required.
 */
export const READINESS_OK_CODES = new Set([200, 401, 403]);

// ---------------------------------------------------------------------------
// Readiness probe
// ---------------------------------------------------------------------------

/**
 * Deterministic readiness probe — replaces the fixed-duration sleep.
 *
 * Primary: delegates to the `validateApp` hook from apm.yml, looping with
 * exponential backoff until the hook returns success (exit 0). This lets each
 * app define what "ready" means (e.g., feature routes propagated, not just
 * the root URL returning 200).
 *
 * Fallback: when no validateApp hook is configured, falls back to a fixed
 * 60-second propagation delay.
 *
 * Stack-agnostic: only needs bash hooks, not CI-provider commands.
 */
export async function pollReadiness(config: PipelineRunConfig): Promise<void> {
  const hookCmd = config.apmContext.config?.hooks?.validateApp;

  // ── Primary path: hook-based readiness ──────────────────────────────────
  if (hookCmd) {
    console.log("  🔍 Readiness probe: polling via validateApp hook...");
    const start = Date.now();
    let delay = 2_000;
    const maxDelay = 30_000;

    while (Date.now() - start < READINESS_PROBE_TIMEOUT_MS) {
      const failure = runValidateApp(config);
      if (failure === null) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`  ✅ App ready (validateApp hook passed) after ${elapsed}s`);
        return;
      }
      console.log(`  🔍 validateApp: ${failure.slice(0, 120)} (retrying in ${delay / 1000}s)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, maxDelay);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.warn(`  ⚠ Readiness probe timed out after ${elapsed}s — proceeding anyway`);
    return;
  }

  // ── Fallback: fixed delay when no hook is configured ────────────────────
  console.log("  ⏳ No validateApp hook configured — falling back to 60s propagation delay");
  await new Promise((resolve) => setTimeout(resolve, 60_000));
}

// ---------------------------------------------------------------------------
// Self-Mutating Validation Hooks
// ---------------------------------------------------------------------------

/**
 * Validate deployed application endpoints after CI completes.
 * Delegates to the `hooks.validateApp` command from apm.yml config.
 * The hook script is a self-mutating bash file — agents append endpoint
 * checks as they create new routes/services.
 *
 * Returns a failure reason string if exit code 1, or `null` if pass.
 */
export function runValidateApp(config: PipelineRunConfig): string | null {
  const { appRoot, apmContext } = config;
  const hookCmd = apmContext.config?.hooks?.validateApp;
  if (!hookCmd) return null;

  const env = buildHookEnv(apmContext.config, {
    APP_ROOT: appRoot,
    REPO_ROOT: config.repoRoot,
  });

  try {
    const result = executeHook(hookCmd, env, appRoot, 60_000);
    if (!result) return null;
    if (result.exitCode === 1 && result.stdout) {
      return result.stdout;
    }
    return null; // Pass
  } catch {
    return null; // Inconclusive — let agent handle it
  }
}

/**
 * Validate deployed infrastructure reachability after infra-handoff.
 * Delegates to the `hooks.validateInfra` command from apm.yml config.
 * The hook script is a self-mutating bash file — @infra-architect appends
 * reachability checks as new data-plane resources are provisioned.
 *
 * Returns a failure reason string if exit code 1, or `null` if pass.
 */
export function runValidateInfra(config: PipelineRunConfig): string | null {
  const { appRoot, apmContext } = config;
  const hookCmd = apmContext.config?.hooks?.validateInfra;
  if (!hookCmd) return null;

  const env = buildHookEnv(apmContext.config, {
    APP_ROOT: appRoot,
    REPO_ROOT: config.repoRoot,
  });

  try {
    const result = executeHook(hookCmd, env, appRoot, 60_000);
    if (!result) return null;
    if (result.exitCode === 1 && result.stdout) {
      return result.stdout;
    }
    return null; // Pass
  } catch {
    return null; // Inconclusive — let agent handle it
  }
}
