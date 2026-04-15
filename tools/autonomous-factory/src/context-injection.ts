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
import { readState } from "./state.js";
import { computeErrorSignature } from "./triage/error-fingerprint.js";

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
  /** Caller-resolved node.category for itemKey (from workflow manifest) */
  nodeCategory?: string,
  /** Config-driven commit scope warning text (from apm.yml config.ci_scope_warning). */
  ciScopeWarning?: string,
  /** Feature slug — used for cross-cycle error signature comparison. */
  slug?: string,
): string {
  if (nodeCategory !== "dev") return "";

  const downstreamFailures = pipelineSummaries.filter(
    (s) => s.outcome !== "completed",
  ).filter((s) => s.key !== itemKey);
  if (downstreamFailures.length === 0) return "";

  // --- K2: Extract structured diagnosis from triage system ---
  // The triage cascade may prepend structured headers (FAULT_DOMAIN_HINT, ROOT_CAUSE,
  // ERROR_TYPE, EVIDENCE) to error messages. Surface these prominently so the dev
  // agent sees the diagnosis immediately instead of re-discovering it from raw output.
  const diagnosisSection = extractDiagnosisFromFailures(downstreamFailures);

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

  // Inject config-driven scope warning when CI/CD files are detected in the error
  let scopeGuidance = "";
  if (ciScopeWarning) {
    const lastError = downstreamFailures[downstreamFailures.length - 1]?.errorMessage ?? "";
    const cicdFilePatterns = [".github/workflows", ...(ciWorkflowFilePatterns ?? [])];
    const involvesCicd = cicdFilePatterns.some((p) => lastError.includes(p));
    if (involvesCicd) {
      scopeGuidance = `\n\n${ciScopeWarning}`;
    }
  }

  // Cross-cycle error signature comparison — detect "same error after redevelopment"
  const identicalErrorWarning = buildIdenticalErrorWarning(downstreamFailures, slug);

  return `\n\n## Redevelopment Context (CRITICAL)\nThe following post-deploy verification steps failed. Fix the root cause in your code:\n${diagnosisSection}\n${failureDetails}\n\nFocus on the errors above — they describe exactly what broke in production.${scopeGuidance}${identicalErrorWarning}`;
}

/**
 * Extract structured diagnosis headers (FAULT_DOMAIN_HINT, ROOT_CAUSE, etc.)
 * from downstream failure error messages. The triage system or post-hook
 * failures may prepend these headers to error messages.
 *
 * Returns a formatted "## Automated Diagnosis" section if any diagnosis is found,
 * or empty string if raw errors have no structured headers.
 *
 * Stack-agnostic: parses `KEY: value` header lines with no framework assumptions.
 */
function extractDiagnosisFromFailures(
  failures: readonly ItemSummary[],
): string {
  const diagFields: Record<string, string> = {};

  for (const f of failures) {
    if (!f.errorMessage) continue;
    // Parse structured headers from the beginning of the error message
    // Format: "FAULT_DOMAIN_HINT: frontend\nROOT_CAUSE: ...\nERROR_TYPE: ...\nEVIDENCE: ..."
    const lines = f.errorMessage.split("\n");
    for (const line of lines) {
      const match = line.match(/^(FAULT_DOMAIN_HINT|ROOT_CAUSE|ERROR_TYPE|EVIDENCE):\s*(.+)/);
      if (match) {
        // Use the most recent value if multiple failures have headers
        diagFields[match[1]] = match[2].trim();
      } else if (Object.keys(diagFields).length > 0 && !line.match(/^\w+:/)) {
        // Stop parsing headers once we hit a non-header line
        break;
      }
    }
  }

  if (Object.keys(diagFields).length === 0) return "";

  const parts = ["\n### Automated Diagnosis (from previous run's triage system)"];
  if (diagFields.ROOT_CAUSE) parts.push(`**Root Cause:** ${diagFields.ROOT_CAUSE}`);
  if (diagFields.FAULT_DOMAIN_HINT) parts.push(`**Fault Domain:** ${diagFields.FAULT_DOMAIN_HINT}`);
  if (diagFields.ERROR_TYPE) parts.push(`**Error Type:** ${diagFields.ERROR_TYPE}`);
  if (diagFields.EVIDENCE) parts.push(`**Evidence:** ${diagFields.EVIDENCE}`);
  parts.push("\n**Use this diagnosis as your starting point. Do NOT re-investigate from scratch.**");

  return parts.join("\n");
}

