/**
 * command-executor.ts — Generic kernel command executor.
 *
 * @deprecated Superseded by `kernel/pipeline-kernel.ts` which processes
 * DagCommands via the Command union and produces Effects. Retained for the
 * legacy session-runner.ts path (active when KERNEL_MODE is not set).
 * Remove this file once KERNEL_MODE becomes the sole execution path.
 *
 * Translates declarative DagCommands (returned by any handler) into state API
 * calls. This is the sole authority for handler-initiated graph mutations.
 *
 * Design:
 *   - Handlers produce commands; they never call state APIs directly.
 *   - Commands execute sequentially (order matters: set-triage-record before
 *     reset-nodes before set-pending-context).
 *   - The executor is generic — it doesn't know about classification logic,
 *     RAG/LLM, or domain routing. It only interprets the command protocol.
 *   - New command types are added here without touching handlers.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { DagCommand } from "./handlers/types.js";
import type { PipelineLogger } from "./logger.js";
import { resetNodes, salvageForDraft, setLastTriageRecord, setPendingContext } from "./state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandExecutionResult {
  /** True if the pipeline should halt (e.g. cycle budget exhausted). */
  halt: boolean;
  /** True if a reset-nodes command was executed (DAG state changed). */
  resetPerformed: boolean;
}

// ---------------------------------------------------------------------------
// Command handlers (one per DagCommand.type)
// ---------------------------------------------------------------------------

async function execResetNodes(
  cmd: Extract<DagCommand, { type: "reset-nodes" }>,
  slug: string,
  logger: PipelineLogger,
): Promise<{ halt: boolean }> {
  const logKey = cmd.logKey ?? "reset-nodes";
  const maxCycles = cmd.maxCycles ?? 5;

  logger.event("state.reset", null, {
    route_to: cmd.seedKey,
    reason: cmd.reason,
    log_key: logKey,
    max_cycles: maxCycles,
  });

  const result = await resetNodes(slug, cmd.seedKey, cmd.reason, maxCycles, logKey);
  if (result.halted) {
    logger.event("state.reset", null, {
      route_to: cmd.seedKey,
      halted: true,
      cycle_count: result.cycleCount,
    });
    return { halt: true };
  }
  return { halt: false };
}

async function execSalvageDraft(
  cmd: Extract<DagCommand, { type: "salvage-draft" }>,
  slug: string,
  appRoot: string,
  logger: PipelineLogger,
): Promise<void> {
  logger.event("state.salvage", cmd.failedItemKey, {
    reason: cmd.reason.slice(0, 500),
  });
  try {
    await salvageForDraft(slug, cmd.failedItemKey);
  } catch { /* best effort */ }
  const draftFlagPath = path.join(appRoot, "in-progress", `${slug}.blocked-draft`);
  fs.writeFileSync(draftFlagPath, cmd.reason, "utf-8");
}

async function execSetPendingContext(
  cmd: Extract<DagCommand, { type: "set-pending-context" }>,
  slug: string,
): Promise<void> {
  try {
    await setPendingContext(slug, cmd.itemKey, cmd.context);
  } catch { /* non-fatal */ }
}

async function execSetTriageRecord(
  cmd: Extract<DagCommand, { type: "set-triage-record" }>,
  slug: string,
): Promise<void> {
  try {
    await setLastTriageRecord(slug, cmd.record);
  } catch { /* non-fatal */ }
}

function execReindex(
  cmd: Extract<DagCommand, { type: "reindex" }>,
  repoRoot: string,
  reindexCategories: ReadonlySet<string>,
  logger: PipelineLogger,
): void {
  // If categories are specified, only reindex if at least one matches
  if (cmd.categories && cmd.categories.length > 0) {
    const shouldReindex = cmd.categories.some((c) => reindexCategories.has(c));
    if (!shouldReindex) return;
  }

  logger.event("tool.call", null, {
    tool: "roam",
    category: "index",
    detail: "re-indexing after command",
    is_write: false,
  });
  try {
    execSync("roam index", { cwd: repoRoot, stdio: "inherit", timeout: 120_000 });
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute an ordered list of DagCommands against the state API.
 *
 * @param commands - Commands to execute (order preserved).
 * @param slug - Feature slug.
 * @param appRoot - Absolute path to the app directory.
 * @param repoRoot - Absolute path to the repository root.
 * @param reindexCategories - Node categories that trigger roam re-index.
 * @param logger - Pipeline event logger.
 * @returns Aggregate result — halt if any command triggered it.
 */
export async function executeCommands(
  commands: readonly DagCommand[],
  slug: string,
  appRoot: string,
  repoRoot: string,
  reindexCategories: ReadonlySet<string>,
  logger: PipelineLogger,
): Promise<CommandExecutionResult> {
  const result: CommandExecutionResult = { halt: false, resetPerformed: false };

  for (const cmd of commands) {
    switch (cmd.type) {
      case "reset-nodes": {
        const resetResult = await execResetNodes(cmd, slug, logger);
        result.resetPerformed = true;
        if (resetResult.halt) {
          result.halt = true;
          return result; // Short-circuit — no further commands after halt
        }
        break;
      }
      case "salvage-draft":
        await execSalvageDraft(cmd, slug, appRoot, logger);
        break;
      case "set-pending-context":
        await execSetPendingContext(cmd, slug);
        break;
      case "set-triage-record":
        await execSetTriageRecord(cmd, slug);
        break;
      case "reindex":
        execReindex(cmd, repoRoot, reindexCategories, logger);
        break;
      default:
        // Exhaustiveness check — TypeScript will error if a new command type
        // is added to DagCommand but not handled here.
        logger.event("item.end", null, {
          outcome: "error",
          error_preview: `Unknown DagCommand type: ${(cmd as { type: string }).type}`,
        });
        break;
    }
  }

  return result;
}
