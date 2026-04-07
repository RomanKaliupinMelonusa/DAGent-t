#!/usr/bin/env node

/**
 * pipeline-state.mjs — Deterministic pipeline state management.
 *
 * Owns `in-progress/<slug>_STATE.json` as the single source of truth.
 * Regenerates `in-progress/<slug>_TRANS.md` as a read-only view on every mutation.
 *
 * Linear Feature-Branch Model: All work happens on a single feature/<slug>
 * branch. The PR to the base branch (default: main, configurable via BASE_BRANCH) is created as the final pipeline step.
 *
 * Commands:
 *   init              <slug> <type>               — Create state + TRANS for a new feature
 *   complete          <slug> <item-key>           — Mark an item as done
 *   fail              <slug> <item-key> <message> — Record a failure
 *   reset-scripts     <slug> <phase>              — Reset script-type nodes in the given phase for re-push
 *   reset-phases      <slug> <phases-csv> <reason> — Reset all nodes in the given phases for redevelopment
 *   resume            <slug>                      — Resume pipeline after elevated apply
 *   recover-elevated  <slug> <error-message>      — Recover pipeline after failed elevated apply
 *   status            <slug>                      — Print current state JSON to stdout
 *   next              <slug>                      — Print the next actionable item key
 *   set-note          <slug> <note>               — Append implementation note
 *   doc-note          <slug> <item-key> <note>    — Set doc note on a pipeline item
 *   set-url           <slug> <url>                — Set deployed URL
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { TriageDiagnosticSchema } from "./triage-schema.mjs";

// ─── Constants ──────────────────────────────────────────────────────────────

/** Repo root: this file lives at tools/autonomous-factory/pipeline-state.mjs → repo is two levels up */
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");

/** App root: defaults to repo root unless APP_ROOT env var is set (absolute or relative to REPO_ROOT) */
const APP_ROOT = process.env.APP_ROOT
  ? (process.env.APP_ROOT.startsWith("/") ? process.env.APP_ROOT : join(REPO_ROOT, process.env.APP_ROOT))
  : REPO_ROOT;
const IN_PROGRESS = join(APP_ROOT, "in-progress");

// ─── Graph Utilities ────────────────────────────────────────────────────────

/**
 * Compute all transitive downstream dependents of the given seed keys.
 * Uses the reverse of state.dependencies (i.e., for each key, which keys
 * transitively depend on it). Returns the seed keys + all downstream.
 */
export function getDownstream(state, seedKeys) {
  // Build reverse adjacency: child → parents becomes parent → children
  const reverse = {};
  for (const [key, deps] of Object.entries(state.dependencies)) {
    for (const dep of deps) {
      if (!reverse[dep]) reverse[dep] = [];
      reverse[dep].push(key);
    }
  }
  const result = new Set(seedKeys);
  const queue = [...seedKeys];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const child of (reverse[current] || [])) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return [...result];
}

/**
 * Compute all transitive upstream dependencies of the given seed keys.
 * Returns the seed keys + all upstream.
 */
