/**
 * dispatch/item-dispatch.ts — Single-item dispatch pipeline.
 *
 * Executes the handler for a single DAG item and returns kernel Commands.
 * Replaces the mutable stepInit→stepExecute pipeline from session-runner.ts
 * with a pure function that returns Commands instead of mutating state.
 */

import type { NodeHandler, NodeContext, NodeResult } from "../handlers/types.js";
import type { Command } from "../kernel/commands.js";
import { translateResult } from "./result-translator.js";

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
 * Dispatch a single item through its handler and return commands.
 *
 * Steps:
 * 1. Check handler.shouldSkip() — if skipped, return complete-item command
 * 2. Execute handler.execute() — translate result into commands
 * 3. Return commands + signals for loop-level handling
 *
 * This function does NOT call kernelComplete/kernelFail. It returns
 * Commands that the caller feeds to the kernel.
 */
export async function dispatchItem(
  handler: NodeHandler,
  ctx: NodeContext,
): Promise<ItemDispatchResult> {
  // Step 1: Auto-skip check
  if (handler.shouldSkip) {
    const skipResult = await handler.shouldSkip(ctx);
    if (skipResult) {
      return {
        commands: [{ type: "complete-item", itemKey: ctx.itemKey }],
        summary: {
          outcome: "completed",
          errorMessage: `Skipped: ${skipResult.reason}`,
          filesChanged: skipResult.filesChanged,
        },
      };
    }
  }

  // Step 2: Record attempt + execute
  const commands: Command[] = [
    { type: "record-attempt", itemKey: ctx.itemKey },
  ];

  let result: NodeResult;
  try {
    result = await handler.execute(ctx);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    result = {
      outcome: "error",
      errorMessage: `Handler threw: ${message}`,
      summary: {},
    };
  }

  // Step 3: Translate result into commands
  commands.push(...translateResult(ctx.itemKey, result));

  return {
    commands,
    signal: result.signal,
    signals: result.signals,
    summary: result.summary,
  };
}
