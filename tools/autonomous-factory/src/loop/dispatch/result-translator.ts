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
import { computeStructuredSignature } from "../../triage/playwright-report.js";

/** Fail-command policy resolved from the node's circuit_breaker config. */
export interface FailPolicy {
  readonly maxFailures?: number;
  readonly haltOnIdentical?: boolean;
  /** Workflow-level halt threshold. See `ApmWorkflow.halt_on_identical.threshold`. */
  readonly haltOnIdenticalThreshold?: number;
  /** Workflow-level exclusions. */
  readonly haltOnIdenticalExcludedKeys?: readonly string[];
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
    // Round-2 R3 (replacement): when the handler emitted a parsed
    // `StructuredFailure`, derive a signature from its stable fields
    // (testid locators, error class, test titles) rather than hashing the
    // raw stdout. Raw stdout is dominated by React-warning console dumps
    // whose component-stack line:col rotates between builds, which was
    // defeating `halt_on_identical` even for identical failures.
    const structuredFailure = result.handlerOutput?.structuredFailure;
    const structuredSig = structuredFailure ? computeStructuredSignature(structuredFailure) : null;
    commands.push({
      type: "fail-item",
      itemKey,
      message: result.errorMessage ?? "Unknown failure",
      ...(failPolicy?.maxFailures !== undefined ? { maxFailures: failPolicy.maxFailures } : {}),
      ...(failPolicy?.haltOnIdentical ? { haltOnIdentical: true } : {}),
      ...(failPolicy?.haltOnIdenticalThreshold !== undefined
        ? { haltOnIdenticalThreshold: failPolicy.haltOnIdenticalThreshold }
        : {}),
      ...(failPolicy?.haltOnIdenticalExcludedKeys && failPolicy.haltOnIdenticalExcludedKeys.length > 0
        ? { haltOnIdenticalExcludedKeys: failPolicy.haltOnIdenticalExcludedKeys }
        : {}),
      ...(structuredSig ? { errorSignature: structuredSig } : {}),
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
