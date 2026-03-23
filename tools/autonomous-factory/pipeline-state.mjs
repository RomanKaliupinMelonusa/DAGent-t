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
 *   init     <slug> <type>               — Create state + TRANS for a new feature
 *   complete <slug> <item-key>           — Mark an item as done
 *   fail     <slug> <item-key> <message> — Record a failure
 *   reset-ci <slug>                      — Reset push-code + poll-ci for re-push cycle
 *   status   <slug>                      — Print current state JSON to stdout
 *   next     <slug>                      — Print the next actionable item key
 *   set-note <slug> <note>               — Append implementation note
 *   doc-note <slug> <item-key> <note>    — Set doc note on a pipeline item
 *   set-url  <slug> <url>                — Set deployed URL
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

export const PHASES = ["pre-deploy", "deploy", "post-deploy", "finalize"];

/** Canonical checklist items. Order matters — it defines execution sequence.
 *  Linear model: feature branch deploys directly via CI, PR to base branch is last step. */
export const ALL_ITEMS = [
  { key: "schema-dev",         label: "Development Complete — Schemas",              agent: "@schema-dev",         phase: "pre-deploy" },
  { key: "backend-dev",        label: "Development Complete — Backend",              agent: "@backend-dev",        phase: "pre-deploy" },
  { key: "frontend-dev",       label: "Development Complete — Frontend",             agent: "@frontend-dev",       phase: "pre-deploy" },
  { key: "backend-unit-test",  label: "Unit Tests Passed — Backend",                 agent: "@backend-test",       phase: "pre-deploy" },
  { key: "frontend-unit-test", label: "Unit Tests Passed — Frontend",                agent: "@frontend-ui-test",   phase: "pre-deploy" },
  { key: "push-code",          label: "Code Pushed to Origin",                       agent: "@deploy-manager",     phase: "deploy" },
  { key: "poll-ci",            label: "CI Workflows Passed",                         agent: "@deploy-manager",     phase: "deploy" },
  { key: "integration-test",   label: "Integration Tests Passed",                    agent: "@backend-test",       phase: "post-deploy" },
  { key: "live-ui",            label: "Live UI Validated",                            agent: "@frontend-ui-test",   phase: "post-deploy" },
  { key: "code-cleanup",       label: "Dead Code Eliminated",                         agent: "@code-cleanup",       phase: "finalize" },
  { key: "docs-archived",      label: "Docs Updated & Archived",                     agent: "@docs-expert",        phase: "finalize" },
  { key: "create-pr",          label: "PR Created & Merged to Main",                 agent: "@pr-creator",         phase: "finalize" },
];

/**
 * Workflow-type → items that are NOT applicable and should be marked N/A.
 * Every key NOT in this list stays "pending".
 */
export const NA_ITEMS_BY_TYPE = {
  Backend:     ["frontend-dev", "frontend-unit-test", "live-ui"],
  Frontend:    ["backend-dev", "backend-unit-test", "integration-test", "schema-dev"],
  "Full-Stack": [],
  Infra:       ["frontend-dev", "frontend-unit-test", "backend-unit-test", "integration-test", "live-ui", "schema-dev", "code-cleanup"],
};
// NOTE: push-code, poll-ci, docs-archived, and create-pr are always active for all types.

/**
 * DAG dependency map: each item lists the item keys it depends on.
 * An item is runnable when ALL dependencies are "done" or "na".
 * This enables parallel execution of independent items (e.g., backend-dev ‖ frontend-dev).
 */
export const ITEM_DEPENDENCIES = {
  "schema-dev":         [],
  "backend-dev":        ["schema-dev"],
  "frontend-dev":       ["schema-dev"],
  "backend-unit-test":  ["backend-dev"],
  "frontend-unit-test": ["frontend-dev"],
  "push-code":          ["backend-unit-test", "frontend-unit-test"],
  "poll-ci":            ["push-code"],
  "integration-test":   ["poll-ci"],
  "live-ui":            ["poll-ci"],
  "code-cleanup":       ["integration-test", "live-ui"],
  "docs-archived":      ["code-cleanup"],
  "create-pr":          ["docs-archived"],
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
    const heading = phase === "pre-deploy" ? "Pre-Deploy"
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
  return new Date().toISOString().slice(0, 10);
}

