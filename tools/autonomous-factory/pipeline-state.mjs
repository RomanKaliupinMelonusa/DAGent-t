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
 *   reset-ci          <slug>                      — Reset push-app + poll-app-ci for re-push
 *   reset-infra-plan  <slug>                      — Reset push-infra + poll-infra-plan for re-push
 *   redevelop-infra   <slug> <reason>             — Reset Wave 1 infra items for redevelopment
 *   resume            <slug>                      — Resume pipeline after elevated apply
 *   recover-elevated  <slug> <error-message>      — Recover pipeline after failed elevated apply
 *   status            <slug>                      — Print current state JSON to stdout
 *   next              <slug>                      — Print the next actionable item key
 *   set-note          <slug> <note>               — Append implementation note
 *   doc-note          <slug> <item-key> <note>    — Set doc note on a pipeline item
 *   set-url           <slug> <url>                — Set deployed URL
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmdirSync } from "node:fs";
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

export const PHASES = ["infra", "approval", "pre-deploy", "deploy", "post-deploy", "finalize"];

/** Canonical checklist items. Order matters — it defines execution sequence.
 *  Two-Wave model: Wave 1 (infra) completes before Wave 2 (application) begins.
 *  Linear model: feature branch deploys directly via CI, PR to base branch is last step. */
export const ALL_ITEMS = [
  // ── Wave 1: Infrastructure ──────────────────────────────────────────────
  { key: "schema-dev",           label: "Development Complete — Schemas",              agent: "@schema-dev",         phase: "infra" },
  { key: "infra-architect",      label: "Infrastructure Written — Terraform",          agent: "@infra-architect",    phase: "infra" },
  { key: "push-infra",           label: "Infra Code Pushed to Origin",                 agent: "@deploy-manager",     phase: "infra" },
  { key: "create-draft-pr",      label: "Draft PR Created",                            agent: "@pr-creator",         phase: "infra" },
  { key: "poll-infra-plan",      label: "Infra Plan CI Passed",                        agent: "@deploy-manager",     phase: "infra" },
  // ── Approval Gate ───────────────────────────────────────────────────────
  { key: "await-infra-approval", label: "Infra Approval Received",                     agent: null,                  phase: "approval" },
  { key: "infra-handoff",        label: "Infra Outputs Captured — Interfaces Written", agent: "@infra-handoff",      phase: "approval" },
  // ── Wave 2: Application ─────────────────────────────────────────────────
  { key: "backend-dev",          label: "Development Complete — Backend",              agent: "@backend-dev",        phase: "pre-deploy" },
  { key: "frontend-dev",         label: "Development Complete — Frontend",             agent: "@frontend-dev",       phase: "pre-deploy" },
  { key: "backend-unit-test",    label: "Unit Tests Passed — Backend",                 agent: "@backend-test",       phase: "pre-deploy" },
  { key: "frontend-unit-test",   label: "Unit Tests Passed — Frontend",                agent: "@frontend-ui-test",   phase: "pre-deploy" },
  { key: "push-app",             label: "App Code Pushed to Origin",                   agent: "@deploy-manager",     phase: "deploy" },
  { key: "poll-app-ci",          label: "App CI Workflows Passed",                     agent: "@deploy-manager",     phase: "deploy" },
  { key: "integration-test",     label: "Integration Tests Passed",                    agent: "@backend-test",       phase: "post-deploy" },
  { key: "live-ui",              label: "Live UI Validated",                            agent: "@frontend-ui-test",   phase: "post-deploy" },
  { key: "code-cleanup",         label: "Dead Code Eliminated",                         agent: "@code-cleanup",       phase: "finalize" },
  { key: "docs-archived",        label: "Docs Updated & Archived",                     agent: "@docs-expert",        phase: "finalize" },
  { key: "doc-architect",        label: "Architecture & Risk Documented",               agent: "@doc-architect",      phase: "finalize" },
  { key: "publish-pr",           label: "PR Published & Ready for Review",              agent: "@pr-creator",         phase: "finalize" },
];

/**
 * Workflow-type → items that are NOT applicable and should be marked N/A.
 * Every key NOT in this list stays "pending".
 */
