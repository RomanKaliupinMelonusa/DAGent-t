/**
 * reporting/change-manifest.ts — _CHANGES.json manifest writer for docs agents.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { ItemSummary } from "../types.js";
import { featurePath, ensureFeatureDir } from "../paths/feature-paths.js";
import { buildEnvelope } from "../apm/artifact-catalog.js";

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
  readStateFn: (slug: string) => Promise<{ items: Array<{ key: string; docNote?: string | null }> }>,
): Promise<void> {
  const manifestPath = featurePath(appRoot, slug, "change-manifest");
  ensureFeatureDir(appRoot, slug, "change-manifest");
  let stateItems: Array<{ key: string; docNote?: string | null }> = [];
  try {
    const currentState = await readStateFn(slug);
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
      allFilesChanged = diff.split("\n").filter(f => !f.includes(".dagent/"));
    }
  } catch {
    console.warn("  ⚠ Could not compute full git diff for _CHANGES.json. Falling back to session memory.");
    allFilesChanged = [...new Set(pipelineSummaries.flatMap((s) => s.filesChanged))];
  }
  const manifest = {
    // Session A (Item 8) — emit the envelope natively so the change
    // manifest is strict_artifacts-compatible even though this writer
    // predates the bus migration.
    ...buildEnvelope("change-manifest", "docs-archived"),
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
