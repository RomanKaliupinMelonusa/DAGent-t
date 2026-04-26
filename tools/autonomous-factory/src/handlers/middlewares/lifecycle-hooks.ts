/**
 * handlers/middlewares/lifecycle-hooks.ts — pre/post shell hook middleware.
 *
 * Honours `node.pre` and `node.post` fields declared in workflow manifests:
 *   - `pre`  runs BEFORE `handler.execute()`. Non-zero exit fails the node
 *            immediately without burning a handler attempt.
 *   - `post` runs AFTER the handler body on BOTH outcomes (success OR
 *            failure) so cleanup always happens. A non-zero post exit
 *            downgrades a successful handler to `failed`; if the handler
 *            already failed, post-hook errors are logged but the original
 *            handler failure is preserved as the authoritative error.
 *            Post-hook scripts MUST be idempotent.
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
import type { ApmConfig } from "../../apm/types.js";
import { executeHook } from "../../lifecycle/hooks.js";
import { featurePath } from "../../paths/feature-paths.js";

/**
 * Node keys that share `apps/<app>/.apm/hooks/e2e-runner-{pre,post}.sh` and
 * therefore receive the declarative `apm.e2e.readiness.*` env injection.
 *
 * The brief named `e2e-runner` exclusively, but in commerce-storefront the
 * same hook is also reused by `qa-adversary` and `storefront-debug`. Once
 * the bash-side fallback is dropped (Session B step 5), those callers must
 * also receive the env vars or their pre-hook fails loudly. Adding more
 * keys here is the supported way to opt nodes in.
 */
const E2E_READINESS_NODE_KEYS = new Set<string>([
  "e2e-runner",
  "qa-adversary",
  "storefront-debug",
]);

/**
 * Compute the `apm.e2e.readiness.*` env-var injection for a given node.
 *
 * Returns an empty object when:
 *   - the node key is not in {@link E2E_READINESS_NODE_KEYS}, or
 *   - `apm.e2e.readiness` is undefined.
 *
 * Each declared field maps to one env var; absent fields are left unset so
 * the bash defaults in `wait-for-app-ready.sh` remain authoritative.
 *
 * Exported for unit testing — see
 * `lifecycle/__tests__/hooks-readiness-env.test.ts`.
 */
export function buildE2eReadinessEnv(
  itemKey: string,
  config: ApmConfig | undefined,
): Record<string, string> {
  if (!E2E_READINESS_NODE_KEYS.has(itemKey)) return {};
  const readiness = config?.e2e?.readiness;
  if (!readiness) return {};

  const env: Record<string, string> = {};
  if (readiness.url !== undefined) env.E2E_READINESS_URL = readiness.url;
  if (readiness.timeout_s !== undefined) env.READY_TIMEOUT_S = String(readiness.timeout_s);
  if (readiness.min_bytes !== undefined) env.READY_MIN_BYTES = String(readiness.min_bytes);
  if (readiness.deny_re !== undefined) env.READY_DENY_RE = readiness.deny_re;
  return env;
}

/** Resolve the workflow node definition for the current item, if any. */
function getNode(ctx: NodeContext) {
  return ctx.apmContext.workflows?.[ctx.pipelineState.workflowName]?.nodes?.[ctx.itemKey];
}

/** Read the baseline validation map from _FLIGHT_DATA.json (A2).
 *  Hooks consume it via the `BASELINE_VALIDATION` env var to skip routes
 *  that were already failing on the BASE branch. Returns a JSON string
 *  or empty string when no baseline was captured. */
function readBaselineValidation(ctx: NodeContext): string {
  const flightPath = featurePath(ctx.appRoot, ctx.slug, "flight-data");
  if (!ctx.filesystem.existsSync(flightPath)) return "";
  try {
    const parsed = JSON.parse(ctx.filesystem.readFileSync(flightPath)) as Record<string, unknown>;
    const baseline = parsed["baselineValidation"];
    if (!baseline || typeof baseline !== "object") return "";
    return JSON.stringify(baseline);
  } catch {
    return "";
  }
}