export const NA_ITEMS_BY_TYPE = {
  Backend:     ["frontend-dev", "frontend-unit-test", "live-ui"],
  Frontend:    ["backend-dev", "backend-unit-test", "integration-test", "schema-dev"],
  "Full-Stack": [],
  Infra:       ["frontend-dev", "frontend-unit-test", "backend-dev", "backend-unit-test",
                "integration-test", "live-ui", "schema-dev", "code-cleanup",
                "push-app", "poll-app-ci", "doc-architect"],
  "App-Only":  ["schema-dev", "infra-architect", "push-infra", "poll-infra-plan",
                "await-infra-approval", "infra-handoff"],
  "Backend-Only": ["schema-dev", "infra-architect", "push-infra", "poll-infra-plan",
                   "await-infra-approval", "infra-handoff",
                   "frontend-dev", "frontend-unit-test", "live-ui"],
};
// NOTE: create-draft-pr, docs-archived, and publish-pr are always active for all types.
// The Infra workflow type skips Wave 2 app items entirely — only infra wave + docs + PR.

/**
 * DAG dependency map: each item lists the item keys it depends on.
 * An item is runnable when ALL dependencies are "done" or "na".
 * This enables parallel execution of independent items (e.g., backend-dev ‖ frontend-dev).
 */
export const ITEM_DEPENDENCIES = {
  // ── Wave 1: Infrastructure ──────────────────────────────────────────────
  "schema-dev":           [],
  "infra-architect":      ["schema-dev"],
  "push-infra":           ["infra-architect"],
  "create-draft-pr":      ["push-infra"],
  "poll-infra-plan":      ["create-draft-pr"],
  // ── Approval Gate (human reviews TF plan on Draft PR) ──────────────────
  "await-infra-approval": ["poll-infra-plan"],
  "infra-handoff":        ["await-infra-approval"],
  // ── Wave 2: Application (gated behind infra-handoff) ────────────────────
  "backend-dev":          ["schema-dev", "infra-handoff"],
  "frontend-dev":         ["schema-dev", "infra-handoff"],
  "backend-unit-test":    ["backend-dev"],
  "frontend-unit-test":   ["frontend-dev"],
  "push-app":             ["backend-unit-test", "frontend-unit-test"],
  "poll-app-ci":          ["push-app"],
  "integration-test":     ["poll-app-ci"],
  "live-ui":              ["poll-app-ci"],
  "code-cleanup":         ["integration-test", "live-ui"],
  "docs-archived":        ["code-cleanup"],
  // ── Wave 3: Architecture Analysis (frozen AST) ────────────────────────
  "doc-architect":        ["code-cleanup", "docs-archived"],
  "publish-pr":           ["doc-architect"],
};

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

  // Group items by phase
  for (const phase of PHASES) {
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
  let retries = 50; // Try for ~5 seconds
  while (retries > 0) {
    try {
      mkdirSync(lockPath); // Atomic POSIX operation
      try {
        return fn();
      } finally {
        rmdirSync(lockPath);
      }
    } catch (err) {
      if (err.code === "EEXIST") {
        retries--;
        execSync("sleep 0.1"); // Synchronous 100ms backoff
      } else {
        throw err;
      }
    }
  }
  throw new Error(`Timeout acquiring state lock for ${slug}`);
}

/**
 * Initialize pipeline state for a new feature.
 * @returns {{ state: object, statePath: string, transPath: string }}
 * @throws {Error} if slug, workflowType missing or workflowType is invalid
 */
