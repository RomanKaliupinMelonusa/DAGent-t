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
 *   reset-scripts     <slug> <category>            — Reset script-type nodes in the given category for re-push
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
import { createHash } from "node:crypto";

// ─── Error Signature (inline — no TS dependency) ────────────────────────────
// Produces a stable fingerprint from a raw error message by stripping volatile
// tokens (timestamps, PIDs, ports, hex hashes, paths). Enables cross-cycle
// identity tracking: two errors with the same root cause produce the same hash.
// Keep in sync with VOLATILE_PATTERNS in src/triage/error-fingerprint.ts.
// Only universal (stack-agnostic) patterns here — framework-specific
// normalization belongs in APM triage packs.
const VOLATILE_RE = [
  [/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, "<TS>"],
  [/\b\d{13}\b/g, "<EPOCH>"],
  [/\bpid[=:]\d+/gi, "pid=<PID>"],
  [/:\d{4,5}\b/g, ":<PORT>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<UUID>"],
  [/\b[0-9a-f]{8,40}\b/gi, "<HEX>"],
  [/(?:\/[\w@.+-]+){2,}(?:\/[^\s'")]*)?/g, "<PATH>"],
  [new RegExp("[A-Z]:\\\\[^\\s'\")]+", "g"), "<PATH>"],
  [/\b(?:worker|runner)[-_]\d+\b/gi, "<RUNNER>"],
  [/:\d+:\d+/g, ":<L>:<C>"],
];
export function computeErrorSignature(msg) {
  let n = msg;
  for (const [re, repl] of VOLATILE_RE) n = n.replace(re, repl);
  n = n.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(n).digest("hex").slice(0, 16);
}

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

/**
 * Cascade barrier nodes into a reset set.
 * Barrier nodes (type "barrier") are pure sync points with no real work.
 * When ANY of a barrier's dependencies is being reset, the barrier must also
 * reset — its "done" status is no longer valid. This is recursive: if
 * cascading a barrier causes another barrier's dep to be in the set, that
 * barrier cascades too.
 *
 * @param {object} state - Pipeline state (needs dependencies, nodeTypes)
 * @param {Set<string>} keysToReset - Mutable set; barrier keys are added in-place
 * @returns {Set<string>} The same set, expanded with cascaded barrier keys
 */
export function cascadeBarriers(state, keysToReset) {
  const nodeTypes = state.nodeTypes || {};
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, deps] of Object.entries(state.dependencies)) {
      if (nodeTypes[key] !== "barrier") continue;
      if (keysToReset.has(key)) continue;
      if (deps.some(dep => keysToReset.has(dep))) {
        keysToReset.add(key);
        changed = true;
      }
    }
  }
  return keysToReset;
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
  const state = JSON.parse(readFileSync(p, "utf-8"));
  // Backward compat: alias workflowType → workflowName for in-flight state files
  if (state.workflowType && !state.workflowName) {
    state.workflowName = state.workflowType;
  }
  return state;
}