/**
 * Check whether the current downstream error signature matches a prior
 * redevelopment cycle's error. Returns a warning string if the dev agent
 * failed to fix the issue (identical error after redevelopment), else "".
 */
function buildIdenticalErrorWarning(
  downstreamFailures: readonly ItemSummary[],
  slug?: string,
): string {
  if (!slug) return "";
  const currentError = downstreamFailures[downstreamFailures.length - 1]?.errorMessage;
  if (!currentError) return "";

  const currentSig = computeErrorSignature(currentError);

  // readState is async (lazy-loaded .mjs), but this function is called
  // synchronously from a string builder. Use a sync fallback via the
  // filesystem directly to avoid breaking the call chain.
  let errorLog: Array<{ itemKey: string; errorSignature?: string | null }> = [];
  try {
    const appRoot = process.env.APP_ROOT || "";
    const stateDir = path.join(appRoot, "in-progress");
    const statePath = path.join(stateDir, `${slug}_STATE.json`);
    if (fs.existsSync(statePath)) {
      const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      errorLog = raw.errorLog ?? [];
    }
  } catch { /* noop */ }

  try {
    const priorRedevEntries = errorLog.filter(
      (e) => e.itemKey === "reset-for-dev" && e.errorSignature,
    );
    const matchCount = priorRedevEntries.filter(
      (e) => e.errorSignature === currentSig,
    ).length;

    if (matchCount >= 1) {
      return `\n\n## ⚠️ IDENTICAL ERROR DETECTED (${matchCount + 1}× same root cause)`
        + `\nThe downstream test failed with the **IDENTICAL error signature** as the previous redevelopment cycle.`
        + `\nYour last change did NOT address the root cause.`
        + `\n\n**Do NOT repeat the same fix.** Re-read the error output above with fresh eyes and try a fundamentally different approach.`
        + (matchCount >= 2
          ? `\n\n**ESCALATION WARNING:** This is the ${matchCount + 1}th identical failure. If you cannot resolve this, the pipeline will be blocked for human review.`
          : "");
    }
  } catch { /* state read failed — no warning */ }

  return "";
}

/**
 * Build the clean-slate revert warning for dev agents stuck in a loop.
 * Returns empty string if the threshold hasn't been reached.
 */
export function buildRevertWarning(
  itemKey: string,
  effectiveDevAttempts: number,
  /** Caller-resolved node.category for itemKey (from workflow manifest) */
  nodeCategory?: string,
): string {
  if (nodeCategory !== "dev" || effectiveDevAttempts < 3) return "";

  return `\n\n## 🚨 CRITICAL SYSTEM WARNING\nYou have failed to fix this feature ${effectiveDevAttempts} times. You are likely trapped in a hallucination loop. `
    + `RECOMMENDED ACTION: Run \`bash tools/autonomous-factory/agent-branch.sh revert\` to physically wipe the codebase clean back to the main branch. `
    + `Then, re-explore the codebase and build this feature using a completely different architectural approach.`;
}

/**
 * Build infra rollback context when `@infra-architect` is re-invoked after
 * a Wave 2 app agent called `pipeline:reset-phases`.
 * Returns the rejection reason so the infra agent knows what to fix.
 */
export async function buildInfraRollbackContext(slug: string): Promise<string> {
  try {
    const state = await readState(slug);
    const infraEntries = state.errorLog.filter((e) => e.itemKey === "reset-phases");
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
  /** Caller-resolved node.category for itemKey (from workflow manifest) */
  nodeCategory?: string,
): Promise<number> {
  if (nodeCategory !== "dev") return inMemoryAttempts;
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