export function initState(slug, workflowType) {
  if (!slug || !workflowType) {
    throw new Error("initState requires slug and workflowType");
  }
  if (!NA_ITEMS_BY_TYPE[workflowType]) {
    throw new Error(`Unknown workflow type "${workflowType}". Must be one of: ${Object.keys(NA_ITEMS_BY_TYPE).join(", ")}`);
  }

  const naKeys = new Set(NA_ITEMS_BY_TYPE[workflowType]);

  const state = {
    feature: slug,
    workflowType,
    started: today(),
    deployedUrl: null,
    implementationNotes: null,
    items: ALL_ITEMS.map((item) => ({
      ...item,
      status: naKeys.has(item.key) ? "na" : "pending",
      error: null,
    })),
    errorLog: [],
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
    const itemPhaseIndex = PHASES.indexOf(item.phase);
    for (let pi = 0; pi < itemPhaseIndex; pi++) {
      const phase = PHASES[pi];
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

  const skipKeys = new Set(["integration-test", "live-ui", "code-cleanup"]);
  // When infra wave fails (CI or agent), also skip all Wave 2 items
  if (failedItemKey === "poll-infra-plan" || failedItemKey === "infra-handoff" || failedItemKey === "infra-architect") {
    for (const k of ["infra-handoff", "await-infra-approval", "backend-dev", "frontend-dev", "backend-unit-test",
                      "frontend-unit-test", "push-app", "poll-app-ci"]) {
      skipKeys.add(k);
    }
  }
  // When infra-architect triggers permission escalation, also skip push-infra and poll-infra-plan
  // (they will be reset by resumeAfterElevated when the elevated apply succeeds)
  if (failedItemKey === "infra-architect") {
    skipKeys.add("push-infra");
    skipKeys.add("create-draft-pr");
    skipKeys.add("poll-infra-plan");
    skipKeys.add("await-infra-approval");
  }
  const forcePendingKeys = new Set(["docs-archived", "publish-pr"]);
  for (const item of state.items) {
    if ((skipKeys.has(item.key) || item.key === failedItemKey) && item.status !== "done") {
      item.status = "na";
    } else if (forcePendingKeys.has(item.key)) {
      item.status = "pending";
      item.error = null;
    }
  }

  state.errorLog.push({
    timestamp: new Date().toISOString(),
    itemKey: "salvage-draft",
    message: `Graceful degradation: skipped ${failedItemKey}, integration-test, live-ui, code-cleanup for Draft PR.`,
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

  const naByType = new Set(NA_ITEMS_BY_TYPE[state.workflowType] || []);
  const salvageTargets = ["integration-test", "live-ui", "code-cleanup",
                          "await-infra-approval", "infra-handoff", "backend-dev", "frontend-dev",
                          "backend-unit-test", "frontend-unit-test", "push-app", "poll-app-ci"];
  // push-infra must also reset so a fresh push triggers new CI runs for poll-infra-plan to verify.
  // Without this, poll-infra-plan would poll stale (failed) CI runs from before the elevated apply.
  const forceResetKeys = new Set(["push-app", "poll-app-ci"]);
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
    if (salvageTargets.includes(item.key) && item.status === "na" && !naByType.has(item.key)) {
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

    // Step 1: Record the failure on poll-infra-plan (inlined from failItem)
    const item = state.items.find((i) => i.key === "poll-infra-plan");
    if (item) {
      item.status = "failed";
      item.error = `Elevated apply failed: ${errorMessage}`;
      state.errorLog.push({
        timestamp: new Date().toISOString(),
        itemKey: "poll-infra-plan",
        message: `Elevated apply failed: ${errorMessage}`,
      });
    }
    const failCount = state.errorLog.filter((e) => e.itemKey === "poll-infra-plan").length;
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
    const deployItems = ["push-infra", "create-draft-pr", "poll-infra-plan", "await-infra-approval", "infra-handoff", "push-app", "poll-app-ci"];
    const keysToReset = new Set(["infra-architect", ...deployItems]);
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
export function resetCi(slug) {
  if (!slug) {
    throw new Error("resetCi requires slug");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "reset-ci").length;
  if (cycleCount >= 10) {
    return { state, cycleCount, halted: true };
  }

  const resetKeys = new Set(["push-app", "poll-app-ci"]);
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
    itemKey: "reset-ci",
    message: `Re-push cycle triggered (cycle ${cycleCount + 1}/10). Reset ${resetCount} items: ${[...resetKeys].join(", ")}`,
  });

  writeState(slug, state);
  return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/**
 * Reset push-infra + poll-infra-plan + create-draft-pr for a re-push cycle (infrastructure wave).
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug missing or state file not found
 */
export function resetInfraPlan(slug) {
  if (!slug) {
    throw new Error("resetInfraPlan requires slug");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "reset-infra-plan").length;
  if (cycleCount >= 10) {
    return { state, cycleCount, halted: true };
  }

  const resetKeys = new Set(["push-infra", "create-draft-pr", "poll-infra-plan"]);
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
    itemKey: "reset-infra-plan",
    message: `Infra re-push cycle triggered (cycle ${cycleCount + 1}/10). Reset ${resetCount} items: ${[...resetKeys].join(", ")}`,
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
export function resetForRedeploy(slug, itemKeys, reason) {
  if (!slug || !itemKeys?.length) {
    throw new Error("resetForRedeploy requires slug and at least one itemKey");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "reset-for-redeploy").length;
  if (cycleCount >= 3) {
    return { state, cycleCount, halted: true };
  }

  const keysToReset = new Set(itemKeys);

  // Cascade: also reset "done" post-deploy items that depend on deploy items.
  // SURGICAL: if the caller already specified specific post-deploy items (e.g.,
  // triage routed deployment-stale-frontend → live-ui only), do NOT blanket-reset
  // all post-deploy items. Only cascade when no post-deploy item was explicitly
  // included — this preserves already-passed tests in the unaffected domain.
  const POST_DEPLOY_KEYS = new Set(["integration-test", "live-ui"]);
  const callerSpecifiedPostDeploy = [...keysToReset].some(k => POST_DEPLOY_KEYS.has(k));
  const deployItemSet = new Set(["push-app", "poll-app-ci", "push-infra", "poll-infra-plan"]);
  const hasDeployReset = [...keysToReset].some(k => deployItemSet.has(k));
  if (hasDeployReset && !callerSpecifiedPostDeploy) {
    // No specific post-deploy item targeted — cascade to all done post-deploy items
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
    itemKey: "reset-for-redeploy",
    message: `Re-deployment cycle ${cycleCount + 1}/3: ${reason}. Reset ${resetCount} items: ${[...keysToReset].join(", ")}`,
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
export function resetForDev(slug, itemKeys, reason) {
  if (!slug || !itemKeys?.length) {
    throw new Error("resetForDev requires slug and at least one itemKey");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "reset-for-dev").length;
  if (cycleCount >= 5) {
    return { state, cycleCount, halted: true };
  }

  // Always include the appropriate deploy items so the fix gets redeployed.
  // If infra-architect is being reset, include infra wave deploy items.
  // Otherwise include app wave deploy items.
  const infraKeys = new Set(["infra-architect"]);
  const hasInfraReset = itemKeys.some(k => infraKeys.has(k));
  const deployItems = hasInfraReset
    ? ["push-infra", "create-draft-pr", "poll-infra-plan", "await-infra-approval", "infra-handoff", "push-app", "poll-app-ci"]
    : ["push-app", "poll-app-ci"];
  const keysToReset = new Set([...itemKeys, ...deployItems]);

  // Cascade: when deploy items are being reset, also reset any "done" post-deploy
  // items that depend on them. This prevents stale `integration-test: done` while
  // `push-app: pending` — the post-deploy items must re-run to verify the new
  // deployment.
  const deployItemSet = new Set(deployItems);
  const hasDeployReset = [...keysToReset].some(k => deployItemSet.has(k));
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
    message: `Redevelopment cycle ${cycleCount + 1}/5: ${reason}. Reset ${resetCount} items: ${[...keysToReset].join(", ")}`,
  });

  writeState(slug, state);
  return { state, cycleCount: cycleCount + 1, halted: false };
  }); // end withLock
}

/**
 * Reset Wave 1 infrastructure items for a redevelopment cycle.
 * Called by application agents (backend-dev, frontend-dev) when they discover
 * that deployed infrastructure is missing required resources.
 *
 * Resets: infra-architect, push-infra, create-draft-pr, poll-infra-plan,
 *         await-infra-approval, infra-handoff back to "pending".
 *
 * @param {string} slug - Feature slug
 * @param {string} reason - Human-readable reason for the rollback
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug or reason missing, or state file not found
 */
export function redevelopInfra(slug, reason) {
  if (!slug || !reason) {
    throw new Error("redevelopInfra requires slug and reason");
  }

  return withLock(slug, () => {
  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "redevelop-infra").length;
  if (cycleCount >= 5) {
    return { state, cycleCount, halted: true };
  }

  const resetItemKeys = new Set([
    "infra-architect", "push-infra", "create-draft-pr",
    "poll-infra-plan", "await-infra-approval", "infra-handoff",
  ]);
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
    itemKey: "redevelop-infra",
    message: `Infra redevelopment cycle ${cycleCount + 1}/5: ${reason}. Reset ${resetCount} items: ${[...resetItemKeys].join(", ")}`,
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

  for (const phase of PHASES) {
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

    const deps = ITEM_DEPENDENCIES[item.key] || [];
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
    console.error("  workflow-type: Backend | Frontend | Full-Stack | Infra | App-Only | Backend-Only");
    process.exit(1);
  }

  try {
    const result = initState(slug, workflowType);
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

/** Post-deploy items whose failure messages must be valid TriageDiagnostic JSON. */
const POST_DEPLOY_ITEMS = new Set(
  ALL_ITEMS.filter((i) => i.phase === "post-deploy").map((i) => i.key),
);

/** Pre-deploy test items that also require structured JSON for triage rerouting. */
const TEST_ITEMS = new Set(["backend-unit-test", "frontend-unit-test"]);

function cmdFail(slug, itemKey, message) {
  if (!slug || !itemKey) {
    console.error("Usage: pipeline-state.mjs fail <slug> <item-key> <message>");
    process.exit(1);
  }

  // ── Zod gate: post-deploy & test items must supply valid TriageDiagnostic JSON ──
  if (POST_DEPLOY_ITEMS.has(itemKey) || TEST_ITEMS.has(itemKey)) {
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

function cmdResetCi(slug) {
  if (!slug) {
    console.error("Usage: pipeline-state.mjs reset-ci <slug>");
    process.exit(1);
  }

  try {
    const { cycleCount, halted } = resetCi(slug);
    if (halted) {
      console.error(`⛔ PIPELINE HALTED — "${slug}" has used ${cycleCount} re-push cycles. Requires human intervention.`);
      process.exit(2);  // Exit code 2 = halted
    } else {
      const resetCount = 2; // push-app + poll-app-ci always reset
      console.log(`🔄 Reset ${resetCount} deploy items for re-push cycle (${cycleCount}/10).`);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdResetInfraPlan(slug) {
  if (!slug) {
    console.error("Usage: pipeline-state.mjs reset-infra-plan <slug>");
    process.exit(1);
  }

  try {
    const { cycleCount, halted } = resetInfraPlan(slug);
    if (halted) {
      console.error(`⛔ PIPELINE HALTED — "${slug}" has used ${cycleCount} infra re-push cycles. Requires human intervention.`);
      process.exit(2);
    } else {
      const resetCount = 3; // push-infra + create-draft-pr + poll-infra-plan always reset
      console.log(`🔄 Reset ${resetCount} infra deploy items for re-push cycle (${cycleCount}/10).`);
    }
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
}

function cmdRedevelopInfra(slug, reason) {
  if (!slug || !reason) {
    console.error("Usage: pipeline-state.mjs redevelop-infra <slug> <reason>");
    process.exit(1);
  }

  try {
    const { cycleCount, halted } = redevelopInfra(slug, reason);
    if (halted) {
      console.error(`⛔ PIPELINE HALTED — "${slug}" has used ${cycleCount} infra redevelopment cycles. Requires human intervention.`);
      process.exit(2);
    } else {
      console.log(`🔄 Infra redevelopment triggered (cycle ${cycleCount}/5). Wave 1 items reset to pending.`);
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
  case "reset-ci":
    cmdResetCi(args[0]);
    break;
  case "reset-infra-plan":
    cmdResetInfraPlan(args[0]);
    break;
  case "reset-infra-ci":
    console.warn("⚠ Deprecated: use 'reset-infra-plan' instead of 'reset-infra-ci'");
    cmdResetInfraPlan(args[0]);
    break;
  case "redevelop-infra":
    cmdRedevelopInfra(args[0], args.slice(1).join(" "));
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
    console.error("  reset-ci          <slug>                      — Reset push-app + poll-app-ci for re-push");
    console.error("  reset-infra-plan  <slug>                      — Reset push-infra + poll-infra-plan for re-push");
    console.error("  redevelop-infra   <slug> <reason>             — Reset Wave 1 infra items for redevelopment");
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
