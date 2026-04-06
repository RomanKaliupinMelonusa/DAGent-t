/**
 * session/readiness-probe.ts — Data-plane readiness probing and validation hooks.
 *
 * Extracted from session-runner.ts for Single Responsibility.
 * Contains pollReadiness, runValidateApp, and runValidateInfra.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
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
 * Fallback: when no validateApp hook is configured, parses `infra-interfaces.md`
 * for base URLs and polls them with curl (backward compat).
 *
 * Stack-agnostic: only needs bash hooks or HTTP endpoints, not CI-provider commands.
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

  // ── Fallback: URL-based polling from infra-interfaces.md ────────────────
  const interfacesPath = path.join(config.appRoot, "in-progress", "infra-interfaces.md");
  if (!fs.existsSync(interfacesPath)) {
    console.log("  ⏳ No validateApp hook and no infra-interfaces.md — falling back to 60s propagation delay");
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    return;
  }

  // Parse base URLs from the ## Endpoints section
  const content = fs.readFileSync(interfacesPath, "utf-8");
  const urls: string[] = [];
  let inEndpoints = false;
  for (const line of content.split("\n")) {
    if (/^##\s+Endpoints/i.test(line)) { inEndpoints = true; continue; }
    if (inEndpoints && /^##\s/.test(line)) break; // Next section
    if (inEndpoints) {
      const match = line.match(/https?:\/\/[^\s)>]+/);
      if (match) urls.push(match[0].replace(/\/+$/, ""));
    }
  }

  if (urls.length === 0) {
    console.log("  ⏳ No endpoint URLs found in infra-interfaces.md — falling back to 60s delay");
    await new Promise((resolve) => setTimeout(resolve, 60_000));
    return;
  }

  console.log(`  🔍 Readiness probe: checking ${urls.length} endpoint(s)...`);

  const start = Date.now();
  let delay = 2_000; // Start at 2s, exponential backoff
  const maxDelay = 30_000;

  while (Date.now() - start < READINESS_PROBE_TIMEOUT_MS) {
    let allReady = true;
    for (const url of urls) {
      try {
        const result = execSync(
          `curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${url}"`,
          { encoding: "utf-8", timeout: 15_000 },
        ).trim();
        const code = parseInt(result, 10);
        if (READINESS_OK_CODES.has(code)) {
          continue; // This URL is ready
        }
        allReady = false;
        console.log(`  🔍 ${url} → HTTP ${code} (not ready, retrying in ${delay / 1000}s)`);
      } catch {
        allReady = false;
        console.log(`  🔍 ${url} → connection failed (retrying in ${delay / 1000}s)`);
      }
    }

    if (allReady) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  ✅ All endpoints ready after ${elapsed}s`);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(delay * 2, maxDelay);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.warn(`  ⚠ Readiness probe timed out after ${elapsed}s — proceeding anyway`);
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