export function getUpstream(state, seedKeys) {
  const result = new Set(seedKeys);
  const queue = [...seedKeys];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const dep of (state.dependencies[current] || [])) {
      if (!result.has(dep)) {
        result.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...result];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function statePath(slug) {
  return join(IN_PROGRESS, `${slug}_STATE.json`);
}

function transPath(slug) {
  return join(IN_PROGRESS, `${slug}_TRANS.md`);
}

export function readState(slug) {
  const p = statePath(slug);
  if (!existsSync(p)) {
    console.error(`ERROR: State file not found: ${p}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(p, "utf-8"));
}

/** Like readState but throws instead of calling process.exit — for programmatic API use. */
function readStateOrThrow(slug) {
  const p = statePath(slug);
  if (!existsSync(p)) {
    throw new Error(`State file not found: ${p}`);
  }
  return JSON.parse(readFileSync(p, "utf-8"));
}

function writeState(slug, state) {
  writeFileSync(statePath(slug), JSON.stringify(state, null, 2) + "\n", "utf-8");
  renderTrans(slug, state);
}

/** Render the human-readable TRANS.md from state.json. */
function renderTrans(slug, state) {
  const lines = [];
  lines.push(`# Transition Log — ${state.feature}`);
  lines.push("");
  lines.push("## Workflow");
  lines.push(`- **Type:** ${state.workflowType}`);
  lines.push(`- **Started:** ${state.started}`);
  lines.push(`- **Deployed URL:** ${state.deployedUrl || "[To be filled after deployment]"}`);
  lines.push("");
  lines.push("## Implementation Notes");
  lines.push(state.implementationNotes || "[To be filled by Dev agents during implementation]");
  lines.push("");
  lines.push("## Checklist");

  // Group items by phase (use state.phases if available, else derive from items)
  const phases = state.phases || [...new Set(state.items.map((i) => i.phase))];
  for (const phase of phases) {
    const heading = phase === "infra" ? "Infrastructure (Wave 1)"
      : phase === "approval" ? "Approval Gate"
      : phase === "pre-deploy" ? "Pre-Deploy (Wave 2)"
      : phase === "deploy" ? "Deploy"
      : phase === "post-deploy" ? "Post-Deploy"
      : "Finalize";
    lines.push(`### ${heading}`);
    for (const item of state.items.filter((i) => i.phase === phase)) {
      const box =
        item.status === "done"   ? "[x]" :
        item.status === "na"     ? "[x] [N/A]" :
        item.status === "failed" ? "[ ] ⚠️" :
        "[ ]";
      lines.push(`- ${box} ${item.label} (${item.agent})`);
    }
  }

  // Error log
  lines.push("");
  lines.push("## Error Log");
  if (state.errorLog.length === 0) {
    lines.push("[No errors recorded]");
  } else {
    for (const entry of state.errorLog) {
      lines.push(`### ${entry.timestamp} — ${entry.itemKey}`);
      lines.push(entry.message);
      lines.push("");
    }
  }

  lines.push("");
  lines.push("> ⚠️ This file is auto-generated by `npm run pipeline:status`. Do not edit manually.");
  lines.push("");
  writeFileSync(transPath(slug), lines.join("\n"), "utf-8");
}

function today() {
  return new Date().toISOString();
}

// ─── Exported Programmatic API ──────────────────────────────────────────────
// These functions throw on error instead of calling process.exit().
// They are used by the SDK orchestrator (scripts/orchestrator/src/state.ts).
// The cmd*() CLI wrappers below continue to use process.exit() for CLI usage.

// ─── POSIX Atomic Lock ──────────────────────────────────────────────────────
// Prevents TOCTOU race when parallel agents (e.g. backend-dev + frontend-dev)
// both call pipeline:complete at the same time. mkdirSync is guaranteed atomic
// by POSIX — only one process can create the directory; others get EEXIST.

function withLock(slug, fn) {
  const lockPath = statePath(slug) + ".lock";
  const pidFile = join(lockPath, "pid");
  let retries = 50; // Try for ~5 seconds
  while (retries > 0) {
    try {
      mkdirSync(lockPath); // Atomic POSIX operation
      writeFileSync(pidFile, process.pid.toString());
      try {
        return fn();
      } finally {
        rmSync(lockPath, { recursive: true, force: true });
      }
    } catch (err) {
      if (err.code === "EEXIST") {
        // Stale-lock detection: probe whether the holding process is alive
        let stale = false;
        try {
          const ownerPid = parseInt(readFileSync(pidFile, "utf8").trim(), 10);
          if (Number.isNaN(ownerPid)) {
            stale = true;
          } else {
            process.kill(ownerPid, 0); // Signal 0 = liveness probe
          }
        } catch (probeErr) {
          // ESRCH = no such process → stale lock; ENOENT = no PID file → stale lock
          if (probeErr.code === "ESRCH" || probeErr.code === "ENOENT") {
            stale = true;
          }
          // EPERM = process exists but we lack permission → not stale
        }
        if (stale) {
          rmSync(lockPath, { recursive: true, force: true });
          // Retry immediately — no backoff needed after stale lock cleanup
        } else {
          execSync("sleep 0.1"); // Synchronous 100ms backoff (live contention)
        }
        retries--;
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Timeout acquiring state lock for ${slug}`);
}

/**
 * Initialize pipeline state for a new feature.
 * Bootstraps the DAG from context.json (compiled by APM compiler) and persists
 * the full graph into _STATE.json so all subsequent operations are self-contained.
 * @param {string} slug - Feature slug
 * @param {string} workflowType - Workflow type (e.g. "Full-Stack", "Backend")
 * @param {string} [contextJsonPath] - Path to .apm/.compiled/context.json. If omitted, attempts to find it via APP_ROOT.
 * @returns {{ state: object, statePath: string, transPath: string }}
 * @throws {Error} if slug, workflowType missing, contextJsonPath invalid, or no workflow found
 */
export function initState(slug, workflowType, contextJsonPath) {
  if (!slug || !workflowType) {
    throw new Error("initState requires slug and workflowType");
  }

  // Resolve context.json path
  if (!contextJsonPath) {
    contextJsonPath = join(APP_ROOT, ".apm", ".compiled", "context.json");
  }
  if (!existsSync(contextJsonPath)) {
    throw new Error(`APM compiled context not found: ${contextJsonPath}. Run the APM compiler first.`);
  }

  const context = JSON.parse(readFileSync(contextJsonPath, "utf-8"));
  const workflow = context.workflows?.default;
  if (!workflow || !workflow.nodes) {
    throw new Error(
      `No "default" workflow found in ${contextJsonPath}. ` +
      `Create .apm/workflows.yml with a "default" workflow and recompile.`,
    );
  }

  const { phases, nodes } = workflow;
  if (!phases || !Array.isArray(phases) || phases.length === 0) {
    throw new Error(`Workflow "default" has no phases array in ${contextJsonPath}.`);
  }

  // Build items array from workflow nodes (order: by phase, then alphabetical within phase)
  const phaseOrder = new Map(phases.map((p, i) => [p, i]));
  const nodeEntries = Object.entries(nodes);
  nodeEntries.sort(([aKey, aNode], [bKey, bNode]) => {
    const pa = phaseOrder.get(aNode.phase) ?? 999;
    const pb = phaseOrder.get(bNode.phase) ?? 999;
    if (pa !== pb) return pa - pb;
    return aKey.localeCompare(bKey);
  });

  // Build dependencies, nodeTypes, nodeCategories from workflow
  const dependencies = {};
  const nodeTypes = {};
  const nodeCategories = {};
  const jsonGated = {};
  for (const [key, node] of nodeEntries) {
    dependencies[key] = node.depends_on || [];
    nodeTypes[key] = node.type || "agent";
    nodeCategories[key] = node.category;
    jsonGated[key] = node.triage_json_gated ?? false;
  }

  // Compute N/A keys from run_if: if run_if is non-empty and workflowType is NOT in it, mark N/A
  const naByType = [];
  for (const [key, node] of nodeEntries) {
    if (node.run_if && node.run_if.length > 0 && !node.run_if.includes(workflowType)) {
      naByType.push(key);
    }
  }
  const naKeys = new Set(naByType);

  const items = nodeEntries.map(([key, node]) => ({
    key,
    label: key,
    agent: node.agent ?? null,
    phase: node.phase,
    status: naKeys.has(key) ? "na" : "pending",
    error: null,
  }));

  const state = {
    feature: slug,
    workflowType,
    started: today(),
    deployedUrl: null,
    implementationNotes: null,
    items,
    errorLog: [],
    // ── Dynamic graph (persisted in _STATE.json) ──────────────────────
    dependencies,
    phases,
    nodeTypes,
    nodeCategories,
    jsonGated,
    naByType,
  };

  writeState(slug, state);
  return { state, statePath: statePath(slug), transPath: transPath(slug) };
}

/**
 * Mark a pipeline item as completed.
 * @returns {object} Updated state
 * @throws {Error} if itemKey unknown or phase-gate violation
 */
export function completeItem(slug, itemKey) {
  if (!slug || !itemKey) {
    throw new Error("completeItem requires slug and itemKey");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    const item = state.items.find((i) => i.key === itemKey);
    if (!item) {
      throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    }

    if (item.status === "na") {
      return state; // N/A items are silently skipped
    }

    // Phase-gating check: ensure all prior phases are complete
    const itemPhases = state.phases || [...new Set(state.items.map((i) => i.phase))];
    const itemPhaseIndex = itemPhases.indexOf(item.phase);
    for (let pi = 0; pi < itemPhaseIndex; pi++) {
      const phase = itemPhases[pi];
      const incomplete = state.items.filter(
        (i) => i.phase === phase && i.status !== "done" && i.status !== "na"
      );
      if (incomplete.length > 0) {
        throw new Error(`Cannot complete "${itemKey}" — prior phase "${phase}" has incomplete items: ${incomplete.map((i) => i.key).join(", ")}`);
      }
    }

    item.status = "done";
    item.error = null;
    writeState(slug, state);
    return state;
  });
}

/**
 * Record a failure for a pipeline item.
 * @returns {{ state: object, failCount: number, halted: boolean }}
 * @throws {Error} if slug/itemKey missing or itemKey unknown
 */
export function failItem(slug, itemKey, message) {
  if (!slug || !itemKey) {
    throw new Error("failItem requires slug and itemKey");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    const item = state.items.find((i) => i.key === itemKey);
    if (!item) {
      throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    }

    item.status = "failed";
    item.error = message || "Unknown failure";

    state.errorLog.push({
      timestamp: new Date().toISOString(),
      itemKey,
      message: message || "Unknown failure",
    });

    const failCount = state.errorLog.filter((e) => e.itemKey === itemKey).length;
    writeState(slug, state);

    return { state, failCount, halted: failCount >= 10 };
  });
}

/**
 * Salvage pipeline state for a Draft PR after an unfixable ("blocked") error.
 * Marks the failed item + post-deploy tests + code-cleanup as "na", allowing
 * the DAG to resolve directly to docs-archived → publish-pr.
 *
 * @param {string} slug - Feature slug
 * @param {string} failedItemKey - The item that triggered the block (e.g. "poll-ci")
 * @returns {object} The updated pipeline state
 * @throws {Error} if slug or failedItemKey missing, or state file not found
 */
export function salvageForDraft(slug, failedItemKey) {
  if (!slug || !failedItemKey) {
    throw new Error("salvageForDraft requires slug and failedItemKey");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  // Idempotency guard — prevent duplicate salvage entries in parallel scenarios
  if (state.errorLog.some(e => e.itemKey === "salvage-draft")) {
    return state;
  }

  // Cascade: mark the failed item + all transitive downstream dependents as na
  const skipKeys = new Set(getDownstream(state, [failedItemKey]));
  // Force the docs+PR finalization pair to pending for draft PR creation.
  // These are the minimum path: docs-archived writes the summary, publish-pr creates the PR.
  // Other finalize nodes (code-cleanup, doc-architect) get na'd since their work is inapplicable
  // in degraded mode. publish-pr still runs because na'd deps count as resolved.
  const forcePendingKeys = new Set(["docs-archived", "publish-pr"]);
  const skippedKeys = [];
  for (const item of state.items) {
    if (forcePendingKeys.has(item.key)) {
      // Finalization nodes always stay pending (for draft PR creation)
      item.status = "pending";
      item.error = null;
    } else if ((skipKeys.has(item.key) || item.key === failedItemKey) && item.status !== "done") {
      item.status = "na";
      skippedKeys.push(item.key);
    }
  }

  state.errorLog.push({
    timestamp: new Date().toISOString(),
    itemKey: "salvage-draft",
    message: `Graceful degradation: ${failedItemKey} triggered salvage, skipped ${skippedKeys.join(", ")} for Draft PR.`,
  });

  writeState(slug, state);
  return state;
  }); // end withLock
}

/**
 * Resume the pipeline after a successful elevated infrastructure apply.
 * Undoes salvageForDraft by resetting salvaged items back to pending,
 * and resets poll-ci to pending so standard CI re-verifies the full stack.
 *
 * Only resets items to "pending" if they were set to "na" by salvageForDraft
 * (not if they are "na" from the workflow type's NA_ITEMS_BY_TYPE).
 *
 * Sets state.elevatedApply = true for audit trail.
 *
 * @param {string} slug - Feature slug
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug missing or state file not found
 */
export function resumeAfterElevated(slug) {
  if (!slug) {
    throw new Error("resumeAfterElevated requires slug");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "resume-elevated").length;
  if (cycleCount >= 5) {
    return { state, cycleCount, halted: true };
  }

  const naByType = new Set(state.naByType || []);
  // Reset all items that are "na" due to salvageForDraft (not due to workflow type)
  // plus deploy items that need a fresh push + poll cycle
  const forceResetKeys = new Set(
    state.items
      .filter((i) => (state.nodeTypes || {})[i.key] === "script" && i.phase === "deploy")
      .map((i) => i.key),
  );
  let resetCount = 0;

  for (const item of state.items) {
    // Reset deploy items to pending so a fresh push + poll cycle re-verifies CI
    if (forceResetKeys.has(item.key) && item.status !== "na") {
      item.status = "pending";
      item.error = null;
      resetCount++;
      continue;
    }

    // Reset salvaged items — only if "na" was set by salvageForDraft, not by workflow type
    if (item.status === "na" && !naByType.has(item.key)) {
      item.status = "pending";
      item.error = null;
      resetCount++;
    }
  }

  state.elevatedApply = true;

  state.errorLog.push({
    timestamp: new Date().toISOString(),
    itemKey: "resume-elevated",
    message: `Elevated apply resume cycle ${cycleCount + 1}/5. Reset ${resetCount} items to pending for standard CI re-verification.`,
  });

  writeState(slug, state);
  return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/**
 * Recover pipeline after a failed elevated infrastructure apply.
 * Fails poll-ci with the error, then resets backend-dev + push-code + poll-ci
 * so the infra-expert agent can diagnose the error and fix the Terraform code.
 *
 * @param {string} slug - Feature slug
 * @param {string} errorMessage - Terraform error output
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug missing or state file not found
 */
export function recoverElevated(slug, errorMessage) {
  if (!slug) {
    throw new Error("recoverElevated requires slug");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);

    // Derive infra CI observer: last script-type node in the infra phase
    const infraPollKey = state.items
      .filter((i) => i.phase === "infra" && (state.nodeTypes || {})[i.key] === "script")
      .at(-1)?.key;
    // Derive infra entry point: first dev-category node in the infra phase
    const infraDevKey = state.items
      .find((i) => i.phase === "infra" && (state.nodeCategories || {})[i.key] === "dev")?.key;

    // Step 1: Record the failure on the infra CI observer (inlined from failItem)
    if (infraPollKey) {
      const item = state.items.find((i) => i.key === infraPollKey);
      if (item) {
        item.status = "failed";
        item.error = `Elevated apply failed: ${errorMessage}`;
        state.errorLog.push({
          timestamp: new Date().toISOString(),
          itemKey: infraPollKey,
          message: `Elevated apply failed: ${errorMessage}`,
        });
      }
    }
    const pollLogKey = infraPollKey || "poll-infra-plan";
    const failCount = state.errorLog.filter((e) => e.itemKey === pollLogKey).length;
    if (failCount >= 10) {
      writeState(slug, state);
      return { state, failCount, halted: true };
    }

    // Step 2: Reset infra dev items for redevelopment cycle (inlined from resetForDev)
    const cycleCount = state.errorLog.filter((e) => e.itemKey === "reset-for-dev").length;
    if (cycleCount >= 5) {
      writeState(slug, state);
      return { state, cycleCount, halted: true };
    }

    const reason = `Elevated infra apply failed — agent will diagnose and fix TF code. Error: ${errorMessage.slice(0, 200)}`;
    // Reset infra dev entry + all downstream dependents
    const resetSeed = infraDevKey || "infra-architect";
    const keysToReset = new Set(getDownstream(state, [resetSeed]));
    let resetCount = 0;
    for (const it of state.items) {
      if (keysToReset.has(it.key) && it.status !== "na") {
        it.status = "pending";
        it.error = null;
        resetCount++;
      }
    }
    state.errorLog.push({
      timestamp: new Date().toISOString(),
      itemKey: "reset-for-dev",
      message: `Redevelopment cycle ${cycleCount + 1}/5: ${reason}. Reset ${resetCount} items: ${[...keysToReset].join(", ")}`,
    });

    writeState(slug, state);
    return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/**
 * Reset push-app + poll-app-ci for a re-push cycle (application wave).
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug missing or state file not found
 */
export function resetScripts(slug, phase) {
  if (!slug || !phase) {
    throw new Error("resetScripts requires slug and phase");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const logKey = `reset-scripts:${phase}`;
  const cycleCount = state.errorLog.filter((e) => e.itemKey === logKey).length;
  if (cycleCount >= 10) {
    return { state, cycleCount, halted: true };
  }

  // Derive script nodes in the specified phase from the persisted graph
  const resetKeys = new Set(
    state.items
      .filter((i) => (state.nodeTypes || {})[i.key] === "script" && i.phase === phase)
      .map((i) => i.key)
  );
  let resetCount = 0;
  for (const item of state.items) {
    if (resetKeys.has(item.key) && item.status !== "na") {
      item.status = "pending";
      item.error = null;
      resetCount++;
    }
  }

  state.errorLog.push({
    timestamp: new Date().toISOString(),
    itemKey: logKey,
    message: `Script re-push cycle for phase "${phase}" (cycle ${cycleCount + 1}/10). Reset ${resetCount} items: ${[...resetKeys].join(", ")}`,
  });

  writeState(slug, state);
  return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/**
 * Reset deploy + post-deploy items for a re-deployment cycle.
 * Called when triage classifies the failure as `deployment-stale` — the code
 * on the branch is correct but the deployed artifact is outdated.
 *
 * Unlike `resetForDev()`, this does NOT increment the redevelopment cycle
 * counter. It tracks its own budget via `reset-for-redeploy` error log entries
 * (max 3 cycles).
 *
 * @param {string} slug - Feature slug
 * @param {string[]} itemKeys - Item keys to reset (deploy + post-deploy items)
 * @param {string} reason - Human-readable reason for the re-deploy
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug missing or no itemKeys provided
 */
export function resetForRedeploy(slug, itemKeys, reason, maxCycles = 3) {
  if (!slug || !itemKeys?.length) {
    throw new Error("resetForRedeploy requires slug and at least one itemKey");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "reset-for-redeploy").length;
  if (cycleCount >= maxCycles) {
    return { state, cycleCount, halted: true };
  }

  const keysToReset = new Set(itemKeys);

  // Cascade: also reset post-deploy items that depend on deploy items.
  // When WYSIWYG fault_routing omits "$SELF" (e.g. deployment-stale routes),
  // the triggering post-deploy item has status "failed" (set by failItem before
  // this function runs). Include both "done" and "failed" post-deploy items so
  // the full test suite re-runs after the fresh deployment.
  // SURGICAL: if the caller already specified specific post-deploy items (e.g.,
  // via "$SELF" in fault_routing), do NOT blanket-reset — this preserves
  // already-passed tests in the unaffected domain.
  const callerSpecifiedPostDeploy = [...keysToReset].some(k => (state.nodeCategories || {})[k] === "test");
  const hasDeployReset = [...keysToReset].some(k => (state.nodeTypes || {})[k] === "script");
  if (hasDeployReset && !callerSpecifiedPostDeploy) {
    // No specific post-deploy item targeted — cascade to all done/failed post-deploy items
    for (const item of state.items) {
      if (item.phase === "post-deploy" && (item.status === "done" || item.status === "failed")) {
        keysToReset.add(item.key);
      }
    }
  }

  let resetCount = 0;
  for (const item of state.items) {
    if (keysToReset.has(item.key) && item.status !== "na") {
      item.status = "pending";
      item.error = null;
      resetCount++;
    }
  }

  state.errorLog.push({
    timestamp: new Date().toISOString(),
    itemKey: "reset-for-redeploy",
    message: `Re-deployment cycle ${cycleCount + 1}/${maxCycles}: ${reason}. Reset ${resetCount} items: ${[...keysToReset].join(", ")}`,
  });

  writeState(slug, state);
  return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/**
 * Reset specified items back to pending for a redevelopment cycle.
 * Used when post-deploy validation (live-ui, integration-test) fails and
 * the root cause requires changes in dev items (backend, frontend, infra).
 *
 * @param {string} slug - Feature slug
 * @param {string[]} itemKeys - Item keys to reset (e.g. ["backend-dev", "frontend-dev", ...])
 * @param {string} reason - Human-readable reason for the reroute
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug missing or no itemKeys provided
 */
export function resetForDev(slug, itemKeys, reason, maxCycles = 5) {
  if (!slug || !itemKeys?.length) {
    throw new Error("resetForDev requires slug and at least one itemKey");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "reset-for-dev").length;
  if (cycleCount >= maxCycles) {
    return { state, cycleCount, halted: true };
  }

  // Include the specified items + all downstream dependents so the fix gets redeployed.
  const keysToReset = new Set(getDownstream(state, itemKeys));

  // Also reset any "done" post-deploy items when deploy items are being reset
  // (prevents stale test results while push-app is pending)
  const hasDeployReset = [...keysToReset].some(k => (state.nodeTypes || {})[k] === "script");
  if (hasDeployReset) {
    for (const item of state.items) {
      if (item.phase === "post-deploy" && item.status === "done") {
        keysToReset.add(item.key);
      }
    }
  }

  let resetCount = 0;
  for (const item of state.items) {
    if (keysToReset.has(item.key) && item.status !== "na") {
      item.status = "pending";
      item.error = null;
      resetCount++;
    }
  }

  state.errorLog.push({
    timestamp: new Date().toISOString(),
    itemKey: "reset-for-dev",
    message: `Redevelopment cycle ${cycleCount + 1}/${maxCycles}: ${reason}. Reset ${resetCount} items: ${[...keysToReset].join(", ")}`,
  });

  writeState(slug, state);
  return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/**
 * Reset all nodes in the specified phases back to pending.
 * Generalized replacement for the former `redevelopInfra` which was hardcoded
 * to reset ["infra", "approval"] phases. Now accepts any comma-separated
 * phase list.
 *
 * @param {string} slug - Feature slug
 * @param {string} phasesCsv - Comma-separated phase names (e.g. "infra,approval")
 * @param {string} reason - Human-readable reason for the rollback
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug, phases, or reason missing, or state file not found
 */
export function resetPhases(slug, phasesCsv, reason, maxCycles = 5) {
  if (!slug || !phasesCsv || !reason) {
    throw new Error("resetPhases requires slug, phasesCsv, and reason");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "reset-phases").length;
  if (cycleCount >= maxCycles) {
    return { state, cycleCount, halted: true };
  }

  // Parse phase list from CSV
  const targetPhases = new Set(phasesCsv.split(",").map((p) => p.trim()).filter(Boolean));
  const resetItemKeys = new Set(
    state.items.filter((i) => targetPhases.has(i.phase)).map((i) => i.key),
  );
  let resetCount = 0;
  for (const item of state.items) {
    if (resetItemKeys.has(item.key) && item.status !== "na") {
      item.status = "pending";
      item.error = null;
      resetCount++;
    }
  }

  state.errorLog.push({
    timestamp: new Date().toISOString(),
    itemKey: "reset-phases",
    message: `Phase reset cycle ${cycleCount + 1}/${maxCycles} for [${phasesCsv}]: ${reason}. Reset ${resetCount} items: ${[...resetItemKeys].join(", ")}`,
  });

  writeState(slug, state);
  return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/**
 * @returns {object} The state object
 * @throws {Error} if slug missing or state file not found
 */
export function getStatus(slug) {
  if (!slug) {
    throw new Error("getStatus requires slug");
  }
  return readStateOrThrow(slug);
}

/**
 * Get the next actionable item.
 * @returns {{ key: string|null, label: string, agent: string|null, phase: string|null, status: string }}
 * @throws {Error} if slug missing or state file not found
 */
export function getNext(slug) {
  if (!slug) {
    throw new Error("getNext requires slug");
  }

  const state = readStateOrThrow(slug);

  const phases = state.phases || [...new Set(state.items.map((i) => i.phase))];
  for (const phase of phases) {
    const phaseItems = state.items.filter((i) => i.phase === phase);
    const incomplete = phaseItems.filter((i) => i.status !== "done" && i.status !== "na");

    if (incomplete.length > 0) {
      const next = incomplete[0];
      return { key: next.key, label: next.label, agent: next.agent, phase: next.phase, status: next.status };
    }
  }

  return { key: null, label: "Pipeline complete", agent: null, phase: null, status: "complete" };
}

/**
 * Get ALL currently runnable items (items whose DAG dependencies are all done/na).
 * Returns an array of items that can execute in parallel.
 * @returns {Array<{key: string|null, label: string, agent: string|null, phase: string|null, status: string}>}
 * @throws {Error} if slug missing or state file not found
 */
export function getNextAvailable(slug) {
  if (!slug) {
    throw new Error("getNextAvailable requires slug");
  }

  const state = readStateOrThrow(slug);

  const statusMap = new Map(state.items.map((i) => [i.key, i.status]));
  const available = [];

  for (const item of state.items) {
    if (item.status !== "pending" && item.status !== "failed") continue;

    const deps = (state.dependencies || {})[item.key] || [];
    const depsResolved = deps.every((depKey) => {
      const depStatus = statusMap.get(depKey);
      return depStatus === "done" || depStatus === "na";
    });

    if (depsResolved) {
      available.push({
        key: item.key,
        label: item.label,
        agent: item.agent,
        phase: item.phase,
        status: item.status,
      });
    }
  }

  if (available.length === 0) {
    const allDone = state.items.every((i) => i.status === "done" || i.status === "na");
    if (allDone) {
      return [{ key: null, label: "Pipeline complete", agent: null, phase: null, status: "complete" }];
    }
    // Pending items exist but none are runnable — blocked by unresolved failures
    return [{ key: null, label: "Pipeline blocked", agent: null, phase: null, status: "blocked" }];
  }

  return available;
}

/**
 * Append an implementation note.
 * @returns {object} Updated state
 * @throws {Error} if slug or note missing
 */
export function setNote(slug, note) {
  if (!slug || !note) {
    throw new Error("setNote requires slug and note");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    state.implementationNotes = state.implementationNotes
      ? state.implementationNotes + "\n\n" + note
      : note;
    writeState(slug, state);
    return state;
  });
}

/**
 * Set a documentation note on a specific pipeline item.
 * Dev agents call this before pipeline:complete to pass architectural context
 * to the docs-expert agent ("Pass the Baton" pattern).
 * @param {string} slug - Feature slug
 * @param {string} itemKey - Pipeline item key (e.g. "backend-dev")
 * @param {string} note - 1-2 sentence summary of architectural changes
 * @returns {object} Updated state
 * @throws {Error} if slug, itemKey, or note missing
 */
export function setDocNote(slug, itemKey, note) {
  if (!slug || !itemKey || !note) {
    throw new Error("setDocNote requires slug, itemKey, and note");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    const item = state.items.find((i) => i.key === itemKey);
    if (!item) {
      throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    }

    item.docNote = note;
    writeState(slug, state);
    return state;
  });
}

/**
 * Set the deployed URL.
 * @returns {object} Updated state
 * @throws {Error} if slug or url missing
 */
export function setUrl(slug, url) {
  if (!slug || !url) {
    throw new Error("setUrl requires slug and url");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    state.deployedUrl = url;
    writeState(slug, state);
    return state;
  });
}

// ─── Commands (CLI wrappers) ────────────────────────────────────────────────
// These delegate to the exported API functions above, converting errors to
// console.error + process.exit for CLI usage.

function cmdInit(slug, workflowType) {
  if (!slug || !workflowType) {
    console.error("Usage: pipeline-state.mjs init <slug> <workflow-type>");
    console.error("  workflow-type: Any type defined in workflows.yml run_if arrays");
    process.exit(1);
  }

  try {
    const result = initState(slug, workflowType);  // contextJsonPath will be derived from APP_ROOT
    console.log(`✔ Initialized pipeline state for "${slug}" (${workflowType})`);
    console.log(`  State: ${result.statePath}`);
    console.log(`  TRANS:  ${result.transPath}`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdComplete(slug, itemKey) {
  if (!slug || !itemKey) {
    console.error("Usage: pipeline-state.mjs complete <slug> <item-key>");
    process.exit(1);
  }

  // Check for N/A before delegating (special console message)
  const state = readState(slug);
  const item = state.items.find((i) => i.key === itemKey);
  if (!item) {
    console.error(`ERROR: Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    process.exit(1);
  }
  if (item.status === "na") {
    console.log(`⏭  Item "${itemKey}" is marked N/A — skipping.`);
    return;
  }

  try {
    completeItem(slug, itemKey);
    console.log(`✔ Marked "${itemKey}" as done.`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

/** Post-deploy items whose failure messages must be valid TriageDiagnostic JSON.
 *  Derived from persisted triage_json_gated flags in state (set during initState from workflow YAML). */
function getZodGatedKeys(state) {
  const gated = new Set();
  for (const item of state.items) {
    if (state.jsonGated?.[item.key]) {
      gated.add(item.key);
    }
  }
  return gated;
}

function cmdFail(slug, itemKey, message) {
  if (!slug || !itemKey) {
    console.error("Usage: pipeline-state.mjs fail <slug> <item-key> <message>");
    process.exit(1);
  }

  // ── Zod gate: post-deploy & test items must supply valid TriageDiagnostic JSON ──
  const state = readState(slug);
  const zodGated = getZodGatedKeys(state);
  if (zodGated.has(itemKey)) {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      console.error(`ERROR: Item "${itemKey}" requires a valid JSON failure message for triage routing.`);
      console.error(`Expected: {"fault_domain": "backend"|"frontend"|"both"|"environment", "diagnostic_trace": "<details>"}`);
      console.error(`Received: ${message}`);
      process.exit(1);
    }
    const result = TriageDiagnosticSchema.safeParse(parsed);
    if (!result.success) {
      console.error(`ERROR: Item "${itemKey}" failure message failed schema validation.`);
      console.error(`Expected: {"fault_domain": "backend"|"frontend"|"both"|"environment", "diagnostic_trace": "<details>"}`);
      console.error(`Validation errors: ${JSON.stringify(result.error.issues)}`);
      console.error(`Received: ${message}`);
      process.exit(1);
    }
  }

  try {
    const { failCount, halted } = failItem(slug, itemKey, message);
    if (halted) {
      console.error(`⛔ PIPELINE HALTED — "${itemKey}" has failed ${failCount} times. Requires human intervention.`);
      process.exit(2);  // Exit code 2 = halted
    } else {
      console.log(`⚠️  Recorded failure for "${itemKey}" (attempt ${failCount}/10).`);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdResetScripts(slug, phase) {
  if (!slug || !phase) {
    console.error("Usage: pipeline-state.mjs reset-scripts <slug> <phase>");
    process.exit(1);
  }

  try {
    const { cycleCount, halted } = resetScripts(slug, phase);
    if (halted) {
      console.error(`⛔ PIPELINE HALTED — "${slug}" has used ${cycleCount} re-push cycles for phase "${phase}". Requires human intervention.`);
      process.exit(2);  // Exit code 2 = halted
    } else {
      console.log(`🔄 Reset script items in phase "${phase}" for re-push cycle (${cycleCount}/10).`);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdResetPhases(slug, phasesCsv, reason) {
  if (!slug || !phasesCsv || !reason) {
    console.error("Usage: pipeline-state.mjs reset-phases <slug> <phases-csv> <reason>");
    process.exit(1);
  }

  try {
    const { cycleCount, halted } = resetPhases(slug, phasesCsv, reason);
    if (halted) {
      console.error(`⛔ PIPELINE HALTED — "${slug}" has used ${cycleCount} phase reset cycles. Requires human intervention.`);
      process.exit(2);
    } else {
      console.log(`🔄 Phase reset triggered for [${phasesCsv}] (cycle ${cycleCount}/5). Items reset to pending.`);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdResume(slug) {
  if (!slug) {
    console.error("Usage: pipeline-state.mjs resume <slug>");
    process.exit(1);
  }

  try {
    const { cycleCount, halted } = resumeAfterElevated(slug);
    if (halted) {
      console.error(`⛔ PIPELINE HALTED — "${slug}" has used ${cycleCount} elevated resume cycles. Requires human intervention.`);
      process.exit(2);
    } else {
      console.log(`🔄 Resumed pipeline after elevated apply (cycle ${cycleCount}/5). Standard CI will re-verify.`);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdRecoverElevated(slug, errorMessage) {
  if (!slug || !errorMessage) {
    console.error("Usage: pipeline-state.mjs recover-elevated <slug> <error-message>");
    process.exit(1);
  }

  try {
    const { cycleCount, halted } = recoverElevated(slug, errorMessage);
    if (halted) {
      console.error(`⛔ PIPELINE HALTED — "${slug}" has exhausted recovery cycles. Requires human intervention.`);
      process.exit(2);
    } else {
      console.log(`🔄 Recovery initiated after elevated apply failure (redevelopment cycle ${cycleCount}/5). Agent will diagnose and fix.`);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdStatus(slug) {
  if (!slug) {
    console.error("Usage: pipeline-state.mjs status <slug>");
    process.exit(1);
  }

  try {
    const state = getStatus(slug);
    console.log(JSON.stringify(state, null, 2));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdNext(slug) {
  if (!slug) {
    console.error("Usage: pipeline-state.mjs next <slug>");
    process.exit(1);
  }

  try {
    const next = getNext(slug);
    console.log(JSON.stringify(next));
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdSetNote(slug, note) {
  if (!slug || !note) {
    console.error("Usage: pipeline-state.mjs set-note <slug> <note>");
    process.exit(1);
  }

  try {
    setNote(slug, note);
    console.log(`✔ Added implementation note.`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdSetDocNote(slug, itemKey, note) {
  if (!slug || !itemKey || !note) {
    console.error("Usage: pipeline-state.mjs doc-note <slug> <item-key> <note>");
    process.exit(1);
  }

  try {
    setDocNote(slug, itemKey, note);
    console.log(`✔ Added doc note for "${itemKey}".`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdSetUrl(slug, url) {
  if (!slug || !url) {
    console.error("Usage: pipeline-state.mjs set-url <slug> <url>");
    process.exit(1);
  }

  try {
    setUrl(slug, url);
    console.log(`✔ Set deployed URL to: ${url}`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

// ─── CLI Router ─────────────────────────────────────────────────────────────
// Only run when executed directly (not when imported as a module by the orchestrator).

const __isCLI = process.argv[1]?.endsWith("pipeline-state.mjs");

if (__isCLI) {
const [,, command, ...args] = process.argv;

switch (command) {
  case "init":
    cmdInit(args[0], args[1]);
    break;
  case "complete":
    cmdComplete(args[0], args[1]);
    break;
  case "fail":
    cmdFail(args[0], args[1], args.slice(2).join(" "));
    break;
  case "reset-scripts":
    cmdResetScripts(args[0], args[1]);
    break;
  case "reset-phases":
    cmdResetPhases(args[0], args[1], args.slice(2).join(" "));
    break;
  // ── Deprecation shims ──────────────────────────────────────────────
  case "reset-ci":
    console.warn("⚠ Deprecated: use 'reset-scripts <slug> deploy' instead of 'reset-ci'");
    cmdResetScripts(args[0], "deploy");
    break;
  case "reset-infra-plan":
    console.warn("⚠ Deprecated: use 'reset-scripts <slug> infra' instead of 'reset-infra-plan'");
    cmdResetScripts(args[0], "infra");
    break;
  case "reset-infra-ci":
    console.warn("⚠ Deprecated: use 'reset-scripts <slug> infra' instead of 'reset-infra-ci'");
    cmdResetScripts(args[0], "infra");
    break;
  case "redevelop-infra":
    console.warn("⚠ Deprecated: use 'reset-phases <slug> infra,approval <reason>' instead of 'redevelop-infra'");
    cmdResetPhases(args[0], "infra,approval", args.slice(1).join(" "));
    break;
  case "resume":
    cmdResume(args[0]);
    break;
  case "recover-elevated":
    cmdRecoverElevated(args[0], args.slice(1).join(" "));
    break;
  case "status":
    cmdStatus(args[0]);
    break;
  case "next":
    cmdNext(args[0]);
    break;
  case "set-note":
    cmdSetNote(args[0], args.slice(1).join(" "));
    break;
  case "doc-note":
    cmdSetDocNote(args[0], args[1], args.slice(2).join(" "));
    break;
  case "set-url":
    cmdSetUrl(args[0], args.slice(1).join(" "));
    break;
  default:
    console.error(`Unknown command: ${command || "(none)"}`);
    console.error("");
    console.error("Usage: pipeline-state.mjs <command> <args>");
    console.error("");
    console.error("Commands:");
    console.error("  init         <slug> <type>               — Initialize pipeline state");
    console.error("  complete     <slug> <item-key>           — Mark item as done");
    console.error("  fail         <slug> <item-key> <message> — Record a failure");
    console.error("  reset-scripts    <slug> <phase>                — Reset script-type nodes in the given phase for re-push");
    console.error("  reset-phases     <slug> <phases-csv> <reason>  — Reset all nodes in the given phases for redevelopment");
    console.error("  resume            <slug>                      — Resume pipeline after elevated apply");
    console.error("  recover-elevated  <slug> <error-message>      — Recover pipeline after failed elevated apply");
    console.error("  status            <slug>                      — Print state JSON");
    console.error("  next              <slug>                      — Print next actionable item");
    console.error("  set-note          <slug> <note>               — Append implementation note");
    console.error("  doc-note          <slug> <item-key> <note>    — Set doc note on a pipeline item");
    console.error("  set-url           <slug> <url>                — Set deployed URL");
    console.error("");
    console.error("Item keys: schema-dev, infra-architect, push-infra, create-draft-pr, poll-infra-plan,");
    console.error("           await-infra-approval, infra-handoff,");
    console.error("           backend-dev, frontend-dev, backend-unit-test, frontend-unit-test,");
    console.error("           push-app, poll-app-ci, integration-test, live-ui,");
    console.error("           code-cleanup, docs-archived, publish-pr");
    console.error("");
    console.error("Workflow types: Backend, Frontend, Full-Stack, Infra");
    process.exit(1);
}
} // end if (__isCLI)
