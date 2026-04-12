/**
 * triage.ts — Structured error triage for post-deploy failures.
 *
 * Determines which dev items need to be reset when a post-deploy agent
 * (live-ui, integration-test) reports a failure.
 *
 * Routing tiers (evaluated in order):
 *   0. Unfixable error detection → immediate pipeline halt ("blocked")
 *   1. Agent-emitted JSON `TriageDiagnostic` → deterministic fault_domain
 *   2. CI metadata `DOMAIN:` header → deterministic job-based routing
 *   3. Local RAG retriever → deterministic substring match from triage packs
 *   4. LLM Router → cognitive classification of novel errors
 *
 * The retriever/LLM classifies the error; the DAG state machine controls execution.
 */

import type { CopilotClient } from "@github/copilot-sdk";
import { parseTriageDiagnostic } from "./types.js";
import type { FaultDomain } from "./types.js";
import type { ApmFaultRoute, TriageSignature } from "./apm-types.js";
import { retrieveTopMatches } from "./triage/retriever.js";
import { askLlmRouter } from "./triage/llm-router.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether an error contains signals that no agent can fix.
 * Returns the matching signal reason, or `null` if fixable.
 */
export function isUnfixableError(errorMessage: string, unfixableSignals: string[]): string | null {
  const msg = errorMessage.toLowerCase();
  for (const signal of unfixableSignals) {
    if (msg.includes(signal)) return signal;
  }
  return null;
}

/**
 * Check whether the error is an SDK/orchestrator session timeout.
 * These must be intercepted BEFORE semantic triage — they are infrastructure
 * errors, not codebase errors, and must never reach the RAG/LLM router.
 *
 * Requires BOTH "timeout after Nms" AND "session.idle" to avoid matching
 * Playwright test timeouts (which route to `test-code` domain instead).
 */
export function isOrchestratorTimeout(errorMessage: string): boolean {
  return /timeout after \d+ms/i.test(errorMessage)
      && /waiting for session\.idle/i.test(errorMessage);
}

/**
 * Examine the failure message from a post-deploy item and determine which
 * dev items + test items need to be reset.
 *
 * Filters out items that are N/A for this workflow type.
 * Returns the item keys to pass to `resetForDev` (deploy items are added
 * automatically by the state machine).
 *
 * Returns an empty array `[]` when the error is unfixable ("blocked") —
 * the caller must halt the pipeline immediately.
 */
