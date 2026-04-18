#!/usr/bin/env node
/**
 * src/cli/pipeline-state.ts — CLI wrapper around the JsonFileStateStore adapter.
 *
 * Replaces the former `pipeline-state.mjs` router. The adapter owns all I/O;
 * this module is thin command-dispatch + stdout/exit-code shaping.
 *
 * Commands:
 *   init              <slug> <workflow-name>     — Initialize pipeline state
 *   reset-scripts     <slug> <category>          — Reset script-type nodes for re-push
 *   resume            <slug>                     — Resume after elevated apply
 *   recover-elevated  <slug> <error-message>     — Recover after failed elevated apply
 *   status            <slug>                     — Print state JSON
 *   next              <slug>                     — Print next actionable item
 *
 * State-mutating verbs for agent-driven outcomes (complete, fail, doc-note,
 * set-url, set-note, handoff-artifact) were removed in Phase A.6. The kernel
 * is the sole writer — agents call the `report_outcome` SDK tool.
 */

import { JsonFileStateStore } from "../adapters/json-file-state-store.js";

const store = new JsonFileStateStore();

// ─── Command handlers ───────────────────────────────────────────────────────

async function cmdInit(slug: string, workflowName: string): Promise<void> {
  if (!slug || !workflowName) {
    console.error("Usage: pipeline-state init <slug> <workflow-name>");
    console.error("  workflow-name: A workflow defined in workflows.yml (e.g. full-stack, backend)");
    process.exit(1);
  }
  const result = await store.initState(slug, workflowName);
  console.log(`✔ Initialized pipeline state for "${slug}" (${workflowName})`);
  console.log(`  State: ${result.statePath}`);
  console.log(`  TRANS: ${result.transPath}`);
}

async function cmdResetScripts(slug: string, category: string): Promise<void> {
  if (!slug || !category) {
    console.error("Usage: pipeline-state reset-scripts <slug> <category>");
    process.exit(1);
  }
  const { cycleCount, halted } = await store.resetScripts(slug, category);
  if (halted) {
    console.error(
      `⛔ PIPELINE HALTED — "${slug}" has used ${cycleCount} re-push cycles for category "${category}". Requires human intervention.`,
    );
    process.exit(2);
  }
  console.log(`🔄 Reset script items in category "${category}" for re-push cycle (${cycleCount}/10).`);
}

async function cmdResume(slug: string): Promise<void> {
  if (!slug) {
    console.error("Usage: pipeline-state resume <slug>");
    process.exit(1);
  }
  const { cycleCount, halted } = await store.resumeAfterElevated(slug);
  if (halted) {
    console.error(
      `⛔ PIPELINE HALTED — "${slug}" has used ${cycleCount} elevated resume cycles. Requires human intervention.`,
    );
    process.exit(2);
  }
  console.log(`🔄 Resumed pipeline after elevated apply (cycle ${cycleCount}/5). Standard CI will re-verify.`);
}

async function cmdRecoverElevated(slug: string, errorMessage: string): Promise<void> {
  if (!slug || !errorMessage) {
    console.error("Usage: pipeline-state recover-elevated <slug> <error-message>");
    process.exit(1);
  }
  const result = await store.recoverElevated(slug, errorMessage);
  if (result.halted) {
    console.error(`⛔ PIPELINE HALTED — "${slug}" has exhausted recovery cycles. Requires human intervention.`);
    process.exit(2);
  }
  const cycleCount = "cycleCount" in result ? result.cycleCount : 0;
  console.log(
    `🔄 Recovery initiated after elevated apply failure (redevelopment cycle ${cycleCount}/5). Agent will diagnose and fix.`,
  );
}

async function cmdStatus(slug: string): Promise<void> {
  if (!slug) {
    console.error("Usage: pipeline-state status <slug>");
    process.exit(1);
  }
  const state = await store.getStatus(slug);
  console.log(JSON.stringify(state, null, 2));
}

async function cmdNext(slug: string): Promise<void> {
  if (!slug) {
    console.error("Usage: pipeline-state next <slug>");
    process.exit(1);
  }
  const state = await store.getStatus(slug);
  for (const item of state.items) {
    if (item.status !== "done" && item.status !== "na" && item.status !== "dormant") {
      console.log(JSON.stringify({ key: item.key, label: item.label, agent: item.agent, status: item.status }));
      return;
    }
  }
  console.log(JSON.stringify({ key: null, label: "Pipeline complete", agent: null, status: "complete" }));
}

// ─── Deprecated verbs (Phase A.6 removal) ───────────────────────────────────

const REMOVED_VERBS = new Set([
  "complete",
  "fail",
  "doc-note",
  "set-url",
  "set-note",
  "handoff-artifact",
]);

function usage(): never {
  console.error("Usage: pipeline-state <command> <args>");
  console.error("");
  console.error("Commands:");
  console.error("  init              <slug> <workflow>           — Initialize pipeline state");
  console.error("  reset-scripts     <slug> <category>           — Reset script nodes for re-push");
  console.error("  resume            <slug>                      — Resume after elevated apply");
  console.error("  recover-elevated  <slug> <error-message>      — Recover after failed elevated apply");
  console.error("  status            <slug>                      — Print state JSON");
  console.error("  next              <slug>                      — Print next actionable item");
  console.error("");
  console.error("Item keys are dynamically defined in your app's workflows.yml.");
  process.exit(1);
}

// ─── Router ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv;
  if (!command) usage();

  if (REMOVED_VERBS.has(command)) {
    console.error(
      `ERROR: 'pipeline-state ${command}' was removed in Phase A.6. ` +
      `The kernel is now the sole writer of pipeline state. ` +
      `Agents must use the 'report_outcome' SDK tool instead.`,
    );
    process.exit(1);
  }

  try {
    switch (command) {
      case "init":
        await cmdInit(args[0]!, args[1]!);
        break;
      case "reset-scripts":
        await cmdResetScripts(args[0]!, args[1]!);
        break;
      case "resume":
        await cmdResume(args[0]!);
        break;
      case "recover-elevated":
        await cmdRecoverElevated(args[0]!, args.slice(1).join(" "));
        break;
      case "status":
        await cmdStatus(args[0]!);
        break;
      case "next":
        await cmdNext(args[0]!);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.error("");
        usage();
    }
  } catch (err) {
    console.error(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
