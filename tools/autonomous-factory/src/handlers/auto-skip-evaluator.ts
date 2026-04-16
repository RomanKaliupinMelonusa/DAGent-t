/**
 * handlers/auto-skip-evaluator.ts — Data-driven auto-skip evaluation.
 *
 * Evaluates whether a pipeline item can be skipped based on workflow
 * manifest declarations (auto_skip_if_no_changes_in, auto_skip_if_no_deletions,
 * force_run_if_changed). Pure function — returns a decision without
 * mutating pipeline state. The kernel acts on the decision.
 *
 * Extracted from session-runner.ts to keep the kernel thin and make
 * auto-skip logic reusable by any handler's shouldSkip() method.
 */

import path from "node:path";
import type { ApmCompiledOutput } from "../apm-types.js";
import type { SkipResult } from "./types.js";
import { getAutoSkipBaseRef, getGitChangedFiles, getDirectoryPrefixes, getGitDeletions, hasDeletedFiles } from "../auto-skip.js";
import { findUpstreamKeysByCategory } from "../session/shared.js";

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface AutoSkipDecision {
  /** If non-null, the item should be skipped with this reason */
  skip: SkipResult | null;
  /** Whether force_run_if_changed directories had changes (propagated to ctx.forceRunChanges) */
  forceRunChanges: boolean;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluate auto-skip for a pipeline item based on workflow manifest declarations.
 *
 * Checks:
 * 1. `auto_skip_if_no_changes_in` — skip if no git diff in declared directories
 * 2. `force_run_if_changed` — override skip when secondary dirs have changes
 * 3. `auto_skip_if_no_deletions` — skip if feature is purely additive
 *
 * @returns Decision with skip result and force-run detection flag
 */
export function evaluateAutoSkip(
  itemKey: string,
  apmContext: ApmCompiledOutput,
  repoRoot: string,
  baseBranch: string,
  appRoot: string,
  preStepRefs: Readonly<Record<string, string>>,
  workflowName?: string,
): AutoSkipDecision {
  const wfName = workflowName ?? Object.keys(apmContext.workflows ?? {})[0] ?? "default";
  const node = apmContext.workflows?.[wfName]?.nodes?.[itemKey];
  if (!node) return { skip: null, forceRunChanges: false };

  let forceRunChanges = false;

  const autoSkipRef = getAutoSkipBaseRef(repoRoot, baseBranch, preStepRefs);
  const appRel = path.relative(repoRoot, appRoot);
  const dirPrefixes = getDirectoryPrefixes(
    appRel,
    apmContext.config?.directories as Record<string, string | null> | undefined,
  );

  // ── Data-driven auto-skip: check directory changes ────────────────────
  if (node.auto_skip_if_no_changes_in && node.auto_skip_if_no_changes_in.length > 0) {
    // Find the best base ref — walk DAG backward to find nearest upstream dev node
    const workflow = apmContext.workflows?.[wfName];
    const upstreamDevKeys = workflow ? findUpstreamKeysByCategory(workflow.nodes, itemKey, ["dev"]) : [];
    let devRef: string | null = null;
    for (const dk of upstreamDevKeys) {
      devRef = autoSkipRef(dk);
      if (devRef) break;
    }
    if (devRef) {
      const gitChanged = getGitChangedFiles(repoRoot, devRef);
      if (gitChanged === null) return { skip: null, forceRunChanges: false }; // Fail-closed

      // Build union of prefixes from all declared directory keys
      const allPrefixes: string[] = [];
      for (const dirKey of node.auto_skip_if_no_changes_in) {
        const prefixSet = dirPrefixes[dirKey];
        if (prefixSet) allPrefixes.push(...prefixSet);
      }

      const hasChanges = gitChanged.some((f) => allPrefixes.some((p) => f.startsWith(p)));

      // Dynamic force-run: if force_run_if_changed dirs have changes but primary dirs don't,
      // force the node to run anyway (driven by workflow manifest)
      if (node.force_run_if_changed && node.force_run_if_changed.length > 0) {
        const forceRunPrefixes = node.force_run_if_changed.flatMap((k: string) => dirPrefixes[k] || []);
        const hasForceRunChanges = gitChanged.some((f) => forceRunPrefixes.some((p) => f.startsWith(p)));
        forceRunChanges = hasForceRunChanges;
        if (hasForceRunChanges) {
          const nonForceKeys = node.auto_skip_if_no_changes_in.filter(
            (k: string) => !node.force_run_if_changed!.includes(k),
          );
          const nonForcePrefixes = nonForceKeys.flatMap((k: string) => dirPrefixes[k] || []);
          if (!gitChanged.some((f) => nonForcePrefixes.some((p) => f.startsWith(p)))) {
            console.log(`  ▶ Running ${itemKey} — force_run_if_changed dirs [${node.force_run_if_changed.join(", ")}] have changes`);
            return { skip: null, forceRunChanges: true };
          }
        }
      }

      if (!hasChanges) {
        console.log(`  ⏭ Auto-skipping ${itemKey} — no changes in [${node.auto_skip_if_no_changes_in.join(", ")}] since ${devRef.slice(0, 8)}`);
        return {
          skip: {
            reason: `Auto-skipped: no changes in [${node.auto_skip_if_no_changes_in.join(", ")}] detected (git diff)`,
          },
          forceRunChanges,
        };
      }
    }
  }

  // ── Data-driven auto-skip: check deletions ────────────────────────────
  if (node.auto_skip_if_no_deletions) {
    const deletions = getGitDeletions(repoRoot, baseBranch);
    const deleted = hasDeletedFiles(repoRoot, baseBranch);
    if (deletions === 0 && !deleted) {
      console.log(`  ⏭ Auto-skipping ${itemKey} — feature is purely additive (0 deletions, 0 deleted files)`);
      return {
        skip: {
          reason: "Auto-skipped: Feature is purely additive (0 deletions detected in git diff). No architectural dead code possible.",
        },
        forceRunChanges,
      };
    }
  }

  return { skip: null, forceRunChanges };
}
