/**
 * handlers/middlewares/registry.ts — Built-in middleware registry + resolver.
 *
 * Maps string names (as used in apm.yml `config.node_middleware`) to
 * middleware implementations. Apps can override the default chain or add
 * per-handler middlewares through config without touching engine code.
 *
 * Custom middlewares (declared in apps/*.apm/middlewares/) can be
 * registered via `registerMiddleware` before pipeline bootstrap. Not yet
 * wired into the APM compiler — follow-up work in Phase 2 Part C.
 */

import type { NodeMiddleware } from "../middleware.js";
import { autoSkipMiddleware } from "./auto-skip.js";
import { lifecycleHooksMiddleware } from "./lifecycle-hooks.js";
import { resultProcessorMiddleware } from "./result-processor.js";
import { metricsMiddleware } from "./metrics.js";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const BUILT_IN_MIDDLEWARES: Record<string, NodeMiddleware> = {
  [autoSkipMiddleware.name]: autoSkipMiddleware,
  [lifecycleHooksMiddleware.name]: lifecycleHooksMiddleware,
  [resultProcessorMiddleware.name]: resultProcessorMiddleware,
  [metricsMiddleware.name]: metricsMiddleware,
};

const USER_MIDDLEWARES: Record<string, NodeMiddleware> = {};

/** Register a custom middleware. Throws if the name collides with a built-in. */
export function registerMiddleware(mw: NodeMiddleware): void {
  if (BUILT_IN_MIDDLEWARES[mw.name]) {
    throw new Error(`Middleware name "${mw.name}" collides with a built-in middleware.`);
  }
  USER_MIDDLEWARES[mw.name] = mw;
}

/**
 * Batch-register custom middlewares. Preferred entry point for plugin auto-discovery
 * (see `apm/plugin-loader.ts`) — replaces repeated imperative `registerMiddleware`
 * calls with a single declarative sink. Throws on name collisions with built-ins
 * OR with any previously-registered custom middleware in the same batch.
 */
export function registerMiddlewares(middlewares: Iterable<NodeMiddleware>): void {
  const seen = new Set<string>();
  for (const mw of middlewares) {
    if (seen.has(mw.name)) {
      throw new Error(`Middleware name "${mw.name}" appears multiple times in the registration batch.`);
    }
    seen.add(mw.name);
    registerMiddleware(mw);
  }
}

function getMiddleware(name: string): NodeMiddleware {
  const mw = BUILT_IN_MIDDLEWARES[name] ?? USER_MIDDLEWARES[name];
  if (!mw) {
    throw new Error(
      `Unknown middleware "${name}". Built-ins: ${Object.keys(BUILT_IN_MIDDLEWARES).join(", ")}. ` +
      `Register custom middlewares via registerMiddleware() before pipeline start.`,
    );
  }
  return mw;
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

/** The engine's fallback chain when apm.yml does not set `config.node_middleware.default`. */
export const ENGINE_DEFAULT_MIDDLEWARE_NAMES: ReadonlyArray<string> = [
  "auto-skip",
  "lifecycle-hooks",
  "result-processor",
];

export interface MiddlewareConfig {
  /** Middlewares applied to every handler. Overrides engine defaults when set. */
  readonly default?: ReadonlyArray<string>;
  /** Per-handler additions, appended after default (innermost layer). */
  readonly by_handler?: Readonly<Record<string, ReadonlyArray<string>>>;
}

/** Per-node override declared in workflows.yml. See ApmWorkflowNode schema. */
export interface NodeMiddlewareOverride {
  readonly mode: "append" | "replace";
  readonly names: ReadonlyArray<string>;
}

/**
 * Resolve the ordered middleware chain for a given handler name.
 *
 * Order: `config.default` (outer) → `config.by_handler[handlerName]` →
 * `nodeOverride.names` (when mode="append", appended innermost; when
 * mode="replace", the config chain is discarded and only names apply).
 *
 * When `config.default` is omitted, ENGINE_DEFAULT_MIDDLEWARE_NAMES applies.
 */
export function resolveMiddlewareChain(
  handlerName: string,
  config: MiddlewareConfig | undefined,
  nodeOverride?: NodeMiddlewareOverride,
): ReadonlyArray<NodeMiddleware> {
  if (nodeOverride?.mode === "replace") {
    return nodeOverride.names.map(getMiddleware);
  }
  const baseNames = config?.default ?? ENGINE_DEFAULT_MIDDLEWARE_NAMES;
  const handlerExtras = config?.by_handler?.[handlerName] ?? [];
  const nodeExtras = nodeOverride?.names ?? [];
  return [...baseNames, ...handlerExtras, ...nodeExtras].map(getMiddleware);
}