// ─── Exported Programmatic API ──────────────────────────────────────────────
// These functions throw on error instead of calling process.exit().
// They are used by the SDK orchestrator (scripts/orchestrator/src/state.ts).
// The cmd*() CLI wrappers below continue to use process.exit() for CLI usage.

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
}

/**
 * Reset push-code + poll-ci for a re-push cycle.
 * @returns {{ state: object, cycleCount: number, halted: boolean }}
 * @throws {Error} if slug missing or state file not found
 */
export function resetCi(slug) {
  if (!slug) {
    throw new Error("resetCi requires slug");
  }

  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "reset-ci").length;
  if (cycleCount >= 10) {
    return { state, cycleCount, halted: true };
  }

  const resetKeys = new Set(["push-code", "poll-ci"]);
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

  const state = readStateOrThrow(slug);

  const cycleCount = state.errorLog.filter((e) => e.itemKey === "reset-for-dev").length;
  if (cycleCount >= 5) {
    return { state, cycleCount, halted: true };
  }

  // Always include deploy items (push-code, poll-ci) so the fix gets redeployed
  const keysToReset = new Set([...itemKeys, "push-code", "poll-ci"]);
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
}

/**
 * Get full pipeline state.
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

  const state = readStateOrThrow(slug);
  state.implementationNotes = state.implementationNotes
    ? state.implementationNotes + "\n\n" + note
    : note;
  writeState(slug, state);
  return state;
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

  const state = readStateOrThrow(slug);
  const item = state.items.find((i) => i.key === itemKey);
  if (!item) {
    throw new Error(`Unknown item key "${itemKey}". Valid keys: ${state.items.map((i) => i.key).join(", ")}`);
  }

  item.docNote = note;
  writeState(slug, state);
  return state;
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

  const state = readStateOrThrow(slug);
  state.deployedUrl = url;
  writeState(slug, state);
  return state;
}

// ─── Commands (CLI wrappers) ────────────────────────────────────────────────
// These delegate to the exported API functions above, converting errors to
// console.error + process.exit for CLI usage.

function cmdInit(slug, workflowType) {
  if (!slug || !workflowType) {
    console.error("Usage: pipeline-state.mjs init <slug> <workflow-type>");
    console.error("  workflow-type: Backend | Frontend | Full-Stack | Infra");
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

function cmdFail(slug, itemKey, message) {
  if (!slug || !itemKey) {
    console.error("Usage: pipeline-state.mjs fail <slug> <item-key> <message>");
    process.exit(1);
  }

  // ── Zod gate: post-deploy items must supply valid TriageDiagnostic JSON ──
  if (POST_DEPLOY_ITEMS.has(itemKey)) {
    let parsed;
    try {
      parsed = JSON.parse(message);
    } catch {
      console.error(`ERROR: Post-deploy item "${itemKey}" requires a valid JSON failure message.`);
      console.error(`Expected: {"fault_domain": "backend"|"frontend"|"both"|"environment", "diagnostic_trace": "<details>"}`);
      console.error(`Received: ${message}`);
      process.exit(1);
    }
    const result = TriageDiagnosticSchema.safeParse(parsed);
    if (!result.success) {
      console.error(`ERROR: Post-deploy item "${itemKey}" failure message failed schema validation.`);
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
      const resetCount = 2; // push-code + poll-ci always reset
      console.log(`🔄 Reset ${resetCount} deploy items for re-push cycle (${cycleCount}/10).`);
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
    console.error("  reset-ci     <slug>                      — Reset push-code + poll-ci for re-push");
    console.error("  status       <slug>                      — Print state JSON");
    console.error("  next         <slug>                      — Print next actionable item");
    console.error("  set-note     <slug> <note>               — Append implementation note");
    console.error("  doc-note     <slug> <item-key> <note>    — Set doc note on a pipeline item");
    console.error("  set-url      <slug> <url>                — Set deployed URL");
    console.error("");
    console.error("Item keys: schema-dev, backend-dev, frontend-dev, backend-unit-test, frontend-unit-test,");
    console.error("           push-code, poll-ci, integration-test, live-ui, docs-archived, create-pr");
    console.error("");
    console.error("Workflow types: Backend, Frontend, Full-Stack, Infra");
    process.exit(1);
}
} // end if (__isCLI)
