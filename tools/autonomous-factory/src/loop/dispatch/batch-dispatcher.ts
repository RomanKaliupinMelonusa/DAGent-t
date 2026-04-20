/**
 * dispatch/batch-dispatcher.ts — Parallel batch dispatch.
 *
 * Dispatches multiple ready items via Promise.allSettled, collects
 * commands from each, and returns the aggregated command list.
 */

import type { NodeHandler, NodeContext } from "../../handlers/types.js";
import type { NodeMiddleware } from "../../handlers/middleware.js";
import type { Command } from "../../kernel/commands.js";
import { dispatchItem, type ItemDispatchResult } from "./item-dispatch.js";

/** A single-item dispatch tuple. The optional 3rd slot overrides the default middleware chain. */
export type DispatchPair =
  | readonly [NodeHandler, NodeContext]
  | readonly [NodeHandler, NodeContext, ReadonlyArray<NodeMiddleware>];

export interface BatchDispatchResult {
  /** Aggregated commands from all items in the batch. */
  commands: Command[];
  /** Per-item results for signal handling. */
  itemResults: Array<{
    itemKey: string;
    result: ItemDispatchResult;
  }>;
  /** Errors from rejected promises (handler crashes). */
  errors: Error[];
}

/**
 * Dispatch a batch of items in parallel.
 *
 * @param items - Array of [handler, context, middlewares?] tuples to dispatch
 * @returns Aggregated commands and per-item results
 */
export async function dispatchBatch(
  items: ReadonlyArray<DispatchPair>,
): Promise<BatchDispatchResult> {
  const settled = await Promise.allSettled(
    items.map((pair) => {
      const handler = pair[0];
      const ctx = pair[1];
      const middlewares = (pair as ReadonlyArray<unknown>)[2] as ReadonlyArray<NodeMiddleware> | undefined;
      return dispatchItem(handler, ctx, middlewares);
    }),
  );

  const commands: Command[] = [];
  const itemResults: BatchDispatchResult["itemResults"] = [];
  const errors: Error[] = [];

  for (let i = 0; i < settled.length; i++) {
    const settlement = settled[i];
    const [, ctx] = items[i];

    if (settlement.status === "rejected") {
      const err = settlement.reason instanceof Error
        ? settlement.reason
        : new Error(String(settlement.reason));
      errors.push(err);
      // Fail the item on crash
      commands.push({
        type: "fail-item",
        itemKey: ctx.itemKey,
        message: `Dispatch crash: ${err.message}`,
      });
      // Mirror the `record-summary` emission from `dispatchItem` so the
      // crash path also populates `runState.pipelineSummaries`. Without
      // this, a handler-level crash would leave no record for downstream
      // triage context and reports.
      const nowIso = new Date().toISOString();
      commands.push({
        type: "record-summary",
        summary: {
          key: ctx.itemKey,
          label: ctx.itemKey,
          agent: ctx.itemKey,
          attempt: ctx.attempt,
          startedAt: nowIso,
          finishedAt: nowIso,
          durationMs: 0,
          outcome: "error",
          errorMessage: `Dispatch crash: ${err.message}`,
          intents: [],
          messages: [],
          filesRead: [],
          filesChanged: [],
          shellCommands: [],
          toolCounts: {},
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      });
    } else {
      commands.push(...settlement.value.commands);
      itemResults.push({
        itemKey: ctx.itemKey,
        result: settlement.value,
      });
    }
  }

  return { commands, itemResults, errors };
}
