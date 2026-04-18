/**
 * handlers/middlewares/lifecycle-hooks.ts — pre/post shell hook middleware.
 *
 * Honours `node.pre` and `node.post` fields declared in workflow manifests:
 *   - `pre`  runs BEFORE `handler.execute()`. Non-zero exit fails the node
 *            immediately without burning a handler attempt.
 *   - `post` runs AFTER a successful handler result. Non-zero exit downgrades
 *            the node to `failed`. Skipped when the handler already failed.
 *
 * The schema claims these hooks run "for ALL handler types" but until Phase 2
 * Part B no code actually executed them. This middleware finally wires them
 * end-to-end, matching the contract documented in `apm/types.ts`.
 *
 * Implementation: the synchronous `executeHook` from `lifecycle/hooks.ts` is
 * reused so behaviour matches every other hook invocation site in the engine.
 */

import type { NodeMiddleware, MiddlewareNext } from "../middleware.js";
import type { NodeContext, NodeResult } from "../types.js";
import { executeHook } from "../../lifecycle/hooks.js";

/** Resolve the workflow node definition for the current item, if any. */
function getNode(ctx: NodeContext) {
  return ctx.apmContext.workflows?.[ctx.pipelineState.workflowName]?.nodes?.[ctx.itemKey];
}

/** Env passed to every pre/post hook — merges apm config env + pipeline context. */
function buildHookEnv(ctx: NodeContext): Record<string, string> {
  return {
    ...ctx.environment,
    SLUG: ctx.slug,
    APP_ROOT: ctx.appRoot,
    REPO_ROOT: ctx.repoRoot,
    BASE_BRANCH: ctx.baseBranch,
    ITEM_KEY: ctx.itemKey,
  };
}

export const lifecycleHooksMiddleware: NodeMiddleware = {
  name: "lifecycle-hooks",

  async run(ctx: NodeContext, next: MiddlewareNext): Promise<NodeResult> {
    const node = getNode(ctx);
    const preCmd = node?.pre;
    const postCmd = node?.post;
    if (!preCmd && !postCmd) return next();

    const env = buildHookEnv(ctx);

    // ── Pre-hook ──────────────────────────────────────────────────────────
    if (preCmd) {
      ctx.logger.event("hook.pre.start", ctx.itemKey, { command: preCmd });
      const pre = executeHook(preCmd, env, ctx.appRoot);
      if (pre && pre.exitCode !== 0) {
        const message = `Pre-hook failed (exit ${pre.exitCode}): ${preCmd}\n${pre.stdout.slice(-2048)}`;
        ctx.logger.event("hook.pre.end", ctx.itemKey, { exit_code: pre.exitCode, failed: true });
        return {
          outcome: "failed",
          errorMessage: message,
          summary: { intents: [`Pre-hook failed for ${ctx.itemKey}`] },
        };
      }
      ctx.logger.event("hook.pre.end", ctx.itemKey, { exit_code: 0 });
    }

    // ── Handler body ──────────────────────────────────────────────────────
    const result = await next();

    // ── Post-hook ─────────────────────────────────────────────────────────
    // Only run post on success — matching convention that post is cleanup/validation
    // for a healthy run. A failing handler already tells triage what to do.
    if (postCmd && result.outcome === "completed") {
      ctx.logger.event("hook.post.start", ctx.itemKey, { command: postCmd });
      const post = executeHook(postCmd, env, ctx.appRoot);
      if (post && post.exitCode !== 0) {
        const message = `Post-hook failed (exit ${post.exitCode}): ${postCmd}\n${post.stdout.slice(-2048)}`;
        ctx.logger.event("hook.post.end", ctx.itemKey, { exit_code: post.exitCode, failed: true });
        return {
          ...result,
          outcome: "failed",
          errorMessage: message,
        };
      }
      ctx.logger.event("hook.post.end", ctx.itemKey, { exit_code: 0 });
    }

    return result;
  },
};
