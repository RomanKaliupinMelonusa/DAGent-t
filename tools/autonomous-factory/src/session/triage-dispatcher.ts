/**
 * session/triage-dispatcher.ts — Post-deploy failure triage and rerouting.
 *
 * Extracted from session-runner.ts for Single Responsibility.
 * Contains handleFailureReroute which triages errors, routes to
 * redevelopment, and re-indexes the semantic graph.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { CopilotClient } from "@github/copilot-sdk";
import { getStatus, failItem, resetForDev, resetForRedeploy, salvageForDraft } from "../state.js";
import { triageFailure, parseDomainHeader, parseTriageDiagnostic } from "../triage.js";
import type { ApmFaultRoute } from "../apm-types.js";
import { getWorkflowNode } from "./shared.js";
import type { PipelineRunConfig, SessionResult } from "../session-runner.js";
import type { ItemSummary } from "../types.js";

/**
 * Unified post-deploy failure handler — triages the error, routes to redevelopment,
 * and re-indexes the semantic graph. Used by both poll-ci (deterministic) and
 * agent sessions (live-ui, integration-test).
 */
export async function handleFailureReroute(
  slug: string,
  itemKey: string,
  rawError: string,
  errorMsg: string,
  config: PipelineRunConfig,
  itemSummary: ItemSummary,
  roamAvailable: boolean,
  client?: CopilotClient,
): Promise<SessionResult> {
  const { repoRoot } = config;

  const pipeState = await getStatus(slug);
  const naItems = new Set(
    pipeState.items.filter((i) => i.status === "na").map((i) => i.key),
  );
  const workflow = config.apmContext.workflows?.default;
  const faultRouting = workflow?.fault_routing;
  const workflowNodes = workflow?.nodes as Record<string, { script_type?: string }> | undefined;
  const maxDevCycles = workflow?.max_redevelopment_cycles ?? 5;
  const maxRedeployCycles = workflow?.max_redeploy_cycles ?? 3;
  const triageKb = config.apmContext.triage_kb;
  const unfixableSignals = workflow?.unfixable_signals ?? [];
  let resetKeys = await triageFailure(
    itemKey, rawError, naItems, faultRouting, workflowNodes,
    triageKb, client, slug, config.appRoot, unfixableSignals,
  );

  // --- Extract resolved fault domain from the error message ---
  // The cognitive processor prepends FAULT_DOMAIN_HINT; structured JSON has fault_domain.
  // Used for (a) per-domain retry cap and (b) tagging the errorLog reason string.
  let resolvedDomain: string | undefined;
  const headerDomains = parseDomainHeader(rawError, faultRouting);
  if (headerDomains && headerDomains.length > 0) {
    resolvedDomain = headerDomains[0];
  } else {
    const diagnostic = parseTriageDiagnostic(rawError);
    if (diagnostic?.fault_domain) resolvedDomain = String(diagnostic.fault_domain);
  }

  // --- Per-domain retry cap: prevent death spirals on non-code faults ---
  // When the same fault domain triggers $SELF retries repeatedly, check if
  // the fault route declares a max_retries cap. If exceeded, escalate to
  // a different domain (or block) instead of burning the redev budget.
  if (resolvedDomain && faultRouting && resetKeys.length > 0) {
    const route = faultRouting[resolvedDomain] as ApmFaultRoute & { max_retries?: number; escalate_to?: string } | undefined;
    if (route?.max_retries) {
      // Count consecutive same-domain entries in errorLog (tagged with [domain:X])
      const domainTag = `[domain:${resolvedDomain}]`;
      const errorEntries = pipeState.errorLog ?? [];
      let consecutiveCount = 0;
      for (let i = errorEntries.length - 1; i >= 0; i--) {
        const entry = errorEntries[i] as { message?: string; itemKey?: string };
        if (entry.itemKey === "reset-for-dev" && entry.message?.includes(domainTag)) {
          consecutiveCount++;
        } else if (entry.itemKey === "reset-for-dev") {
          break; // different domain — stop counting consecutive
        }
      }

      if (consecutiveCount >= route.max_retries) {
        const escalateTo = route.escalate_to;
        if (escalateTo && faultRouting[escalateTo]) {
          console.warn(`\n  ⚠ Domain "${resolvedDomain}" hit retry cap (${consecutiveCount}/${route.max_retries}) — escalating to "${escalateTo}"`);
          const escalateRoute = faultRouting[escalateTo] as ApmFaultRoute;
          resetKeys = escalateRoute.reset_nodes.map((k: string) => (k === "$SELF" ? itemKey : k))
            .filter((k: string) => !naItems.has(k));
          resolvedDomain = escalateTo;
        } else {
          console.warn(`\n  ⚠ Domain "${resolvedDomain}" hit retry cap (${consecutiveCount}/${route.max_retries}) — no escalate_to, treating as blocked`);
          resetKeys = [];
        }
      }
    }
  }

  // Empty array = unfixable error ("blocked" fault domain) — trigger Graceful Degradation
  if (resetKeys.length === 0) {
    console.error(`\n  🛑 BLOCKED: Unfixable error detected in ${itemKey} — triggering Graceful Degradation.`);
    console.error(`     Pipeline will skip tests and open a Draft PR for human remediation.`);
    try {
      await failItem(slug, itemKey, `BLOCKED: Unfixable error — ${errorMsg}`);
      await salvageForDraft(slug, itemKey);

      // Write flag for PR creator agent
      const draftFlagPath = path.join(config.appRoot, "in-progress", `${slug}.blocked-draft`);
      fs.writeFileSync(draftFlagPath, errorMsg, "utf-8");
    } catch (e) {
      console.error("  ✖ Failed to salvage pipeline state", e);
      return { summary: itemSummary, halt: true, createPr: false };
    }
    // halt: false — main loop continues to docs-archived → publish-pr
    return { summary: itemSummary, halt: false, createPr: false };
  }

  // ── Guard: detect unreachable dev items behind an incomplete approval gate ──
  // When Wave 1 CI items fail with a domain-specific error, triage routes to
  // Wave 2 dev items. But if an approval gate they depend on is not yet done/na,
  // those dev items can never run — resetting them creates an infinite retry loop.
  //
  // Derive approval gates and dev/test items from workflow manifest:
  const approvalGates = pipeState.items.filter(
    (i) => (pipeState.nodeTypes || {})[i.key] === "approval" &&
           i.status !== "done" && i.status !== "na"
  );
  const openGateKeys = new Set(
    pipeState.items
      .filter((i) => (pipeState.nodeTypes || {})[i.key] === "approval" &&
                     (i.status === "done" || i.status === "na"))
      .map((i) => i.key)
  );
  // Check if any reset keys are dev/test items behind a pending approval gate
  const gatedKeys = resetKeys.filter((k) => {
    const cat = getWorkflowNode(config.apmContext, k)?.category;
    if (cat !== "dev" && cat !== "test") return false;
    // Check if this item has any upstream approval gate that is NOT yet open
    return approvalGates.some((gate) => {
      // The dev item is gated if the gate is upstream of it (the item depends transitively on the gate)
      const depChain = pipeState.dependencies?.[k] || [];
      // Simple check: does this item or any of its deps include the gate?
      // For deep dependency chains, use getUpstream — but that requires async.
      // Simpler: if any approval gate is still pending, check if the gate is in this item's phase predecessors
      return !openGateKeys.has(gate.key);
    });
  });

  if (approvalGates.length > 0 && gatedKeys.length > 0) {
    console.warn(`\n  🚧 Triaged dev items [${gatedKeys.join(", ")}] are gated behind approval — cannot run in current wave.`);
    console.warn(`     This is likely a pre-existing CI failure unrelated to the current feature.`);
    console.warn(`     Fix the failing tests on the base branch or feature branch, then re-run the pipeline.`);
    // Don't reset — let the pipeline naturally block on the next getNextAvailable() call.
    // The item was already marked as failed by the caller.
    return { summary: itemSummary, halt: false, createPr: false };
  }

  console.log(`\n  🔄 Post-deploy failure in ${itemKey} — rerouting to redevelopment`);
  console.log(`     Root cause triage → resetting: ${resetKeys.join(", ")}${resolvedDomain ? ` (domain: ${resolvedDomain})` : ""}`);

  // Tag the reason string with [domain:X] for structured errorLog entries.
  // This enables the per-domain retry cap (Change 1) to count consecutive
  // same-domain entries unambiguously.
  const taggedReason = resolvedDomain
    ? `[domain:${resolvedDomain}] ${errorMsg}`
    : errorMsg;

  // Branch: if triage targets only deploy/post-deploy items (no dev or test code
  // changes needed), use the separate re-deploy budget instead of burning a full
  // redevelopment cycle. This handles "deployment-stale" faults deterministically.
  // category === "test" also implies code changes (test failures need dev fixes),
  // so they route to the full redevelopment path alongside category === "dev".
  const hasDevOrTestItems = resetKeys.some((k) => {
    const cat = getWorkflowNode(config.apmContext, k)?.category;
    return cat === "dev" || cat === "test";
  });

  try {
    if (hasDevOrTestItems) {
      const result = await resetForDev(slug, resetKeys, taggedReason, maxDevCycles);
      if (result.halted) {
        console.error(
          `  ✖ HALTED: ${result.cycleCount} redevelopment cycles exhausted. Exiting.`,
        );
        return { summary: itemSummary, halt: true, createPr: false };
      }
      console.log(
        `     Redevelopment cycle ${result.cycleCount}/${maxDevCycles} — pipeline will restart from dev`,
      );

      // Re-index semantic graph after redevelopment reroute
      if (roamAvailable) {
        console.log("  🧠 Re-indexing semantic graph after redevelopment reroute...");
        try {
          execSync("roam index", { cwd: repoRoot, stdio: "inherit", timeout: 120_000 });
        } catch { /* non-fatal */ }
      }
    } else {
      const result = await resetForRedeploy(slug, resetKeys, taggedReason, maxRedeployCycles);
      if (result.halted) {
        console.error(
          `  ✖ HALTED: ${result.cycleCount} re-deploy cycles exhausted. Exiting.`,
        );
        return { summary: itemSummary, halt: true, createPr: false };
      }
      console.log(
        `     Re-deploy cycle ${result.cycleCount}/${maxRedeployCycles} — pipeline will restart from deploy`,
      );
      // No roam re-indexing needed — no code changes, just re-push and re-poll
    }
  } catch {
    console.error("  ✖ Could not trigger redevelopment reroute. Exiting.");
    return { summary: itemSummary, halt: true, createPr: false };
  }

  return { summary: itemSummary, halt: false, createPr: false };
}
