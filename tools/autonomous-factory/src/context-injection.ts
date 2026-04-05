/**
 * context-injection.ts — Prompt augmentation for retry and redevelopment cycles.
 *
 * Builds prompt fragments that the orchestrator appends to the base task prompt
 * when an item is being retried or re-entered after a post-deploy failure.
 * These are pure string builders with no session or SDK coupling.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ItemSummary } from "./types.js";
import { DEV_ITEMS, POST_DEPLOY_ITEMS } from "./types.js";
import { readState } from "./state.js";

/**
 * Build retry context from a previous failed attempt.
 * Injected when attemptCounts > 1 so the agent doesn't start from scratch.
 */
export function buildRetryContext(
  prevAttempt: ItemSummary,
  atRevertThreshold: boolean,
): string {
  const isTimeout = prevAttempt.outcome === "error" &&
    (prevAttempt.errorMessage?.includes("Timeout") || prevAttempt.errorMessage?.includes("timeout"));

  const retryLines = [
    `\n## Previous Attempt Context (attempt ${prevAttempt.attempt})`,
    `The previous session ${prevAttempt.outcome === "error" ? "timed out" : "failed"}: ${prevAttempt.errorMessage ?? "unknown"}`,
    prevAttempt.filesChanged.length > 0
      ? `Files already modified: ${prevAttempt.filesChanged.join(", ")}`
      : "No files were changed.",
    prevAttempt.intents.length > 0
      ? `Last reported intent: "${prevAttempt.intents[prevAttempt.intents.length - 1]}"`
      : "",
    prevAttempt.shellCommands.filter((s) => s.isPipelineOp).length > 0
      ? `Pipeline operations that already succeeded:\n${prevAttempt.shellCommands
          .filter((s) => s.isPipelineOp)
          .map((s) => `  - ${s.command}`)
          .join("\n")}`
      : "",
    // When the revert warning will fire, skip incremental advice — the agent should wipe and restart
    atRevertThreshold
      ? ""
      : isTimeout
        // Timeout-specific scope reduction: previous session ran out of time, not failed with an error
        ? `\nThe previous session ran out of time (not a code error). ` +
          `Start by checking what was already done: \`git status\`, run tests. ` +
          `Focus ONLY on unfinished work — do NOT re-read the full codebase or redo completed steps. ` +
          (prevAttempt.filesChanged.length > 0
            ? `The files listed above were already modified — verify they are correct, then move to the next task.`
            : `Check git log for any commits from the prior attempt.`)
        : `\nStart by checking what was already done (git status, run tests) rather than re-reading the full codebase from scratch.`,
  ];
  return retryLines.filter(Boolean).join("\n");
}

/**
 * Build downstream failure context when a dev item is re-invoked
 * after a post-deploy failure (live-ui, integration-test).
 * Returns empty string if no downstream failures exist.
 */
export function buildDownstreamFailureContext(
  itemKey: string,
  pipelineSummaries: readonly ItemSummary[],
  ciWorkflowFilePatterns?: string[],
): string {
  if (!DEV_ITEMS.has(itemKey)) return "";

  const downstreamFailures = pipelineSummaries.filter(
    (s) => POST_DEPLOY_ITEMS.has(s.key) && s.outcome !== "completed",
  );
  if (downstreamFailures.length === 0) return "";

  const failureDetails = downstreamFailures
    .map((f) => [
      `### ${f.key} (attempt ${f.attempt})`,
      `Outcome: ${f.outcome}`,
      f.errorMessage ? `Error: ${f.errorMessage}` : "",
      f.shellCommands.filter((s) => s.isPipelineOp).length > 0
        ? `Pipeline ops:\n${f.shellCommands
            .filter((s) => s.isPipelineOp)
            .map((s) => `  - ${s.command}`)
            .join("\n")}`
        : "",
    ].filter(Boolean).join("\n"))
    .join("\n\n");

  // Detect cross-cutting scope issues: if the error mentions .github/workflows
  // or CI/CD files, warn the agent about commit scope and provide the cicd scope
  const lastError = downstreamFailures[downstreamFailures.length - 1]?.errorMessage ?? "";
  const cicdFilePatterns = [".github/workflows", ...(ciWorkflowFilePatterns ?? [])];
  const involvesCicd = cicdFilePatterns.some((p) => lastError.includes(p));

  let scopeGuidance = "";
  if (involvesCicd) {
    scopeGuidance = `\n\n## Commit Scope Warning (CRITICAL)\n`
      + `The error above involves CI/CD workflow files under \`.github/workflows/\`. `
      + `These files are NOT covered by the default \`backend\` or \`frontend\` commit scopes.\n\n`
      + `**To commit .github/ changes, use the \`cicd\` scope:**\n`
      + "```bash\n"
      + `bash tools/autonomous-factory/agent-commit.sh cicd "fix(ci): <description>"\n`
      + "```\n"
      + `If your fix spans both backend code AND workflow files, make TWO commits:\n`
      + `1. \`agent-commit.sh backend "fix(backend): ..."\` for backend/ changes\n`
      + `2. \`agent-commit.sh cicd "fix(ci): ..."\` for .github/ changes\n`;
  }

  return `\n\n## Redevelopment Context (CRITICAL)\nThe following post-deploy verification steps failed. Fix the root cause in your code:\n\n${failureDetails}\n\nFocus on the errors above — they describe exactly what broke in production.${scopeGuidance}`;
}

