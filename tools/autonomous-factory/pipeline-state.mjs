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
 * Implementation is split across `pipeline-state/`:
 *   - io.mjs             — path helpers, readState/writeState, renderTrans
 *   - lock.mjs           — POSIX atomic lock (withLock)
 *   - graph.mjs          — getDownstream/getUpstream/cascadeBarriers
 *   - error-signature.mjs — computeErrorSignature
 *   - mutations.mjs      — all state-mutating API functions
 *   - queries.mjs        — read-only API (getStatus/getNext/getNextAvailable)
 *
 * This file re-exports the full public API and hosts the CLI router.
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

// ─── Re-exports (public API) ────────────────────────────────────────────────
export { computeErrorSignature } from "./pipeline-state/error-signature.mjs";
export { getDownstream, getUpstream, cascadeBarriers } from "./pipeline-state/graph.mjs";
export { readState, readStateOrThrow } from "./pipeline-state/io.mjs";
export {
  initState,
  completeItem,
  failItem,
  salvageForDraft,
  resumeAfterElevated,
  recoverElevated,
  resetScripts,
  resetNodes,
  resetForReroute,
  setNote,
  setDocNote,
  setHandoffArtifact,
  setUrl,
  setLastTriageRecord,
  persistExecutionRecord,
  setPendingContext,
} from "./pipeline-state/mutations.mjs";
export { getStatus, getNext, getNextAvailable } from "./pipeline-state/queries.mjs";

// ─── CLI implementation (imports for local use in command wrappers) ────────
import { readState } from "./pipeline-state/io.mjs";
import {
  initState,
  completeItem,
  failItem,
  resumeAfterElevated,
  recoverElevated,
  resetScripts,
  setNote,
  setDocNote,
  setHandoffArtifact,
  setUrl,
} from "./pipeline-state/mutations.mjs";
import { getStatus, getNext } from "./pipeline-state/queries.mjs";

// ─── Commands (CLI wrappers) ────────────────────────────────────────────────
// These delegate to the exported API functions, converting errors to
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

// Phase A.5 — Kernel-sole-writer migration.
// State-mutating verbs invoked from inside an in-pipeline Copilot agent
// session (detected via INSIDE_COPILOT_SESSION=1, set by the SDK shell tool
// in src/harness/shell-tools.ts) emit a stderr deprecation warning. Agents
// must use the `report_outcome` SDK tool instead. The verbs continue to
// function so legacy automation and external CI keep working until A.6.
const IN_SESSION_DEPRECATED = new Set([
  "complete",
  "fail",
  "doc-note",
  "set-url",
  "set-note",
  "handoff-artifact",
]);
function warnIfInSession(cmd) {
  if (process.env.INSIDE_COPILOT_SESSION === "1" && IN_SESSION_DEPRECATED.has(cmd)) {
    console.error(
      `[DEPRECATED] 'pipeline-state.mjs ${cmd}' invoked from inside a Copilot ` +
      `agent session. Use the 'report_outcome' SDK tool instead. ` +
      `Bash invocation will be removed in Phase A.6.`,
    );
  }
}
warnIfInSession(command);

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
