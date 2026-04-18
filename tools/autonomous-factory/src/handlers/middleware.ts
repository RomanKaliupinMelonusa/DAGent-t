/**
 * handlers/middleware.ts — NodeMiddleware interface + composer.
 *
 * Phase 2 foundation: a Koa-style onion wrapper around `handler.execute()`.
 * Middlewares can short-circuit, enrich the context passed downstream,
 * transform the result, and rescue errors — all without touching the
 * dispatcher or individual handlers.
 *
 * Usage:
 *   const run = composeMiddleware([mwA, mwB], (ctx) => handler.execute(ctx));
 *   const result = await run(ctx);
 *
 * `next()` may be called with an optional enriched `NodeContext`; downstream
 * middlewares and the final handler see the enriched ctx.
 */

import type { NodeContext, NodeResult } from "./types.js";

/**
 * Invoke the next link in the middleware chain. Pass an optional `ctx`
 * to enrich the context handed to downstream middlewares and the handler.
 * Must be called at most once per middleware invocation.
 */
export type MiddlewareNext = (ctx?: NodeContext) => Promise<NodeResult>;

export interface NodeMiddleware {
  /** Diagnostic name — surfaced in logs + error messages. */
  readonly name: string;
  /**
   * Middleware body. Either:
   *   - short-circuit by returning a `NodeResult` without calling `next()`, or
   *   - call `await next()` to continue (optionally with an enriched ctx),
   *     then inspect / transform the returned result.
   */
  run(ctx: NodeContext, next: MiddlewareNext): Promise<NodeResult>;
}

/**
 * Fold `middlewares` around `final` in onion order: first middleware is the
 * outermost wrapper, last is closest to `final`. Returns a function that
 * executes the composed chain.
 */
export function composeMiddleware(
  middlewares: ReadonlyArray<NodeMiddleware>,
  final: (ctx: NodeContext) => Promise<NodeResult>,
): (ctx: NodeContext) => Promise<NodeResult> {
  return async (rootCtx) => {
    let lastCalledIndex = -1;

    const dispatch = async (index: number, ctx: NodeContext): Promise<NodeResult> => {
      if (index <= lastCalledIndex) {
        throw new Error(
          `composeMiddleware: next() called multiple times (middleware="${middlewares[lastCalledIndex]?.name}")`,
        );
      }
      lastCalledIndex = index;

      if (index === middlewares.length) return final(ctx);

      const mw = middlewares[index];
      return mw.run(ctx, (enrichedCtx) => dispatch(index + 1, enrichedCtx ?? ctx));
    };

    return dispatch(0, rootCtx);
  };
}