export async function triageFailure(
  itemKey: string,
  errorMessage: string,
  naItems: Set<string>,
  faultRouting?: Record<string, ApmFaultRoute>,
  /** Workflow nodes for dynamic deploy-augmentation lookup (script_type === "push"|"poll"). */
  nodes?: Record<string, { script_type?: string }>,
  /** Triage knowledge base — flattened signatures from .apm/triage-packs/. */
  triageKb?: TriageSignature[],
  /** Copilot SDK client for LLM fallback triage. */
  client?: CopilotClient,
  /** Feature slug (for novel triage log). */
  slug?: string,
  /** App root path (for novel triage log). */
  appRoot?: string,
  /** Error substrings that signal unfixable conditions (from workflows.yml). */
  unfixableSignals?: string[],
): Promise<string[]> {
  // --- Tier -1: SDK/orchestrator timeout bypass — NEVER send to semantic triage ---
  // These are infrastructure timeouts (session.idle), not codebase errors.
  // Sending them to the RAG/LLM router causes misclassification as "blocked".
  //
  // Returns [] (graceful degradation) rather than [itemKey] (retry) because:
  // 1. Retries burn redevelopment cycles then hard-halt via circuit breaker
  //    (test-category items lack the dev-only salvageForDraft fallback)
  // 2. [] triggers salvageForDraft → salvage survivors (docs, cleanup, PR) still run
  // 3. The Tier -1 log gives operators the correct "SDK Timeout" diagnostic
  if (isOrchestratorTimeout(errorMessage)) {
    console.log(`  ⚠ SDK Timeout detected in ${itemKey}. Bypassing semantic triage — triggering graceful degradation.`);
    return [];
  }

  // --- Tier 0: Unfixable error detection → immediate halt ---
  const unfixableReason = isUnfixableError(errorMessage, unfixableSignals ?? []);
  if (unfixableReason) {
    console.log(`  🛑 Unfixable error detected: "${unfixableReason}" — pipeline must halt`);
    return [];
  }

  // --- Tier 1: structured JSON contract (agent-emitted) ---
  const diagnostic = parseTriageDiagnostic(errorMessage);
  if (diagnostic) {
    const { domain: validated, augmentWithDeploy } = validateFaultDomain(
      diagnostic.fault_domain, errorMessage, faultRouting, triageKb,
    );
    console.log(`  🎯 Structured triage: fault_domain=${validated}${augmentWithDeploy ? " (+cicd deploy augmentation)" : ""}`);
    const keys = applyFaultDomain(validated, itemKey, naItems, faultRouting);
    if (augmentWithDeploy) {
      for (const k of getDeployAugmentationNodes(nodes, naItems)) {
        if (!keys.includes(k)) keys.push(k);
      }
    }
    return keys;
  }

  // --- Tier 2: CI metadata DOMAIN: header (from poll-ci.sh) ---
  const headerDomains = parseDomainHeader(errorMessage, faultRouting);
  if (headerDomains) {
    console.log(`  📋 CI metadata triage: DOMAIN=${headerDomains.join(",")}`);
    const keys: string[] = [];
    for (const domain of headerDomains) {
      for (const k of applyFaultDomain(domain as FaultDomain, itemKey, naItems, faultRouting)) {
        if (!keys.includes(k)) keys.push(k);
      }
    }
    return keys;
  }

  // --- Tier 3: Local RAG retriever (triage pack substring match) ---
  const topMatches = triageKb && triageKb.length > 0
    ? retrieveTopMatches(errorMessage, triageKb)
    : [];

  if (topMatches.length > 0) {
    const bestMatch = topMatches[0];
    console.log(`  🔍 RAG triage: matched "${bestMatch.error_snippet}" → ${bestMatch.fault_domain} (${bestMatch.reason})`);
    const keys = applyFaultDomain(bestMatch.fault_domain as FaultDomain, itemKey, naItems, faultRouting);
    if (keys.length > 0) return keys;
    // If applyFaultDomain returned empty (unknown domain in routing table),
    // fall through to LLM for classification
    console.log(`  ⚠ RAG match domain "${bestMatch.fault_domain}" not in fault_routing — falling through to LLM`);
  }

  // --- Tier 4: LLM Router (cognitive fallback for novel errors) ---
  if (client && faultRouting && slug && appRoot) {
    console.log("  🤖 LLM triage: classifying novel error via Copilot SDK");
    const domains = Object.keys(faultRouting);
    const result = await askLlmRouter(client, errorMessage, domains, topMatches, slug, appRoot, faultRouting);
    console.log(`  🤖 LLM triage result: fault_domain=${result.fault_domain} (${result.reason})`);
    const keys = applyFaultDomain(result.fault_domain as FaultDomain, itemKey, naItems, faultRouting);
    if (keys.length > 0) return keys;
    // "blocked" domain returns [] from applyFaultDomain — this is correct,
    // it signals the caller to halt the pipeline.
    return [];
  }

  // --- No retriever hits and no LLM available — retry the failing item only ---
  console.warn(`  ⚠ Triage could not determine root cause (no RAG matches, no LLM). Retrying ${itemKey} only.`);
  return [itemKey].filter((k) => !naItems.has(k));
}

// Re-export parseTriageDiagnostic from types.ts for backward compatibility.
// The function lives in types.ts to break the circular dependency:
// triage.ts → triage/retriever.ts → session/shared.ts → triage.ts
export { parseTriageDiagnostic } from "./types.js";

/**
 * Parse the `DOMAIN:` header from the first line of a CI diagnostic file.
 * Returns an array of matched domain strings that exist as keys in `faultRouting`,
 * or `null` if the header is absent, empty, or no domains match.
 *
 * Format: `DOMAIN: service-a,service-b` (comma-separated domain names)
 * Matching: Each comma-separated value is checked against `faultRouting` keys.
 *           Only values that exist as keys are returned. If none match, returns `null`
 *           to fall through to keyword matching.
 *
 * Examples (with appropriate faultRouting keys):
 *   - "DOMAIN: service-a"              → ["service-a"]
 *   - "DOMAIN: service-a,service-b"    → ["service-a", "service-b"]
 *   - "DOMAIN: schemas"                → ["schemas"]
 *   - "DOMAIN: unknown"                → null (fall through)
 *   - "DOMAIN: ios"                    → ["ios"] (if "ios" exists in faultRouting)
 */
