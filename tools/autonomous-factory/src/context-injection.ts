/**
 * context-injection.ts — Backward-compatible re-exports + non-failure utilities.
 *
 * @deprecated `computeEffectiveDevAttempts` is superseded by
 * `kernel/types.ts` RunState.attemptCounts + domain/cycle-counter.ts.
 * `writeChangeManifest` is retained (not yet migrated to an adapter).
 * Failure-related re-exports are consumed by handlers in both paths.
 * Remove this file once KERNEL_MODE becomes the sole execution path
 * and writeChangeManifest is migrated.
 *
 * Failure-related context builders have been migrated to `triage/context-builder.ts`.
 * This module re-exports them for backward compatibility and retains:
 *   - `computeEffectiveDevAttempts` — attempt count computation (kernel utility)
 *   - `writeChangeManifest` — success-path change manifest for docs-expert
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ItemSummary } from "./types.js";
import { REDEVELOPMENT_RESET_OPS } from "./types.js";
import { readState } from "./state.js";

// Re-export failure-related context builders from their new home
export {
  buildRetryContext,
  buildDownstreamFailureContext,
  buildRevertWarning,
  buildTriageRejectionContext,
  buildPhaseRejectionContext,
  buildInfraRollbackContext,
  checkRetryDedup,
  composeTriageContext,
} from "./triage/context-builder.js";

/**
 * Compute the effective attempt count for items that track persisted cycles.
 * Combines in-memory attemptCounts (resets on orchestrator restart) with
 * persisted redevelopment cycle count from state (survives restarts).
 *
 * When `allowsRevertBypass` is true (or nodeCategory is "dev" for backward
 * compat), persisted cycles are factored in. Otherwise returns inMemoryAttempts.
 */
export async function computeEffectiveDevAttempts(
  itemKey: string,
  inMemoryAttempts: number,
  slug: string,
  /** Whether this node tracks persisted cycles (from resolveCircuitBreaker). */
  allowsRevertBypass?: boolean,
): Promise<number> {
  if (!allowsRevertBypass) return inMemoryAttempts;
  try {
    const pipeState = await readState(slug);
    const persistedCycles = pipeState.errorLog.filter(
      (e) => (REDEVELOPMENT_RESET_OPS as readonly string[]).includes(e.itemKey),
    ).length;
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
