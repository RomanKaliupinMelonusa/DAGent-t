/**
 * dispatch/item-dispatch.ts — Single-item dispatch pipeline.
 *
 * Executes the handler for a single DAG item through the node middleware
 * chain (koa-style onion) and returns kernel Commands. Middlewares may
 * short-circuit (e.g. auto-skip), enrich the context, transform the
 * result, or rescue errors — all without handlers knowing.
 */

import type { NodeHandler, NodeContext, NodeResult } from "../../handlers/types.js";
import type { NodeMiddleware } from "../../handlers/middleware.js";
import { composeMiddleware } from "../../handlers/middleware.js";
import { autoSkipMiddleware } from "../../handlers/middlewares/auto-skip.js";
import { lifecycleHooksMiddleware } from "../../handlers/middlewares/lifecycle-hooks.js";
import type { Command } from "../../kernel/commands.js";
import { translateResult } from "./result-translator.js";

/** Default middleware chain applied to every handler invocation when the
 *  caller does not supply one. Mirrors ENGINE_DEFAULT_MIDDLEWARE_NAMES in
 *  the registry — keep in sync. */
export const DEFAULT_NODE_MIDDLEWARES: ReadonlyArray<NodeMiddleware> = [
  autoSkipMiddleware,
  lifecycleHooksMiddleware,
];

export interface ItemDispatchResult {
  /** Commands to send to the kernel. */
  commands: Command[];
  /** The handler's raw signal (for loop-level handling). */
  signal?: NodeResult["signal"];
  /** The handler's signals bag. */
  signals?: NodeResult["signals"];
  /** The item summary from the result. */
  summary: NodeResult["summary"];
}

/**
 * Dispatch a single item through its middleware-wrapped handler and return
 * kernel commands. Middlewares run in onion order around `handler.execute`.
 *
 * This function does NOT call kernelComplete/kernelFail. It returns
 * Commands that the caller feeds to the kernel.
 */
export async function dispatchItem(
  handler: NodeHandler,
  ctx: NodeContext,
  middlewares: ReadonlyArray<NodeMiddleware> = DEFAULT_NODE_MIDDLEWARES,
): Promise<ItemDispatchResult> {
  const commands: Command[] = [];

  // `record-attempt` is emitted only when the handler actually executes —
  // middleware short-circuits (e.g. auto-skip) must not burn an attempt.
  const run = composeMiddleware(middlewares, (innerCtx) => {
    commands.push({ type: "record-attempt", itemKey: ctx.itemKey });
    return handler.execute(innerCtx);
  });

  let result: NodeResult;
  try {
    result = await run(ctx);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result = {
      outcome: "error",
      errorMessage: `Handler threw: ${message}`,
      summary: {},
    };
  }

  commands.push(...translateResult(ctx.itemKey, result));

  return {
    commands,
    signal: result.signal,
    signals: result.signals,
    summary: result.summary,
  };
}