/** Like readState but throws instead of calling process.exit — for programmatic API use. */
function readStateOrThrow(slug) {
  const p = statePath(slug);
  if (!existsSync(p)) {
    throw new Error(`State file not found: ${p}`);
  }
  const state = JSON.parse(readFileSync(p, "utf-8"));
  // Backward compat: alias workflowType → workflowName for in-flight state files
  if (state.workflowType && !state.workflowName) {
    state.workflowName = state.workflowType;
  }
  return state;
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
  lines.push(`- **Workflow:** ${state.workflowName}`);
  lines.push(`- **Started:** ${state.started}`);
  lines.push(`- **Deployed URL:** ${state.deployedUrl || "[To be filled after deployment]"}`);  lines.push("");
  lines.push("## Implementation Notes");
  lines.push(state.implementationNotes || "[To be filled by Dev agents during implementation]");
  lines.push("");
  lines.push("## Checklist");

  for (const item of state.items) {
    const box =
      item.status === "done"    ? "[x]" :
      item.status === "na"      ? "[x] [N/A]" :
      item.status === "failed"  ? "[ ] ⚠️" :
      item.status === "dormant" ? "[ ] 💤" :
      "[ ]";
    lines.push(`- ${box} ${item.label} (${item.agent})`);
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
          // ESRCH = no such process → stale lock (safe to reclaim)
          if (probeErr.code === "ESRCH") {
            stale = true;
          }
          // ENOENT = PID file not yet written → another process just acquired
          // the lock between mkdirSync and writeFileSync. NOT stale — back off.
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
 * @param {string} workflowName - Workflow name (e.g. "full-stack", "backend")
 * @param {string} [contextJsonPath] - Path to .apm/.compiled/context.json. If omitted, attempts to find it via APP_ROOT.
 * @returns {{ state: object, statePath: string, transPath: string }}
 * @throws {Error} if slug, workflowName missing, contextJsonPath invalid, or no workflow found
 */
export function initState(slug, workflowName, contextJsonPath) {
  if (!slug || !workflowName) {
    throw new Error("initState requires slug and workflowName");
  }

  // Resolve context.json path
  if (!contextJsonPath) {
    contextJsonPath = join(APP_ROOT, ".apm", ".compiled", "context.json");
  }
  if (!existsSync(contextJsonPath)) {
    // Auto-compile APM context if missing (same as loadApmContext in the orchestrator)
    const apmYml = join(APP_ROOT, ".apm", "apm.yml");
    if (!existsSync(apmYml)) {
      throw new Error(
        `No APM manifest found at ${apmYml}. Each app must have .apm/apm.yml.`
      );
    }
    console.log("ℹ  APM compiled context not found — compiling automatically…");
    try {
      const compilerScript = `import{compileApm}from"./src/apm-compiler.ts";compileApm(${JSON.stringify(APP_ROOT)});`;
      execSync(`npx tsx -e '${compilerScript}'`, {
        cwd: __dirname,
        stdio: "inherit",
        timeout: 60_000,
      });
    } catch (err) {
      throw new Error(
        `APM auto-compilation failed: ${err.message}\n` +
        `You can compile manually: cd tools/autonomous-factory && npx tsx -e 'import{compileApm}from"./src/apm-compiler.ts";compileApm("${APP_ROOT}");'`
      );
    }
    if (!existsSync(contextJsonPath)) {
      throw new Error(`APM compiled context still not found after auto-compilation: ${contextJsonPath}`);
    }
  }

  const context = JSON.parse(readFileSync(contextJsonPath, "utf-8"));
  const availableWorkflows = Object.keys(context.workflows ?? {});
  const workflow = context.workflows?.[workflowName];
  if (!workflow || !workflow.nodes) {
    throw new Error(
      `No workflow "${workflowName}" found in ${contextJsonPath}. ` +
      `Available workflows: ${availableWorkflows.join(", ") || "(none)"}. ` +
      `Check .apm/workflows.yml and recompile.`,
    );
  }

  const { nodes } = workflow;

  // Topological sort — items ordered by DAG dependency (execution order)
  const visited = new Set();
  const stack = new Set();
  const topoOrder = [];
  function visit(key) {
    if (stack.has(key)) throw new Error(`Cycle detected in DAG involving node "${key}"`);
    if (visited.has(key)) return;
    stack.add(key);
    for (const dep of nodes[key]?.depends_on ?? []) visit(dep);
    stack.delete(key);
    visited.add(key);
    topoOrder.push(key);
  }
  for (const key of Object.keys(nodes)) visit(key);

  const nodeEntries = topoOrder.map((key) => [key, nodes[key]]);

  // Build dependencies, nodeTypes, nodeCategories from workflow
  const dependencies = {};
  const nodeTypes = {};
  const nodeCategories = {};
  const salvageSurvivors = [];
  for (const [key, node] of nodeEntries) {
    dependencies[key] = node.depends_on || [];
    nodeTypes[key] = node.type || "agent";
    nodeCategories[key] = node.category;
    if (node.salvage_survivor) salvageSurvivors.push(key);
  }

  // All nodes in a named workflow are active (no run_if filtering)
  const naByType = [];

  // Nodes with `activation: "triage-only"` start as dormant — invisible to the
  // scheduler until explicitly activated by triage via resetNodes().
  // Triage nodes (type: "triage") also start dormant — they are dispatched
  // exclusively via the watchdog's triageActivation path, never by the scheduler.
  const dormantByActivation = [];
  for (const [key, node] of nodeEntries) {
    if (node.activation === "triage-only" || node.type === "triage") dormantByActivation.push(key);
  }

  const items = nodeEntries.map(([key, node]) => ({
    key,
    label: key,
    agent: node.agent ?? null,
    status: (node.activation === "triage-only" || node.type === "triage") ? "dormant" : "pending",
    error: null,
  }));

  const state = {
    feature: slug,
    workflowName,
    started: today(),
    deployedUrl: null,
    implementationNotes: null,
    items,
    errorLog: [],
    // ── Dynamic graph (persisted in _STATE.json) ──────────────────────
    dependencies,
    nodeTypes,
    nodeCategories,
    naByType,
    dormantByActivation,
    salvageSurvivors,
  };

  writeState(slug, state);
  return { state, statePath: statePath(slug), transPath: transPath(slug) };
}

/**
 * Mark a pipeline item as completed.
 * @returns {object} Updated state
 * @throws {Error} if itemKey unknown
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
export function failItem(slug, itemKey, message, maxFailures = 10) {
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
      errorSignature: message ? computeErrorSignature(message) : null,
    });

    const failCount = state.errorLog.filter((e) => e.itemKey === itemKey).length;
    writeState(slug, state);

    return { state, failCount, halted: failCount >= maxFailures };
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
  // Force salvage survivor nodes to pending for draft PR creation.
  // These are the minimum path for degraded mode.
  // If salvageSurvivors is not persisted (legacy state), fall back to finalize-category nodes.
  const nodeCategories = state.nodeCategories || {};
  const forcePendingKeys = new Set(
    (state.salvageSurvivors && state.salvageSurvivors.length > 0)
      ? state.salvageSurvivors
      : state.items.filter(i => nodeCategories[i.key] === "finalize").map(i => i.key)
  );
  const skippedKeys = [];
  for (const item of state.items) {
    if (forcePendingKeys.has(item.key)) {
      // Finalization nodes always stay pending (for draft PR creation)
      item.status = "pending";
      item.error = null;
    } else if (item.status === "dormant") {
      // Dormant nodes (triage-only activation) stay dormant during salvage —
      // they were never active in this pipeline run.
      continue;
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
export function resumeAfterElevated(slug, maxCycles = 5) {
  if (!slug) {
    throw new Error("resumeAfterElevated requires slug");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "resume-elevated").length;
  if (cycleCount >= maxCycles) {
    return { state, cycleCount, halted: true };
  }

  const naByType = new Set(state.naByType || []);
  // Reset all items that are "na" due to salvageForDraft (not due to workflow type)
  // plus deploy items that need a fresh push + poll cycle
  const forceResetKeys = new Set(
    state.items
      .filter((i) => (state.nodeTypes || {})[i.key] === "script" && (state.nodeCategories || {})[i.key] === "deploy")
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
    message: `Elevated apply resume cycle ${cycleCount + 1}/${maxCycles}. Reset ${resetCount} items to pending for standard CI re-verification.`,
  });

  writeState(slug, state);
  return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/**
 * Recover pipeline after a failed elevated infrastructure apply.
 * Records the failure on the infra CI observer, then delegates to resetNodes()
 * to cascade-reset from the infra dev entry point.
 *
 * CLI convenience — derives infra node keys from the DAG instead of requiring
 * the caller to know specific node keys.
 *
 * @param {string} slug - Feature slug
 * @param {string} errorMessage - Terraform error output
 * @param {number} maxFailCount - Max failures on the infra poll node before halt
 * @param {number} maxDevCycles - Max redevelopment cycles before halt
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug missing or state file not found
 */
export function recoverElevated(slug, errorMessage, maxFailCount = 10, maxDevCycles = 5) {
  if (!slug) {
    throw new Error("recoverElevated requires slug");
  }

  // Step 1: Record the failure on the infra CI observer via failItem
  const state = readStateOrThrow(slug);
  const cats = state.nodeCategories || {};
  const infraPollKey = state.items
    .filter((i) => cats[i.key] === "deploy" && (state.nodeTypes || {})[i.key] === "script" && i.key.includes("infra"))
    .at(-1)?.key;
  if (infraPollKey) {
    const failResult = failItem(slug, infraPollKey, `Elevated apply failed: ${errorMessage}`);
    const pollLogKey = infraPollKey;
    const failCount = failResult.state.errorLog.filter((e) => e.itemKey === pollLogKey).length;
    if (failCount >= maxFailCount) {
      return { state: failResult.state, failCount, halted: true };
    }
  }

  // Step 2: Derive the infra dev entry point and delegate to resetNodes
  // Re-read state after failItem to avoid stale reference across lock boundaries
  const freshState = infraPollKey ? readStateOrThrow(slug) : state;
  const infraDevKey = freshState.items
    .find((i) => (freshState.nodeCategories || {})[i.key] === "dev"
      && (freshState.dependencies || {})[i.key]?.length === 0)?.key;
  if (!infraDevKey) {
    throw new Error("Cannot recover elevated state: no infrastructure dev node found in DAG.");
  }

  const reason = `Elevated infra apply failed — agent will diagnose and fix TF code. Error: ${errorMessage.slice(0, 200)}`;
  return resetNodes(slug, infraDevKey, reason, maxDevCycles, "reset-for-dev");
}

/**
 * Reset push-app + poll-app-ci for a re-push cycle (application wave).
 * @param {string} slug - Feature slug
 * @param {string} category - Node category to filter by (e.g. "deploy")
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug missing or state file not found
 */
export function resetScripts(slug, category, maxCycles = 10) {
  if (!slug || !category) {
    throw new Error("resetScripts requires slug and category");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const logKey = `reset-scripts:${category}`;
  const cycleCount = state.errorLog.filter((e) => e.itemKey === logKey).length;
  if (cycleCount >= maxCycles) {
    return { state, cycleCount, halted: true };
  }

  // Derive script nodes in the specified category from the persisted graph
  const resetKeys = new Set(
    state.items
      .filter((i) => (state.nodeTypes || {})[i.key] === "script" && (state.nodeCategories || {})[i.key] === category)
      .map((i) => i.key)
  );

  // Cascade barrier nodes: if any barrier's dependency is being reset, reset the barrier too.
  cascadeBarriers(state, resetKeys);

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
    message: `Script re-push cycle for category "${category}" (cycle ${cycleCount + 1}/${maxCycles}). Reset ${resetCount} items: ${[...resetKeys].join(", ")}`,
  });

  writeState(slug, state);
  return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/**
 * Reset a single node + all transitive downstream dependents to pending.
 * Generic kernel primitive for DAG-cascading resets.
 *
 * The triage subsystem classifies a domain, resolves a `route_to` entry-point
 * node, and calls this function. The kernel handles the DAG cascade.
 *
 * @param {string} slug - Feature slug
 * @param {string} seedKey - Single node key to reset (entry point for DAG cascade)
 * @param {string} reason - Human-readable reason (tagged with domain)
 * @param {number} maxCycles - Maximum total reset cycles before halt (default: 5)
 * @param {string} [logKey="reset-nodes"] - Cycle-budget counter key in errorLog
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 */
export function resetNodes(slug, seedKey, reason, maxCycles = 5, logKey = "reset-nodes") {
  if (!slug || !seedKey) {
    throw new Error("resetNodes requires slug and seedKey");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === logKey).length;
  if (cycleCount >= maxCycles) {
    return { state, cycleCount, halted: true };
  }

  // Seed node + all transitive downstream dependents
  const keysToReset = new Set(getDownstream(state, [seedKey]));

  // Cascade barrier nodes
  cascadeBarriers(state, keysToReset);

  let resetCount = 0;
  for (const item of state.items) {
    if (keysToReset.has(item.key) && item.status !== "na") {
      // Dormant nodes in the cascade are only activated if they are the
      // explicit seed target (triage route_to). Transitive dormant dependents
      // stay dormant to avoid unintentional activation.
      if (item.status === "dormant" && item.key !== seedKey) continue;
      item.status = "pending";
      item.error = null;
      resetCount++;
    }
  }

  state.errorLog.push({
    timestamp: new Date().toISOString(),
    itemKey: logKey,
    message: `Reset cycle ${cycleCount + 1}/${maxCycles}: ${reason}. Reset ${resetCount} items: ${[...keysToReset].join(", ")}`,
    errorSignature: reason ? computeErrorSignature(reason) : null,
  });

  writeState(slug, state);
  return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/** @deprecated Use `resetNodes` — backward-compat alias. */
export const resetForReroute = resetNodes;

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
 * @returns {{ key: string|null, label: string, agent: string|null, status: string }}
 * @throws {Error} if slug missing or state file not found
 */
export function getNext(slug) {
  if (!slug) {
    throw new Error("getNext requires slug");
  }

  const state = readStateOrThrow(slug);

  // Find the first incomplete item in topological order (items are stored in topo order)
  for (const item of state.items) {
    if (item.status !== "done" && item.status !== "na" && item.status !== "dormant") {
      return { key: item.key, label: item.label, agent: item.agent, status: item.status };
    }
  }

  return { key: null, label: "Pipeline complete", agent: null, status: "complete" };
}

/**
 * Get ALL currently runnable items (items whose DAG dependencies are all done/na).
 * Returns an array of items that can execute in parallel.
 * @returns {Array<{key: string|null, label: string, agent: string|null, status: string}>}
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
        status: item.status,
      });
    }
  }

  if (available.length === 0) {
    const allDone = state.items.every((i) => i.status === "done" || i.status === "na" || i.status === "dormant");
    if (allDone) {
      return [{ key: null, label: "Pipeline complete", agent: null, status: "complete" }];
    }
    // Pending items exist but none are runnable — blocked by unresolved failures
    return [{ key: null, label: "Pipeline blocked", agent: null, status: "blocked" }];
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
 * Set a structured handoff artifact on a pipeline item.
 * Dev agents use this to communicate typed contracts (testid maps, affected
 * routes, SSR-safety flags) to downstream agents (SDET, test runners).
 *
 * The artifact is a free-form JSON string — the kernel stores it verbatim
 * without schema validation. Each project defines its own artifact shape
 * in its APM instructions. This keeps the kernel tech-stack agnostic.
 *
 * @param {string} slug - Feature slug
 * @param {string} itemKey - Pipeline item key (e.g. "storefront-dev")
 * @param {string} artifactJson - JSON string to store as the handoff artifact
 * @returns {object} Updated state
 * @throws {Error} if slug, itemKey, or artifactJson missing; or if artifactJson is not valid JSON
 */
export function setHandoffArtifact(slug, itemKey, artifactJson) {
  if (!slug || !itemKey || !artifactJson) {
    throw new Error("setHandoffArtifact requires slug, itemKey, and artifactJson");
  }

  // Validate JSON — fail fast if the agent emits garbage
  try {
    JSON.parse(artifactJson);
  } catch {
    throw new Error(`setHandoffArtifact: artifactJson must be valid JSON. Got: ${artifactJson.slice(0, 200)}`);
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    const item = state.items.find((i) => i.key === itemKey);
    if (!item) {
      throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    }

    item.handoffArtifact = artifactJson;
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

/**
 * Persist the last triage record to state for downstream context injection.
 * @param {string} slug
 * @param {object} record - TriageRecord object
 * @returns {object} Updated state
 */
export function setLastTriageRecord(slug, record) {
  if (!slug || !record) {
    throw new Error("setLastTriageRecord requires slug and record");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    state.lastTriageRecord = record;
    writeState(slug, state);
    return state;
  });
}

/**
 * Append an execution record to the persisted execution log.
 * Called by the kernel after every handler invocation. Records survive
 * orchestrator restarts and are used by the triage handler and node wrapper
 * for cross-attempt failure analysis (dedup, revert bypass, death spiral).
 *
 * @param {string} slug - Feature slug
 * @param {object} record - ExecutionRecord object (see types.ts)
 * @returns {object} Updated state
 */
export function persistExecutionRecord(slug, record) {
  if (!slug || !record) {
    throw new Error("persistExecutionRecord requires slug and record");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    if (!state.executionLog) state.executionLog = [];
    state.executionLog.push(record);
    writeState(slug, state);
    return state;
  });
}

/**
 * Set pre-built prompt context on a pipeline item for injection into its
 * next execution attempt. Written by the triage handler (or node wrapper)
 * after failure analysis. Consumed and cleared by the node wrapper.
 *
 * @param {string} slug - Feature slug
 * @param {string} itemKey - Pipeline item key (e.g. "storefront-dev")
 * @param {string|null} context - Prompt context text (null to clear)
 * @returns {object} Updated state
 */
export function setPendingContext(slug, itemKey, context) {
  if (!slug || !itemKey) {
    throw new Error("setPendingContext requires slug and itemKey");
  }

  return withLock(slug, () => {
    const state = readStateOrThrow(slug);
    const item = state.items.find((i) => i.key === itemKey);
    if (!item) {
      throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
    }
    item.pendingContext = context;
    writeState(slug, state);
    return state;
  });
}

// ─── Commands (CLI wrappers) ────────────────────────────────────────────────
// These delegate to the exported API functions above, converting errors to
// console.error + process.exit for CLI usage.

function cmdInit(slug, workflowName) {
  if (!slug || !workflowName) {
    console.error("Usage: pipeline-state.mjs init <slug> <workflow-name>");
    console.error("  workflow-name: A workflow defined in workflows.yml (e.g. full-stack, backend)");
    process.exit(1);
  }

  try {
    const result = initState(slug, workflowName);  // contextJsonPath will be derived from APP_ROOT
    console.log(`✔ Initialized pipeline state for "${slug}" (${workflowName})`);
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

function cmdFail(slug, itemKey, message) {
  if (!slug || !itemKey) {
    console.error("Usage: pipeline-state.mjs fail <slug> <item-key> <message>");
    process.exit(1);
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

function cmdResetScripts(slug, category) {
  if (!slug || !category) {
    console.error("Usage: pipeline-state.mjs reset-scripts <slug> <category>");
    process.exit(1);
  }

  try {
    const { cycleCount, halted } = resetScripts(slug, category);
    if (halted) {
      console.error(`⛔ PIPELINE HALTED — "${slug}" has used ${cycleCount} re-push cycles for category "${category}". Requires human intervention.`);
      process.exit(2);  // Exit code 2 = halted
    } else {
      console.log(`🔄 Reset script items in category "${category}" for re-push cycle (${cycleCount}/10).`);
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

function cmdSetHandoffArtifact(slug, itemKey, artifactJson) {
  if (!slug || !itemKey || !artifactJson) {
    console.error("Usage: pipeline-state.mjs handoff-artifact <slug> <item-key> <json>");
    process.exit(1);
  }

  try {
    setHandoffArtifact(slug, itemKey, artifactJson);
    console.log(`✔ Set handoff artifact for "${itemKey}".`);
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
  case "handoff-artifact":
    cmdSetHandoffArtifact(args[0], args[1], args.slice(2).join(" "));
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
    console.error("  reset-scripts    <slug> <category>              — Reset script-type nodes in the given category for re-push");
    console.error("  resume            <slug>                      — Resume pipeline after elevated apply");
    console.error("  recover-elevated  <slug> <error-message>      — Recover pipeline after failed elevated apply");
    console.error("  status            <slug>                      — Print state JSON");
    console.error("  next              <slug>                      — Print next actionable item");
    console.error("  set-note          <slug> <note>               — Append implementation note");
    console.error("  doc-note          <slug> <item-key> <note>    — Set doc note on a pipeline item");
    console.error("  handoff-artifact  <slug> <item-key> <json>    — Set structured handoff artifact (JSON) on a pipeline item");
    console.error("  set-url           <slug> <url>                — Set deployed URL");
    console.error("");
    console.error("Item keys are dynamically defined in your app's workflows.yml");
    console.error("");
    console.error("");
    console.error("Workflow types: Backend, Frontend, Full-Stack, Infra");
    process.exit(1);
}
} // end if (__isCLI)
