/**
 * dispatch/batch-dispatcher.ts — Parallel batch dispatch.
 *
 * Dispatches multiple ready items via Promise.allSettled, collects
 * commands from each, and returns the aggregated command list.
 */

import type { NodeHandler, NodeContext } from "../handlers/types.js";
import type { Command } from "../kernel/commands.js";
import { dispatchItem, type ItemDispatchResult } from "./item-dispatch.js";

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
 * @param items - Array of [handler, context] pairs to dispatch
 * @returns Aggregated commands and per-item results
 */
export async function dispatchBatch(
  items: ReadonlyArray<readonly [NodeHandler, NodeContext]>,
): Promise<BatchDispatchResult> {
  const settled = await Promise.allSettled(
    items.map(([handler, ctx]) => dispatchItem(handler, ctx)),
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
