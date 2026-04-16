/**
 * session/lifecycle-hooks.ts — Generic pre/post lifecycle hook execution.
 *
 * Centralizes the shell hook execution that was split between:
 * - local-exec handler (node.pre — only for script nodes)
 * - session-runner (node.post — for all nodes, inline ~50 lines)
 *
 * Now the kernel calls these generically for ALL handler types,
 * keeping the session-runner dispatch loop clean.
 */

import { execSync } from "node:child_process";
import type { ApmWorkflowNode } from "../apm-types.js";
import type { PipelineLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HookContext {
  /** Workflow node config (may be undefined for unknown items). */
  node: ApmWorkflowNode | undefined;
  /** Pipeline item key. */
  itemKey: string;
  /** Feature slug (for template interpolation). */
  slug: string;
  /** App root directory (cwd for hooks). */
  appRoot: string;
  /** Repository root directory. */
  repoRoot: string;
  /** Target branch (e.g. "main"). */
  baseBranch: string;
  /** Pipeline event logger. */
  logger: PipelineLogger;
}

export interface HookResult {
  /** Whether the hook succeeded. */
  ok: boolean;
  /** Error message if the hook failed. */
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pre-hook timeout — should be fast (idempotent setup/validation). */
const PRE_HOOK_TIMEOUT_MS = 120_000; // 2 min
/** Post-hook timeout — may involve validation, cleanup. */
const POST_HOOK_TIMEOUT_MS = 120_000; // 2 min

// ---------------------------------------------------------------------------
// Hook execution
// ---------------------------------------------------------------------------

/**
 * Build the standard environment for lifecycle hooks.
 * Provides the same context variables as local-exec and the old inline post-hook.
 */
function buildHookEnv(ctx: HookContext): Record<string, string | undefined> {
  return {
    ...process.env,
    SLUG: ctx.slug,
    APP_ROOT: ctx.appRoot,
    REPO_ROOT: ctx.repoRoot,
    BASE_BRANCH: ctx.baseBranch,
  };
}

/**
 * Interpolate template variables in a hook command.
 * Currently supports: ${featureSlug}
 */
function interpolateCommand(command: string, slug: string): string {
  return command.replace(/\$\{featureSlug\}/g, slug);
}

/**
 * Execute the node's pre-hook shell command.
 * Returns ok=true if no pre-hook declared or if it succeeds.
 * Returns ok=false with errorMessage if the pre-hook fails.
 *
 * Pre-hooks run on every attempt (must be idempotent).
 * Use for: killing stale processes, environment health checks, SSR smoke tests.
 */
export function runPreHook(ctx: HookContext): HookResult {
  const preCommand = ctx.node?.pre;
  if (!preCommand) return { ok: true };

  const cmd = interpolateCommand(preCommand, ctx.slug);
  ctx.logger.event("hook.pre.start", ctx.itemKey, { command: cmd.slice(0, 200) });

  try {
    execSync(cmd, {
      cwd: ctx.appRoot,
      stdio: "pipe",
      timeout: PRE_HOOK_TIMEOUT_MS,
      env: buildHookEnv(ctx),
      maxBuffer: 10 * 1024 * 1024,
    });
    ctx.logger.event("hook.pre.end", ctx.itemKey, { outcome: "completed" });
    return { ok: true };
  } catch (err: unknown) {
    const execErr = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const output = [
      execErr.stdout?.toString() ?? "",
      execErr.stderr?.toString() ?? "",
    ].filter(Boolean).join("\n").trim() || execErr.message || "pre-hook failed";

    const errorMessage = `Pre-hook failed — aborting handler execution.\n`
      + `Pre command: ${cmd}\n`
      + `Output:\n${output.slice(-2048)}`;

    ctx.logger.event("hook.pre.end", ctx.itemKey, {
      outcome: "failed",
      error_preview: output.slice(0, 200),
    });

    return { ok: false, errorMessage };
  }
}

/**
 * Execute the node's post-hook shell command.
 * Only called after the handler succeeds (outcome === "completed").
 * Returns ok=true if no post-hook declared or if it succeeds.
 *
 * Post-hooks run for cleanup, validation, or sentinel writing.
 */
export function runPostHook(ctx: HookContext): HookResult {
  const postCommand = ctx.node?.post;
  if (!postCommand) return { ok: true };

  const cmd = interpolateCommand(postCommand, ctx.slug);
  ctx.logger.event("hook.post.start", ctx.itemKey, { command: cmd.slice(0, 200) });

  try {
    execSync(cmd, {
      cwd: ctx.appRoot,
      stdio: "pipe",
      timeout: POST_HOOK_TIMEOUT_MS,
      env: buildHookEnv(ctx),
      maxBuffer: 10 * 1024 * 1024,
    });
    ctx.logger.event("hook.post.end", ctx.itemKey, { outcome: "completed" });
    return { ok: true };
  } catch (err: unknown) {
    const execErr = err as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const output = [
      execErr.stdout?.toString() ?? "",
      execErr.stderr?.toString() ?? "",
    ].filter(Boolean).join("\n").trim() || execErr.message || "post-hook failed";

    ctx.logger.event("hook.post.end", ctx.itemKey, {
      outcome: "failed",
      error_preview: output.slice(0, 200),
    });

    return { ok: false, errorMessage: `post-hook: ${output}` };
  }
}

/**
 * Auto-capture git HEAD SHA for nodes that declare `captures_head_sha: true`.
 * Called after post-hook so that any commits from the post-hook (e.g. deploy
 * sentinels) are reflected in the captured SHA.
 *
 * Returns the SHA string or null if capture is not configured or fails.
 */
export function captureHeadSha(ctx: HookContext): string | null {
  const node = ctx.node;
  const shouldCapture = node?.captures_head_sha
    || (node?.category === "deploy" && node?.type === "script");
  if (!shouldCapture) return null;

  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: ctx.repoRoot,
      encoding: "utf-8",
      timeout: 5_000,
    }).trim();
    if (sha) {
      ctx.logger.event("handoff.emit", ctx.itemKey, {
        channel: "handler_data",
        keys: ["lastPushedSha"],
        auto_captured: true,
      });
    }
    return sha || null;
  } catch {
    return null;
  }
}
