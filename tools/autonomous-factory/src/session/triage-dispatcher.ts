/**
 * session/triage-dispatcher.ts — Failure triage and DAG-native rerouting.
 *
 * Node has `triage` field → evaluateTriage() → route_to + DAG cascade.
 * The triage engine classifies; this module orchestrates the rerouting lifecycle.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { CopilotClient } from "@github/copilot-sdk";
import { getStatus, failItem, resetForReroute, salvageForDraft } from "../state.js";
import { evaluateTriage, isUnfixableError, isOrchestratorTimeout } from "../triage.js";
import type { CompiledTriageProfile } from "../apm-types.js";
import { getWorkflowNode } from "./shared.js";
import type { PipelineRunConfig, SessionResult } from "../session-runner.js";
import type { ItemSummary } from "../types.js";
import { computeErrorSignature } from "../triage/error-fingerprint.js";

// ---------------------------------------------------------------------------
// v2: Profile-based triage + DAG-native routing
// ---------------------------------------------------------------------------

/**
 * Handle failure rerouting using triage v2 profiles.
 * Evaluates the error via 2-layer triage, resolves route_to from the profile,
 * and resets that node + all downstream dependents via resetForReroute().
 */
export async function handleTriageReroute(
  slug: string,
  itemKey: string,
  rawError: string,
  profile: CompiledTriageProfile,
  config: PipelineRunConfig,
  itemSummary: ItemSummary,
  roamAvailable: boolean,
  client?: CopilotClient,
): Promise<SessionResult> {
  const { repoRoot } = config;
  const workflow = config.apmContext.workflows?.default;
  const unfixableSignals = workflow?.unfixable_signals ?? [];

  // --- Pre-triage guard: SDK timeout → transient retry ---
  if (isOrchestratorTimeout(rawError)) {
    console.log(`  ⚠ SDK Timeout detected in ${itemKey}. Bypassing triage — transient retry via $SELF.`);
    try {
      const result = await resetForReroute(slug, itemKey, `SDK timeout in ${itemKey}`, profile.max_reroutes);
      if (result.halted) {
        console.error(`  ✖ HALTED: ${result.cycleCount} reroute cycles exhausted.`);
        return { summary: itemSummary, halt: true, createPr: false };
      }
    } catch {
      return { summary: itemSummary, halt: true, createPr: false };
    }
    return { summary: itemSummary, halt: false, createPr: false };
  }

  // --- Pre-triage guard: unfixable signals → immediate halt ---
  const unfixableReason = isUnfixableError(rawError, unfixableSignals);
  if (unfixableReason) {
    console.error(`\n  🛑 BLOCKED: Unfixable error "${unfixableReason}" in ${itemKey} — Graceful Degradation.`);
    return triggerGracefulDegradation(slug, itemKey, rawError, config, itemSummary);
  }

  // --- Pre-triage guard: death spiral (same error ≥3 times) ---
  const errorSig = computeErrorSignature(rawError);
  try {
    const pipeState = await getStatus(slug);
    const sameSigCount = pipeState.errorLog.filter((e) => e.errorSignature === errorSig).length;
    if (sameSigCount >= 3) {
      console.error(`\n  🛑 BLOCKED: Error signature ${errorSig} seen ${sameSigCount + 1} times — death spiral prevention.`);
      return triggerGracefulDegradation(slug, itemKey, rawError, config, itemSummary);
    }
  } catch { /* continue to triage */ }

  // --- Evaluate triage (2-layer: RAG → LLM → fallback) ---
  const triageResult = await evaluateTriage(rawError, profile, client, slug, config.appRoot);

  // --- Resolve route_to from profile routing ---
  let routeToKey: string | null;
  if (triageResult.domain === "$SELF") {
    // Fallback: retry the failing node itself
    routeToKey = itemKey;
  } else {
    const routeEntry = profile.routing[triageResult.domain];
    if (!routeEntry || routeEntry.route_to === null) {
      // Domain is "blocked" or unknown → graceful degradation
      console.error(`\n  🛑 BLOCKED: Triage classified as "${triageResult.domain}" (route_to: null) — Graceful Degradation.`);
      return triggerGracefulDegradation(slug, itemKey, rawError, config, itemSummary);
    }
    routeToKey = routeEntry.route_to === "$SELF" ? itemKey : routeEntry.route_to;

    // Per-domain retry cap
    if (routeEntry.retries) {
      const pipeState = await getStatus(slug);
      const domainTag = `[domain:${triageResult.domain}]`;
      let consecutiveCount = 0;
      for (let i = (pipeState.errorLog ?? []).length - 1; i >= 0; i--) {
        const entry = pipeState.errorLog[i];
        if (entry.itemKey === "reset-for-reroute" && entry.message?.includes(domainTag)) {
          consecutiveCount++;
        } else if (entry.itemKey === "reset-for-reroute") {
          break;
        }
      }
      if (consecutiveCount >= routeEntry.retries) {
        console.warn(`\n  ⚠ Domain "${triageResult.domain}" hit retry cap (${consecutiveCount}/${routeEntry.retries}) — treating as blocked.`);
        return triggerGracefulDegradation(slug, itemKey, rawError, config, itemSummary);
      }
    }
  }

  // --- Execute reroute: reset target node + DAG cascade ---
  const taggedReason = `[domain:${triageResult.domain}] [source:${triageResult.source}] ${triageResult.reason}`;
  console.log(`\n  🔄 Triage reroute: ${itemKey} → route_to: ${routeToKey} (domain: ${triageResult.domain}, source: ${triageResult.source})`);

  try {
    const result = await resetForReroute(slug, routeToKey, taggedReason, profile.max_reroutes);
    if (result.halted) {
      console.error(`  ✖ HALTED: ${result.cycleCount} reroute cycles exhausted.`);
      return { summary: itemSummary, halt: true, createPr: false };
    }
    console.log(`     Reroute cycle ${result.cycleCount}/${profile.max_reroutes} — pipeline will restart from ${routeToKey}`);

    // Re-index semantic graph after reroute if target involves dev/test nodes
    if (roamAvailable) {
      const targetCat = getWorkflowNode(config.apmContext, routeToKey)?.category;
      if (targetCat === "dev" || targetCat === "test") {
        console.log("  🧠 Re-indexing semantic graph after reroute...");
        try {
          execSync("roam index", { cwd: repoRoot, stdio: "inherit", timeout: 120_000 });
        } catch { /* non-fatal */ }
      }
    }
  } catch {
    console.error("  ✖ Could not execute reroute. Exiting.");
    return { summary: itemSummary, halt: true, createPr: false };
  }

  return { summary: itemSummary, halt: false, createPr: false };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function triggerGracefulDegradation(
  slug: string,
  itemKey: string,
  errorMsg: string,
  config: PipelineRunConfig,
  itemSummary: ItemSummary,
): Promise<SessionResult> {
  console.error(`  🛑 Triggering Graceful Degradation — pipeline will open a Draft PR for human remediation.`);
  try {
    await failItem(slug, itemKey, `BLOCKED: ${errorMsg}`);
    await salvageForDraft(slug, itemKey);
    const draftFlagPath = path.join(config.appRoot, "in-progress", `${slug}.blocked-draft`);
    fs.writeFileSync(draftFlagPath, errorMsg, "utf-8");
  } catch (e) {
    console.error("  ✖ Failed to salvage pipeline state", e);
    return { summary: itemSummary, halt: true, createPr: false };
  }
  return { summary: itemSummary, halt: false, createPr: false };
}