/**
 * Build the clean-slate revert warning for dev agents stuck in a loop.
 * Returns empty string if the threshold hasn't been reached.
 */
export function buildRevertWarning(
  itemKey: string,
  effectiveDevAttempts: number,
): string {
  if (!DEV_ITEMS.has(itemKey) || effectiveDevAttempts < 3) return "";

  return `\n\n## 🚨 CRITICAL SYSTEM WARNING\nYou have failed to fix this feature ${effectiveDevAttempts} times. You are likely trapped in a hallucination loop. `
    + `RECOMMENDED ACTION: Run \`bash tools/autonomous-factory/agent-branch.sh revert\` to physically wipe the codebase clean back to the main branch. `
    + `Then, re-explore the codebase and build this feature using a completely different architectural approach.`;
}

/**
 * Build infra rollback context when `@infra-architect` is re-invoked after
 * a Wave 2 app agent called `pipeline:redevelop-infra`.
 * Returns the rejection reason so the infra agent knows what to fix.
 */
export async function buildInfraRollbackContext(slug: string): Promise<string> {
  try {
    const state = await readState(slug);
    const infraEntries = state.errorLog.filter((e) => e.itemKey === "redevelop-infra");
    if (infraEntries.length === 0) return "";
    const latest = infraEntries[infraEntries.length - 1];
    return (
      `\n\n## ⚠️ INFRASTRUCTURE REJECTED BY APPLICATION TEAM\n`
      + `The previous application deployment wave failed because the following infrastructure was missing or misconfigured:\n\n`
      + `> ${latest.message}\n\n`
      + `You MUST update your Terraform code to fulfill this requirement before completing this task.`
    );
  } catch {
    return "";
  }
}

/**
 * Compute the effective attempt count for DEV items.
 * Combines in-memory attemptCounts (resets on orchestrator restart) with
 * persisted redevelopment cycle count from state (survives restarts).
 */
export async function computeEffectiveDevAttempts(
  itemKey: string,
  inMemoryAttempts: number,
  slug: string,
): Promise<number> {
  if (!DEV_ITEMS.has(itemKey)) return inMemoryAttempts;
  try {
    const pipeState = await readState(slug);
    const persistedCycles = pipeState.errorLog.filter((e) => e.itemKey === "reset-for-dev").length;
    return Math.max(inMemoryAttempts, persistedCycles);
  } catch {
    return inMemoryAttempts;
  }
}

/**
 * Write the change manifest JSON for the docs-expert agent.
 * Contains a structured summary of all completed steps, files changed,
 * and per-item docNotes (written by dev agents via pipeline:doc-note).
 */
export async function writeChangeManifest(
  slug: string,
  appRoot: string,
  repoRoot: string,
  pipelineSummaries: readonly ItemSummary[],
): Promise<void> {
  const manifestPath = path.join(appRoot, "in-progress", `${slug}_CHANGES.json`);
  // Read state to pull per-item docNotes written by dev agents
  let stateItems: Array<{ key: string; docNote?: string | null }> = [];
  try {
    const currentState = await readState(slug);
    stateItems = currentState.items;
  } catch { /* best effort — manifest still useful without docNotes */ }
  let allFilesChanged: string[] = [];
  try {
    const baseBranch = process.env.BASE_BRANCH || "main";
    if (!/^[\w.\-/]+$/.test(baseBranch)) {
      throw new Error(`Invalid BASE_BRANCH value: ${baseBranch}`);
    }
    const mergeBase = execSync(`git merge-base origin/${baseBranch} HEAD`, {
      cwd: repoRoot, encoding: "utf-8",
    }).trim();

    const diff = execSync(`git diff --name-only ${mergeBase}..HEAD`, {
      cwd: repoRoot, encoding: "utf-8",
    }).trim();

    if (diff) {
      allFilesChanged = diff.split("\n").filter(f => !f.includes("in-progress/"));
    }
  } catch {
    console.warn("  ⚠ Could not compute full git diff for _CHANGES.json. Falling back to session memory.");
    allFilesChanged = [...new Set(pipelineSummaries.flatMap((s) => s.filesChanged))];
  }
  const manifest = {
    feature: slug,
    stepsCompleted: pipelineSummaries
      .filter((s) => s.outcome === "completed")
      .map((s) => {
        const stateItem = stateItems.find((i) => i.key === s.key);
        return {
          key: s.key,
          agent: s.agent,
          filesChanged: s.filesChanged,
          docNote: stateItem?.docNote ?? null,
        };
      }),
    allFilesChanged,
    summaryIntents: pipelineSummaries
      .filter((s) => s.outcome === "completed")
      .flatMap((s) => s.intents),
  };
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
    console.log(`  📋 Change manifest written to ${path.relative(repoRoot, manifestPath)}`);
  } catch {
    console.warn("  ⚠ Could not write change manifest — docs-expert will use git diff");
  }
}