/** Env passed to every pre/post hook — merges apm config env + pipeline context. */
function buildHookEnv(ctx: NodeContext): Record<string, string> {
  // Invocation-scoped env vars expose the canonical per-invocation directory
  // layout owned by the Artifact Bus. Hook scripts consume them to read
  // declared inputs / write declared outputs / append logs without
  // reconstructing paths from slug + node key + invocation id.
  const invocationDir = ctx.filesystem.joinPath(ctx.appRoot, ".dagent", ctx.slug, ctx.itemKey, ctx.executionId);
  const env: Record<string, string> = {
    ...ctx.environment,
    SLUG: ctx.slug,
    APP_ROOT: ctx.appRoot,
    REPO_ROOT: ctx.repoRoot,
    BASE_BRANCH: ctx.baseBranch,
    ITEM_KEY: ctx.itemKey,
    NODE_KEY: ctx.itemKey,
    INVOCATION_ID: ctx.executionId,
    INVOCATION_DIR: invocationDir,
    INPUTS_DIR: ctx.filesystem.joinPath(invocationDir, "inputs"),
    OUTPUTS_DIR: ctx.filesystem.joinPath(invocationDir, "outputs"),
    LOGS_DIR: ctx.filesystem.joinPath(invocationDir, "logs"),
  };
  const baseline = readBaselineValidation(ctx);
  if (baseline) env.BASELINE_VALIDATION = baseline;

  // Declarative E2E readiness knobs — gated on node key so non-e2e nodes
  // never see these vars. See `buildE2eReadinessEnv` for the full rule.
  Object.assign(env, buildE2eReadinessEnv(ctx.itemKey, ctx.apmContext.config));

  return env;
}

/** Default hook timeout when the node does not declare `timeout_minutes`. */
const DEFAULT_HOOK_TIMEOUT_MS = 30_000;

/** Resolve the hook timeout: honour `node.timeout_minutes` when set so
 *  long-running lifecycle hooks (e.g. dev-server boot with 120 s polling)
 *  do not get killed by the 30 s default of `executeHook`. */
function getHookTimeoutMs(node: { timeout_minutes?: number } | undefined): number {
  const mins = node?.timeout_minutes;
  if (typeof mins === "number" && mins > 0) return mins * 60_000;
  return DEFAULT_HOOK_TIMEOUT_MS;
}

export const lifecycleHooksMiddleware: NodeMiddleware = {
  name: "lifecycle-hooks",

  async run(ctx: NodeContext, next: MiddlewareNext): Promise<NodeResult> {
    const node = getNode(ctx);
    const preCmd = node?.pre;
    const postCmd = node?.post;
    if (!preCmd && !postCmd) return next();

    const env = buildHookEnv(ctx);
    const hookTimeoutMs = getHookTimeoutMs(node);

    // ── Pre-hook ──────────────────────────────────────────────────────────
    if (preCmd) {
      ctx.logger.event("hook.pre.start", ctx.itemKey, { command: preCmd });
      const pre = executeHook(preCmd, env, ctx.appRoot, hookTimeoutMs);
      if (pre && pre.exitCode !== 0) {
        const message = `Pre-hook failed (exit ${pre.exitCode}): ${preCmd}\n${pre.stdout.slice(-2048)}`;
        ctx.logger.event("hook.pre.end", ctx.itemKey, { exit_code: pre.exitCode, failed: true });
        return {
          outcome: "failed",
          errorMessage: message,
          summary: { intents: [`Pre-hook failed for ${ctx.itemKey}`] },
          // Tag the failure source so the loop/triage path can route
          // lifecycle-hook failures separately from handler-body failures.
          signals: { preHookFailure: true },
        };
      }
      ctx.logger.event("hook.pre.end", ctx.itemKey, { exit_code: 0 });
    }

    // ── Handler body ──────────────────────────────────────────────────────
    const result = await next();

    // ── Post-hook ─────────────────────────────────────────────────────────
    // Post runs on BOTH outcomes so cleanup always happens (e.g. tearing
    // down a dev server started by the pre-hook). Post-hook authors MUST
    // make scripts idempotent and tolerant of partial pre-hook state.
    // When the handler already failed, a non-zero post exit is logged but
    // the original failure is preserved as the outcome.
    if (postCmd) {
      ctx.logger.event("hook.post.start", ctx.itemKey, { command: postCmd });
      const post = executeHook(postCmd, env, ctx.appRoot, hookTimeoutMs);
      if (post && post.exitCode !== 0) {
        const message = `Post-hook failed (exit ${post.exitCode}): ${postCmd}\n${post.stdout.slice(-2048)}`;
        ctx.logger.event("hook.post.end", ctx.itemKey, { exit_code: post.exitCode, failed: true });
        if (result.outcome === "completed") {
          return {
            ...result,
            outcome: "failed",
            errorMessage: message,
            signals: { ...(result.signals ?? {}), postHookFailure: true },
          };
        }
        // Handler already failed — keep the original failure as the
        // authoritative error; post-hook failure is only logged.
      } else {
        ctx.logger.event("hook.post.end", ctx.itemKey, { exit_code: 0 });
      }
    }

    return result;
  },
};
