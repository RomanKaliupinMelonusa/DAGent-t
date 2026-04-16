/**
 * session/transient-poll.ts — Shared transient retry loop for CI polling.
 *
 * Extracted from github-ci-poll handler and script-executor to eliminate
 * duplicated transient retry logic. Both callers execute the same poll-ci.sh
 * command with identical retry semantics; only the post-result handling differs.
 */

import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Defaults (overridden by config.transient_retry in apm.yml)
// ---------------------------------------------------------------------------

export const DEFAULT_TRANSIENT_RETRIES = 5;
export const DEFAULT_TRANSIENT_BACKOFF_MS = 30_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransientPollConfig {
  /** Fully-formed shell command to execute. */
  pollCmd: string;
  /** Working directory for the command. */
  cwd: string;
  /** Environment variables for the command. */
  env: Record<string, string | undefined>;
  /** Max number of retries for exit code 2 (transient/network). */
  maxRetries: number;
  /** Backoff delay in ms between transient retries. */
  backoffMs: number;
  /** Max chars to keep from CI logs (tail). Default 15_000. */
  logCharLimit?: number;
  /** Called on each transient retry (for logging). */
  onTransientRetry?: (attempt: number, maxRetries: number) => void;
  /** Execution timeout in ms. Default 1_200_000 (20 min). */
  timeoutMs?: number;
}

export type TransientPollResult =
  | { type: "success"; output: string }
  | { type: "transient_exhausted"; retries: number }
  | { type: "cancelled" }
  | { type: "failed"; message: string; capturedOutput: string };

// ---------------------------------------------------------------------------
// Core loop
// ---------------------------------------------------------------------------

/**
 * Execute a poll command with transient retry logic.
 *
 * Exit code semantics (from poll-ci.sh):
 * - 0: success
 * - 2: transient/network error → sleep + retry
 * - 3: manually cancelled → report and stop
 * - other: hard failure → report with CI logs
 */
export async function runPollWithRetries(
  config: TransientPollConfig,
): Promise<TransientPollResult> {
  const {
    pollCmd,
    cwd,
    env,
    maxRetries,
    backoffMs,
    logCharLimit = 15_000,
    onTransientRetry,
    timeoutMs = 1_200_000,
  } = config;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const output = execSync(pollCmd, {
        cwd,
        stdio: "pipe",
        maxBuffer: 5 * 1024 * 1024,
        timeout: timeoutMs,
        env,
      });
      return { type: "success", output: output.toString() };
    } catch (err: unknown) {
      const execErr = err as {
        stdout?: Buffer;
        stderr?: Buffer;
        message?: string;
        status?: number;
      };
      const ciLogs = execErr.stdout?.toString() ?? "";
      const ciStderr = execErr.stderr?.toString() ?? "";

      let capturedOutput = [ciLogs, ciStderr].filter(Boolean).join("\n");
      if (capturedOutput.length > logCharLimit) {
        capturedOutput =
          "[...TRUNCATED CI LOGS...]\n" + capturedOutput.slice(-logCharLimit);
      }
      const message = execErr.message ?? String(err);

      // ── Exit code 2: Transient network error — sleep and retry ──
      if (execErr.status === 2) {
        if (attempt < maxRetries) {
          onTransientRetry?.(attempt + 1, maxRetries);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        return { type: "transient_exhausted", retries: maxRetries };
      }

      // ── Exit code 3: Manually cancelled ─────────────────────────
      if (execErr.status === 3) {
        return { type: "cancelled" };
      }

      // ── Other exit code: Hard failure ───────────────────────────
      // Re-echo for terminal visibility
      if (ciLogs) console.log(ciLogs);
      if (ciStderr) console.error(ciStderr);

      return { type: "failed", message, capturedOutput };
    }
  }

  // Safety net — should not reach here
  return { type: "transient_exhausted", retries: maxRetries };
}

// ---------------------------------------------------------------------------
// Environment builder
// ---------------------------------------------------------------------------

/**
 * Build the environment variables for poll-ci.sh execution.
 * Shared between github-ci-poll handler and script-executor.
 */
export function buildPollEnv(
  inProgressDir: string,
  slug: string,
  apmConfig: Record<string, unknown> | undefined,
  ciWorkflowKey: string,
): Record<string, string | undefined> {
  return {
    ...process.env,
    POLL_MAX_RETRIES: "60",
    IN_PROGRESS_DIR: inProgressDir,
    SLUG: slug,
    ...(apmConfig?.ciWorkflows
      ? {
          CI_WORKFLOW_FILTER:
            (apmConfig.ciWorkflows as Record<string, string>)[ciWorkflowKey] ??
            "",
        }
      : {}),
    ...(apmConfig?.ciJobs
      ? Object.fromEntries(
          Object.entries(apmConfig.ciJobs as Record<string, string>).map(
            ([key, value]) => [`CI_JOB_MATCH_${key.toUpperCase()}`, value],
          ),
        )
      : {}),
  };
}

/**
 * Build the poll-ci.sh command string with optional SHA pinning.
 */
export function buildPollCmd(
  repoRoot: string,
  lastPushedSha: string | null,
): string {
  const pollScript = path.join(
    repoRoot,
    "tools",
    "autonomous-factory",
    "poll-ci.sh",
  );
  return lastPushedSha
    ? `bash "${pollScript}" --commit "${lastPushedSha}"`
    : `bash "${pollScript}"`;
}

import path from "node:path";
