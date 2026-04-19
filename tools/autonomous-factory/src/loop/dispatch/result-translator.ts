/**
 * dispatch/result-translator.ts — Translates handler NodeResult into kernel Commands.
 *
 * Bridges the handler vocabulary (NodeResult + DagCommand[]) into the
 * kernel's Command union. This is the seam between handler plugins
 * (unchanged) and the new kernel architecture.
 */

import type { NodeResult, DagCommand } from "../../handlers/types.js";
import type { Command } from "../../kernel/commands.js";
import { wrapDagCommands } from "../../kernel/commands.js";

/** Fail-command policy resolved from the node's circuit_breaker config. */
export interface FailPolicy {
  readonly maxFailures?: number;
  readonly haltOnIdentical?: boolean;
}

/**
 * Translate a handler's NodeResult into an ordered list of kernel Commands.
 *
 * Order:
 * 1. State transition (complete-item or fail-item)
 * 2. Handler DagCommand[] (reset-nodes, salvage-draft, etc.)
 * 3. Handler output recording
 *
 * The signal field is NOT translated here — it's handled by the loop layer
 * (create-pr, halt, salvage-draft, approval-pending are loop-level concerns).
 */
export function translateResult(
  itemKey: string,
  result: NodeResult,
  failPolicy?: FailPolicy,
): Command[] {
  const commands: Command[] = [];

  // 1. State transition
  if (result.outcome === "completed") {
    commands.push({ type: "complete-item", itemKey });
  } else {
    commands.push({
      type: "fail-item",
      itemKey,
      message: result.errorMessage ?? "Unknown failure",
      ...(failPolicy?.maxFailures !== undefined ? { maxFailures: failPolicy.maxFailures } : {}),
      ...(failPolicy?.haltOnIdentical ? { haltOnIdentical: true } : {}),
    });
  }

  // 2. DagCommand[] from handler
  if (result.commands && result.commands.length > 0) {
    commands.push(...wrapDagCommands(result.commands));
  }

  // 3. Handler output
  if (result.handlerOutput && Object.keys(result.handlerOutput).length > 0) {
    commands.push({
      type: "record-handler-output",
      itemKey,
      output: result.handlerOutput,
    });
  }

  return commands;
}