export function parseDomainHeader(
  message: string,
  faultRouting?: Record<string, ApmFaultRoute>,
): string[] | null {
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  const match = /^DOMAIN:\s*(.+)$/i.exec(firstLine);
  if (!match) return null;

  const domains = match[1].split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (domains.length === 0 || domains.includes("unknown")) return null;

  // Return only domains that exist as keys in faultRouting
  const matched = faultRouting
    ? domains.filter((d) => d in faultRouting)
    : domains; // When no faultRouting, pass all parsed domains through
  return matched.length > 0 ? matched : null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Dynamically discover deploy-augmentation nodes from the workflow DAG.
 * Returns all node keys where `script_type` is "push" or "poll", filtered by `naItems`.
 * When no `nodes` dictionary is provided, returns an empty array (graceful degradation).
 */
function getDeployAugmentationNodes(
  nodes?: Record<string, { script_type?: string }>,
  naItems?: Set<string>,
): string[] {
  if (!nodes) return [];
  return Object.entries(nodes)
    .filter(([, n]) => n.script_type === "push" || n.script_type === "poll")
    .map(([key]) => key)
    .filter((k) => !naItems?.has(k));
}

/**
 * Map a validated `FaultDomain` to the set of pipeline item keys that need reset.
 *
 * When `faultRouting` is provided (from workflows.yml), performs a WYSIWYG lookup:
 * the YAML declares exactly what gets reset. "$SELF" is replaced with `itemKey`.
 * No hidden appending — if the domain needs to reset the calling item, it must
 * include "$SELF" in `reset_nodes`.
 *
 * When `faultRouting` is undefined or the domain is not found, returns `[]`
 * (graceful degradation — the caller interprets this as "blocked").
 */
function applyFaultDomain(
  domain: FaultDomain,
  itemKey: string,
  naItems: Set<string>,
  faultRouting?: Record<string, ApmFaultRoute>,
): string[] {
  const route = faultRouting?.[domain as string];
  if (!route) {
    // No routing table or unknown domain → graceful degradation
    return [];
  }

  const resetKeys = route.reset_nodes.map((k: string) => (k === "$SELF" ? itemKey : k));
  // Deduplicate (e.g. if $SELF expands to a key already in the list)
  return [...new Set(resetKeys)].filter((k: string) => !naItems.has(k));
}

// ---------------------------------------------------------------------------
// CI/CD deploy augmentation — Defense-in-Depth for Tier 1
// ---------------------------------------------------------------------------

/** Result of fault domain validation — keeps the original domain but may signal
 *  that deploy items should be added to the reset list for cicd root causes. */
export interface ValidationResult {
  /** The (possibly unchanged) fault domain to route through applyFaultDomain. */
  domain: FaultDomain;
  /** True when cicd root-cause indicators were detected — caller should add
   *  deploy-augmentation nodes to the reset list so the workflow fix gets deployed. */
  augmentWithDeploy: boolean;
}

/**
 * Validate an agent-emitted fault_domain against deterministic signals.
 * Defense-in-Depth: detects when CI/CD root-cause indicators prove the fix
 * involves `.github/workflows/` files.
 *
 * Uses the local retriever to check for cicd-domain triage pack matches
 * (signals migrated from the former hardcoded CICD_ROOT_CAUSE_INDICATORS array
 * into `.apm/triage-packs/cicd-root-cause.json`).
 *
 * Never augments "cicd" (already routes to deploy), "deployment-stale*"
 * variants (code is correct), "blocked" (unfixable), or "environment" (not a code bug).
 */
export function validateFaultDomain(
  agentDomain: FaultDomain,
  errorMessage: string,
  faultRouting?: Record<string, ApmFaultRoute>,
  triageKb?: TriageSignature[],
): ValidationResult {
  const domainStr = agentDomain as string;
  const NO_AUGMENT = new Set(["cicd", "blocked", "environment"]);
  if (NO_AUGMENT.has(domainStr) || domainStr.startsWith("deployment-stale")) {
    return { domain: agentDomain, augmentWithDeploy: false };
  }

  // Check triage KB for cicd-domain matches (includes former CICD_ROOT_CAUSE_INDICATORS)
  const hasCicdKbMatch = triageKb
    ? retrieveTopMatches(errorMessage, triageKb).some((m) => m.fault_domain === "cicd")
    : false;

  if (hasCicdKbMatch) {
    console.log(`  ⚠ Triage validation: cicd root cause detected in ${agentDomain} error — augmenting with deploy items`);
    return { domain: agentDomain, augmentWithDeploy: true };
  }

  return { domain: agentDomain, augmentWithDeploy: false };
}
