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
import { translateResult, type FailPolicy } from "./result-translator.js";
import { resolveNodeBudgetPolicy, getWorkflowNode } from "../../session/dag-utils.js";

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

  // `record-attempt` is an invariant of every dispatch: emitting it here
  // (before the middleware chain runs) ensures attempt counts advance even
  // when a middleware short-circuits with `failed` (e.g. pre-hook failure).
  // Short-circuits that produce `completed` (e.g. auto-skip) still count
  // as an attempt but have no retry consequence — the item just finishes.
  commands.push({ type: "record-attempt", itemKey: ctx.itemKey });

  const run = composeMiddleware(middlewares, (innerCtx) => handler.execute(innerCtx));

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

  commands.push(...translateResult(ctx.itemKey, result, resolveFailPolicy(ctx)));

  return {
    commands,
    signal: result.signal,
    signals: result.signals,
    summary: result.summary,
  };
}

/**
 * Resolve the per-node fail-command policy from the compiled APM context.
 * Threads `circuit_breaker.max_item_failures` and `halt_on_identical` into
 * the kernel's fail-item command so pipeline halting honours workflow config
 * instead of the hardcoded `maxFailures=10` in `domain/transitions.ts`.
 */
function resolveFailPolicy(ctx: NodeContext): FailPolicy | undefined {
  const workflowName = ctx.pipelineState.workflowName;
  if (!workflowName) return undefined;
  const node = getWorkflowNode(ctx.apmContext, workflowName, ctx.itemKey);
  if (!node) return undefined;
  const policy = resolveNodeBudgetPolicy(node, ctx.apmContext);
  return {
    maxFailures: policy.maxItemFailures,
    haltOnIdentical: policy.haltOnIdentical,
  };
}
