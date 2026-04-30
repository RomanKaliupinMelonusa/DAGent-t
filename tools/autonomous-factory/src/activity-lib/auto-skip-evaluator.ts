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
import fs from "node:fs";
import type { ApmCompiledOutput } from "../apm/types.js";
import type { PipelineState } from "../types.js";
import type { SkipResult } from "./types.js";
import { getAutoSkipBaseRef, getGitChangedFiles, getDirectoryPrefixes, getGitDeletions, hasDeletedFiles } from "../lifecycle/auto-skip.js";
import { findUpstreamKeysByCategory } from "../session/dag-utils.js";

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
// Positive output signal — P4 of halt-discipline hardening
// ---------------------------------------------------------------------------

/**
 * Synchronously check whether at least one of the node's declared
 * `produces_artifacts` kinds has materialised on disk under any prior
 * sealed invocation directory:
 *
 *   <appRoot>/.dagent/<slug>/<nodeKey>/inv_<id>/meta.json
 *
 * Returns `true` when a `meta.json` lists at least one output whose
 * `kind` matches one of `declaredKinds`. Returns `true` (vacuously) when
 * `declaredKinds` is empty so legacy nodes that don't declare outputs
 * keep their original auto-skip semantics.
 *
 * Fail-open on I/O errors (returns `true`) — a transient ENOENT must not
 * convert a legitimate skip into an unexpected re-run.
 */
export function hasPositiveOutputSignal(
  appRoot: string,
  slug: string,
  nodeKey: string,
  declaredKinds: ReadonlyArray<string>,
): boolean {
  if (declaredKinds.length === 0) return true;
  const declared = new Set(declaredKinds);
  const nodeDir = path.join(appRoot, ".dagent", slug, nodeKey);
  let entries: string[];
  try {
    entries = fs.readdirSync(nodeDir);
  } catch {
    // No prior invocation directory at all — definitely no positive signal.
    return false;
  }
  for (const entry of entries) {
    if (!entry.startsWith("inv_")) continue;
    const metaPath = path.join(nodeDir, entry, "meta.json");
    let raw: string;
    try {
      raw = fs.readFileSync(metaPath, "utf-8");
    } catch {
      continue;
    }
    let meta: { outputs?: Array<{ kind?: string }> };
    try {
      meta = JSON.parse(raw);
    } catch {
      continue;
    }
    const outputs = Array.isArray(meta.outputs) ? meta.outputs : [];
    for (const out of outputs) {
      if (out && typeof out.kind === "string" && declared.has(out.kind)) {
        return true;
      }
    }
  }
  return false;
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
  pipelineState?: Readonly<PipelineState>,
): AutoSkipDecision {
  const wfName = workflowName ?? Object.keys(apmContext.workflows ?? {})[0] ?? "default";
  const node = apmContext.workflows?.[wfName]?.nodes?.[itemKey];
  if (!node) return { skip: null, forceRunChanges: false };

  // ── First-run guard (Cause B) ─────────────────────────────────────────
  // A node that declares `produces_artifacts` but has no prior completed
  // invocation on disk has never run for this feature. The auto-skip
  // heuristics below ("no diff in declared dirs", "no deletions") would
  // otherwise mark a fresh feature node `na` before the LLM ever runs —
  // exactly how `quick-view-new` died with `baseline-analyzer/storefront-dev`
  // skipped on a clean branch. We exempt `auto_skip_unless_triage_reroute`
  // (the storefront-debug happy path skip) since that path is intentional.
  const declaredOutputs = (node.produces_artifacts ?? []) as ReadonlyArray<string>;
  const slug = pipelineState?.feature ?? "";
  if (
    declaredOutputs.length > 0 &&
    slug &&
    !node.auto_skip_unless_triage_reroute &&
    !hasPositiveOutputSignal(appRoot, slug, itemKey, declaredOutputs)
  ) {
    return { skip: null, forceRunChanges: false };
  }

  let forceRunChanges = false;

  // ── Triage-reroute gate: skip unless routed in by the triage handler ──
  // When `auto_skip_unless_triage_reroute` is true, the node is only
  // meaningful if it was activated via a triage reroute. Triage stages
  // an unsealed `InvocationRecord` with `trigger: "triage-reroute"` and
  // points `item.latestInvocationId` at it; absent that staged record
  // (or any other trigger), treat the happy-path visit as a no-op.
  // Phase 6 — detection switched from the legacy `pendingContext` string
  // probe (now removed) to the staged record's `trigger` field.
  // probe to the `trigger` field, which is the canonical signal.
  if (node.auto_skip_unless_triage_reroute) {
    const item = pipelineState?.items.find((i) => i.key === itemKey);
    const staged = item?.latestInvocationId
      ? pipelineState?.artifacts?.[item.latestInvocationId]
      : undefined;
    const isReroute = staged?.trigger === "triage-reroute" && !staged.sealed;
    if (!isReroute) {
      console.log(`  ⏭ Auto-skipping ${itemKey} — no triage handoff (auto_skip_unless_triage_reroute)`);
      return {
        skip: {
          reason: "Auto-skipped: no triage reroute handoff for this node (auto_skip_unless_triage_reroute).",
        },
        forceRunChanges: false,
      };
    }
  }

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
        // P4 — auto-skip requires positive evidence that the node
        // produced its declared outputs in a previous invocation.
        // Without it, a fresh feature workspace would trivially skip
        // any node whose source dirs happen to be empty in the diff.
        const declared = (node.produces_artifacts ?? []) as ReadonlyArray<string>;
        const slug = pipelineState?.feature ?? "";
        if (
          declared.length > 0 &&
          slug &&
          !hasPositiveOutputSignal(appRoot, slug, itemKey, declared)
        ) {
          console.log(
            `  ▶ Running ${itemKey} — git diff is clean but no prior on-disk output for [${declared.join(", ")}] (P4 positive-signal gate)`,
          );
          return { skip: null, forceRunChanges };
        }
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
