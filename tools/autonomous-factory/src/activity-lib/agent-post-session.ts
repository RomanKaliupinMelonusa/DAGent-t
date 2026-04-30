/**
 * handlers/support/agent-post-session.ts — Post-session telemetry enrichment.
 *
 * Records HEAD SHA, fills in filesChanged via git-diff fallback, and
 * computes budget utilization. All git I/O goes through the VersionControl
 * port on NodeContext — no direct child_process usage.
 */

import path from "node:path";
import type { NodeContext } from "./types.js";
import type { ItemSummary } from "../types.js";
import { getAgentDirectoryPrefixes } from "../session/dag-utils.js";

function getWorkflowNode(ctx: NodeContext) {
  return ctx.apmContext.workflows?.[ctx.pipelineState.workflowName]?.nodes?.[ctx.itemKey];
}

export interface PostSessionInput {
  telemetry: ItemSummary;
  toolLimitsHard: number;
  runtimeTokenBudget: number | undefined;
}

/**
 * Enrich the telemetry in place:
 *  - Record current HEAD SHA via ctx.vcs
 *  - If filesChanged is empty and a preStepRef is available, fall back to
 *    `git diff --name-only <preStepRef>..HEAD` (scoped to the agent's
 *    allowed directory prefixes).
 *  - Compute budget utilization from accumulated tool counts + tokens.
 */
export async function enrichPostSessionTelemetry(
  ctx: NodeContext,
  input: PostSessionInput,
): Promise<void> {
  const { telemetry, toolLimitsHard, runtimeTokenBudget } = input;
  const { itemKey, appRoot, repoRoot, apmContext, vcs, logger } = ctx;

  // Record HEAD for git-diff attribution
  try {
    telemetry.headAfterAttempt = await vcs.getHeadSha();
  } catch { /* non-fatal */ }

  // Git-diff fallback for filesChanged tracking
  const preStepRef = ctx.handlerData["preStepRef"] as string | undefined;
  if (telemetry.filesChanged.length === 0 && preStepRef) {
    try {
      const diffFiles = await vcs.getChangedFiles(preStepRef, "HEAD");
      if (diffFiles.length > 0) {
        const appRel = path.relative(repoRoot, appRoot);
        const dirs = apmContext.config?.directories as Record<string, string | null> | undefined;
        const allowedPrefixes = getAgentDirectoryPrefixes(getWorkflowNode(ctx), appRel, dirs);
        const scopedFiles = allowedPrefixes.length > 0
          ? diffFiles.filter((f) => allowedPrefixes.some((p) => f.startsWith(p)))
          : diffFiles.filter((f) => !f.includes(".dagent/"));
        for (const f of scopedFiles) {
          if (!telemetry.filesChanged.includes(f)) telemetry.filesChanged.push(f);
        }
        if (scopedFiles.length > 0) {
          logger.event("handoff.emit", itemKey, {
            channel: "git_diff_fallback",
            file_count: scopedFiles.length,
          });
        }
      }
    } catch { /* non-fatal — SDK tracking is the primary source */ }
  }

  // Budget utilization for reporting
  const totalToolCalls = Object.values(telemetry.toolCounts).reduce((a, b) => a + b, 0);
  telemetry.budgetUtilization = {
    toolCallsUsed: totalToolCalls,
    toolCallLimit: toolLimitsHard,
    tokensConsumed: telemetry.inputTokens + telemetry.outputTokens,
    ...(runtimeTokenBudget != null ? { tokenBudget: runtimeTokenBudget } : {}),
  };
}
