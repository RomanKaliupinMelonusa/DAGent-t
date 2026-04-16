/**
 * session/triage-dispatcher.ts — Failure triage and DAG-native rerouting.
 *
 * @deprecated Triage is now a first-class DAG node handler (handlers/triage.ts).
 * The kernel dispatches triage via on_failure edges instead of calling this module.
 * This file is retained for backward compatibility only — do not add new logic here.
 * The active triage handler is: tools/autonomous-factory/src/handlers/triage.ts
 * The kernel failure-edge dispatch is in: session-runner.ts (dispatchOnFailure)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { CopilotClient } from "@github/copilot-sdk";
import { getStatus, failItem, resetNodes, salvageForDraft, setLastTriageRecord } from "../state.js";
import { evaluateTriage, isUnfixableError, isOrchestratorTimeout } from "../triage.js";
import type { CompiledTriageProfile } from "../apm-types.js";
import { getWorkflowNode } from "./shared.js";
import type { PipelineRunConfig, SessionResult } from "../session-runner.js";
import type { ItemSummary, TriageRecord } from "../types.js";
import { computeErrorSignature } from "../triage/error-fingerprint.js";

// ---------------------------------------------------------------------------
// v2: Profile-based triage + DAG-native routing
// ---------------------------------------------------------------------------

/**
 * Handle failure rerouting using triage v2 profiles.
 * Evaluates the error via 2-layer triage, resolves route_to from the profile,
 * and resets that node + all downstream dependents via resetNodes().
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
  const errorSig = computeErrorSignature(rawError);

  // Helper to build and persist a TriageRecord for guard-terminated paths
  const persistGuardRecord = async (
    guardResult: TriageRecord["guard_result"],
    guardDetail: string,
    domain: string,
    reason: string,
  ): Promise<void> => {
    const record: TriageRecord = {
      failing_item: itemKey,
      error_signature: errorSig,
      guard_result: guardResult,
      guard_detail: guardDetail,
      rag_matches: [],
      rag_selected: null,
      llm_invoked: false,
      domain,
      reason,
      source: "fallback",
      route_to: itemKey,
      cascade: [],
      cycle_count: 0,
      domain_retry_count: 0,
    };
    const evId = config.logger.event("triage.evaluate", itemKey, { ...record });
    config.logger.blob(evId, "error_trace", rawError);
    try { await setLastTriageRecord(slug, record); } catch { /* non-fatal */ }
  };

  // --- Pre-triage guard: SDK timeout → transient retry ---
  if (isOrchestratorTimeout(rawError)) {
    await persistGuardRecord("timeout_bypass", "SDK session timeout", "$SELF", "SDK timeout — transient retry");
    try {
      const result = await resetNodes(slug, itemKey, `SDK timeout in ${itemKey}`, profile.max_reroutes, "reset-for-reroute");
      if (result.halted) {
        config.logger.event("item.end", itemKey, { outcome: "failed", halted: true, error_preview: `${result.cycleCount} reroute cycles exhausted` });
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
    await persistGuardRecord("unfixable_halt", unfixableReason, "blocked", `unfixable signal: ${unfixableReason}`);
    return triggerGracefulDegradation(slug, itemKey, rawError, config, itemSummary);
  }

  // --- Pre-triage guard: death spiral (same error ≥N times, default 3) ---
  const deathSpiralThreshold = config.apmContext.config?.max_same_error_cycles ?? 3;
  try {
    const pipeState = await getStatus(slug);
    const sameSigCount = pipeState.errorLog.filter((e) => e.errorSignature === errorSig).length;
    if (sameSigCount >= deathSpiralThreshold) {
      await persistGuardRecord("death_spiral", `signature ${errorSig} seen ${sameSigCount + 1}×`, "blocked", `death spiral — error signature ${errorSig} seen ${sameSigCount + 1} times`);
      return triggerGracefulDegradation(slug, itemKey, rawError, config, itemSummary);
    }
  } catch { /* continue to triage */ }

  // --- Evaluate triage (2-layer: RAG → LLM → fallback) ---
  const triageResult = await evaluateTriage(rawError, profile, client, slug, config.appRoot, config.logger);

  // --- Resolve route_to from profile routing ---
  let routeToKey: string | null;
  let domainRetryCount = 0;
  if (triageResult.domain === "$SELF") {
    // Fallback: retry the failing node itself
    routeToKey = itemKey;
  } else {
    const routeEntry = profile.routing[triageResult.domain];
    if (!routeEntry || routeEntry.route_to === null) {
      config.logger.event("triage.evaluate", itemKey, {
        domain: triageResult.domain,
        reason: triageResult.reason,
        source: triageResult.source,
        route_to: null,
      });
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
      domainRetryCount = consecutiveCount;
      if (consecutiveCount >= routeEntry.retries) {
        config.logger.event("triage.evaluate", itemKey, {
          domain: triageResult.domain,
          reason: `domain retry cap reached (${consecutiveCount}/${routeEntry.retries})`,
          source: triageResult.source,
        });
        return triggerGracefulDegradation(slug, itemKey, rawError, config, itemSummary);
      }
    }
  }

  // --- Execute reroute: reset target node + DAG cascade ---
  const taggedReason = `[domain:${triageResult.domain}] [source:${triageResult.source}] ${triageResult.reason}`;
  config.logger.event("state.reset", itemKey, {
    route_to: routeToKey,
    domain: triageResult.domain,
    source: triageResult.source,
    reason: triageResult.reason,
  });

  try {
    const result = await resetNodes(slug, routeToKey, taggedReason, profile.max_reroutes, "reset-for-reroute");
    if (result.halted) {
      config.logger.event("item.end", itemKey, { outcome: "failed", halted: true, error_preview: `${result.cycleCount} reroute cycles exhausted` });
      return { summary: itemSummary, halt: true, createPr: false };
    }


    // Assemble and persist the full TriageRecord
    const cascadeKeys = result.state.items
      .filter((it) => it.status === "pending" && it.key !== routeToKey)
      .map((it) => it.key);
    const record: TriageRecord = {
      failing_item: itemKey,
      error_signature: errorSig,
      guard_result: "passed",
      rag_matches: triageResult.rag_matches ?? [],
      rag_selected: triageResult.source === "rag" ? (triageResult.rag_matches?.[0]?.snippet ?? null) : null,
      llm_invoked: triageResult.source === "llm",
      llm_domain: triageResult.source === "llm" ? triageResult.domain : undefined,
      llm_reason: triageResult.source === "llm" ? triageResult.reason : undefined,
      llm_response_ms: triageResult.llm_response_ms,
      domain: triageResult.domain,
      reason: triageResult.reason,
      source: triageResult.source,
      route_to: routeToKey,
      cascade: cascadeKeys,
      cycle_count: result.cycleCount,
      domain_retry_count: domainRetryCount,
    };
    const evId = config.logger.event("triage.evaluate", itemKey, { ...record });
    config.logger.blob(evId, "error_trace", rawError);
    try { await setLastTriageRecord(slug, record); } catch { /* non-fatal */ }

    // Re-index semantic graph after reroute if target involves dev/test nodes
    if (roamAvailable) {
      const targetCat = getWorkflowNode(config.apmContext, routeToKey)?.category;
      if (targetCat === "dev" || targetCat === "test") {
        config.logger.event("tool.call", routeToKey, { tool: "roam", category: "index", detail: " → re-indexing after reroute", is_write: false });
        try {
          execSync("roam index", { cwd: repoRoot, stdio: "inherit", timeout: 120_000 });
        } catch { /* non-fatal */ }
      }
    }
  } catch {
    config.logger.event("item.end", itemKey, { outcome: "error", halted: true, error_preview: "Could not execute reroute" });
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
  config.logger.event("state.salvage", itemKey, { reason: errorMsg.slice(0, 500) });
  try {
    await failItem(slug, itemKey, `BLOCKED: ${errorMsg}`);
    await salvageForDraft(slug, itemKey);
    const draftFlagPath = path.join(config.appRoot, "in-progress", `${slug}.blocked-draft`);
    fs.writeFileSync(draftFlagPath, errorMsg, "utf-8");
  } catch (e) {
    config.logger.event("item.end", itemKey, { outcome: "error", halted: true, error_preview: "Failed to salvage pipeline state" });
    return { summary: itemSummary, halt: true, createPr: false };
  }
  return { summary: itemSummary, halt: false, createPr: false };
}
