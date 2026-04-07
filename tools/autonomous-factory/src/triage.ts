/**
 * triage.ts — Structured error triage for post-deploy failures.
 *
 * Determines which dev items need to be reset when a post-deploy agent
 * (live-ui, integration-test) reports a failure.
 *
 * Routing tiers (evaluated in order):
 *   1. Unfixable error detection → immediate pipeline halt ("blocked")
 *   2. Agent-emitted JSON `TriageDiagnostic` → deterministic fault_domain
 *   3. CI metadata `DOMAIN:` header → deterministic job-based routing
 *   4. Legacy keyword matching → fallback for SDK crashes
 *
 * The LLM classifies the error; the DAG state machine controls execution.
 */

import { TriageDiagnosticSchema } from "./types.js";
import type { FaultDomain, TriageDiagnostic } from "./types.js";
import type { ApmFaultRoute } from "./apm-types.js";

// ---------------------------------------------------------------------------
// Unfixable error signals — no agent can fix these
// ---------------------------------------------------------------------------

const UNFIXABLE_SIGNALS = [
  // Azure AD/Entra specific error codes — definitively non-code-fixable
  "authorization_requestdenied",
  "aadsts700016",
  "aadsts7000215",
  "application.readwrite",
  // Azure resource-level permission errors
  "insufficient privileges",
  "does not have authorization",
  // Azure resource existence errors
  "subscription not found",
  "resource group not found",
  // Terraform state/plan errors — require human intervention (/dagent apply-elevated)
  "cannot apply incomplete plan",
  "error acquiring the state lock",
  "resource already exists",
  "state blob is already locked",
] as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether an error contains signals that no agent can fix.
 * Returns the matching signal reason, or `null` if fixable.
 */
export function isUnfixableError(errorMessage: string): string | null {
  const msg = errorMessage.toLowerCase();
  for (const signal of UNFIXABLE_SIGNALS) {
    if (msg.includes(signal)) return signal;
  }
  return null;
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
export function triageFailure(
  itemKey: string,
  errorMessage: string,
  naItems: Set<string>,
  directories?: Record<string, string | null>,
  ciWorkflowFilePatterns?: string[],
  faultRouting?: Record<string, ApmFaultRoute>,
  /** Workflow nodes for dynamic deploy-augmentation lookup (script_type === "push"|"poll"). */
  nodes?: Record<string, { script_type?: string }>,
): string[] {
  // --- Tier 0: Unfixable error detection → immediate halt ---
  const unfixableReason = isUnfixableError(errorMessage);
  if (unfixableReason) {
    console.log(`  🛑 Unfixable error detected: "${unfixableReason}" — pipeline must halt`);
    return [];
  }

  // --- Tier 1: structured JSON contract (agent-emitted) ---
  // After parsing, run validateFaultDomain() as a Defense-in-Depth sanity check.
  // If keyword signals prove the root cause involves CI/CD (.github/workflows/),
  // augment the reset list with deploy items so the fix actually gets pushed.
  // The dev agent keeps running (it can edit .github/ files) with Fix C's
  // dual-commit instructions telling it to use `agent-commit.sh cicd`.
  const diagnostic = parseTriageDiagnostic(errorMessage);
  if (diagnostic) {
    const { domain: validated, augmentWithDeploy } = validateFaultDomain(
      diagnostic.fault_domain, errorMessage, faultRouting, directories, ciWorkflowFilePatterns,
    );
    console.log(`  🎯 Structured triage: fault_domain=${validated}${augmentWithDeploy ? " (+cicd deploy augmentation)" : ""}`);
    const keys = applyFaultDomain(validated, itemKey, naItems, faultRouting);
    // When cicd root cause is detected, ensure deploy items are in the reset
    // list so the agent's cicd-scope commit gets pushed and verified by CI.
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

  // --- Tier 3: legacy keyword matching (SDK crashes, malformed output) ---
  console.log("  ⚙ Legacy triage: keyword fallback (no structured JSON or DOMAIN header found)");
  return triageByKeywords(itemKey, errorMessage, naItems, faultRouting, directories, ciWorkflowFilePatterns, nodes);
}

/**
 * Attempt to parse a `TriageDiagnostic` from the raw error message.
 * Returns `null` if the message is not valid JSON or fails Zod validation.
 */
export function parseTriageDiagnostic(message: string): TriageDiagnostic | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(message);
  } catch {
    return null;
  }

  const result = TriageDiagnosticSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

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
// Keyword domain detection — shared between Tier 1 validation and Tier 3
// ---------------------------------------------------------------------------

/** Build the CI/CD keyword signal list (includes dynamic workflow patterns) */
function buildCicdSignals(ciWorkflowFilePatterns?: string[]): string[] {
  return [
    ...(ciWorkflowFilePatterns ?? []),
    ".github/workflows", "workflow file",
    "ci failed", "ci timeout",
    "deploy artifact", "package.json type", "type:module",
    "never committed", "working-tree fix",
  ];
}

/** Result of fault domain validation — keeps the original domain but may signal
 *  that deploy items should be added to the reset list for cicd root causes. */
export interface ValidationResult {
  /** The (possibly unchanged) fault domain to route through applyFaultDomain. */
  domain: FaultDomain;
  /** True when cicd root-cause indicators were detected — caller should add
   *  deploy-augmentation nodes to the reset list so the workflow fix gets deployed. */
  augmentWithDeploy: boolean;
}

/** Result of keyword-based domain detection — dynamic map from fault_routing keyword_signals */
export interface KeywordDomainResult {
  /** Dynamic domain hits from fault_routing keyword_signals. */
  matchedDomains: Record<string, boolean>;
  /** Operational signal flags (not domain-specific). */
  hasCicd: boolean;
  hasEnv: boolean;
  hasDeploymentStale: boolean;
}

/**
 * Detect which fault domains are signalled by keywords in the error message.
 * Pure function — no side effects. Used by both `validateFaultDomain()`
 * (Tier 1 sanity check) and `triageByKeywords()` (Tier 3 fallback).
 *
 * Domain-specific signals are driven entirely by `faultRouting[domain].keyword_signals`
 * from workflows.yml. Operational signals (env, deployment-stale, cicd) remain inline
 * because they trigger special routing that bypasses fault_routing.
 */
export function detectKeywordDomains(
  errorMessage: string,
  faultRouting?: Record<string, ApmFaultRoute>,
  directories?: Record<string, string | null>,
  ciWorkflowFilePatterns?: string[],
): KeywordDomainResult {
  const msg = errorMessage.toLowerCase();
  const cicdSignals = buildCicdSignals(ciWorkflowFilePatterns);

  const envSignals = [
    "az login", "credentials", "auth not available", "not authenticated",
    "no credentials", "login required", "identity not found",
    "managed identity", "devcontainer", "defaultazurecredential",
    "interactive login", "device code",
    "access is denied",
    "exiting poll to prevent",
  ];

  const deploymentStaleSignals = [
    "deployment stale", "not in deployed build", "never re-triggered",
    "deployed build contains", "swa deployment stale",
    "function not deployed", "not deployed to azure",
    ...(ciWorkflowFilePatterns ?? []).map((f) => `${f} never`),
  ];

  // Dynamic domain matching from fault_routing keyword_signals
  const matchedDomains: Record<string, boolean> = {};
  if (faultRouting) {
    for (const [domain, route] of Object.entries(faultRouting)) {
      const signals = route.keyword_signals;
      if (signals && signals.length > 0) {
        matchedDomains[domain] = signals.some((s) => msg.includes(s));
      }
    }
  }

  return {
    matchedDomains,
    hasCicd: cicdSignals.some((s) => msg.includes(s)),
    hasEnv: envSignals.some((s) => msg.includes(s)),
    hasDeploymentStale: deploymentStaleSignals.some((s) => msg.includes(s)),
  };
}

/**
 * CI/CD root-cause indicators — phrases in the diagnostic trace that prove
 * the fix is in `.github/workflows/`, not in application code.
 * When these appear AND keyword detection finds cicd signals, the orchestrator
 * overrides the agent's fault_domain to `cicd`.
 */
const CICD_ROOT_CAUSE_INDICATORS = [
  ".github/workflows",
  "never committed",
  "working-tree fix",
  "workflow file",
  "deploy artifact step",
  "deploy package.json",
];

/**
 * Validate an agent-emitted fault_domain against deterministic keyword signals.
 * This is a Defense-in-Depth mechanism: the LLM classifies by symptoms, but the
 * orchestrator detects when CI/CD root-cause indicators prove the fix involves
 * `.github/workflows/` files.
 *
 * IMPORTANT: Does NOT override the domain to "cicd". The "cicd" domain in
 * applyFaultDomain only resets deploy-scope script nodes (which can't
 * edit files). Instead, the function keeps the original domain (so the dev agent
 * runs and can fix the workflow file using Fix C's dual-commit instructions)
 * and signals `augmentWithDeploy: true` so the caller adds deploy items to
 * the reset list.
 *
 * Never augments "cicd" (already routes to deploy), "deployment-stale*"
 * variants (code is correct), "blocked" (unfixable), or "environment" (not a code bug).
 */
export function validateFaultDomain(
  agentDomain: FaultDomain,
  errorMessage: string,
  faultRouting?: Record<string, ApmFaultRoute>,
  directories?: Record<string, string | null>,
  ciWorkflowFilePatterns?: string[],
): ValidationResult {
  // Domains that should never be augmented — operational domains where deploy augmentation is wrong
  const domainStr = agentDomain as string;
  const NO_AUGMENT = new Set(["cicd", "blocked", "environment"]);
  if (NO_AUGMENT.has(domainStr) || domainStr.startsWith("deployment-stale")) {
    return { domain: agentDomain, augmentWithDeploy: false };
  }

  const keywords = detectKeywordDomains(errorMessage, faultRouting, directories, ciWorkflowFilePatterns);

  // Signal deploy augmentation when BOTH conditions are met:
  // 1. Keyword detection finds cicd signals in the error message
  // 2. The raw error message contains root-cause indicators proving the fix
  //    involves .github/workflows/ (not just a symptom mention)
  // The dev agent keeps its original domain so it can edit the workflow file,
  // and the caller adds deploy-augmentation nodes to ensure the fix gets deployed.
  if (keywords.hasCicd) {
    const msgLower = errorMessage.toLowerCase();
    const hasCicdRootCause = CICD_ROOT_CAUSE_INDICATORS.some((s) => msgLower.includes(s));
    if (hasCicdRootCause) {
      console.log(`  ⚠ Triage validation: cicd root cause detected in ${agentDomain} error — augmenting with deploy items`);
      return { domain: agentDomain, augmentWithDeploy: true };
    }
  }

  return { domain: agentDomain, augmentWithDeploy: false };
}

/**
 * Keyword-based triage fallback for unstructured error messages
 * (e.g. SDK session crashes the agent cannot instrument).
 *
 * Domain routing is fully driven by fault_routing keyword_signals from
 * workflows.yml. Operational signals (env, deployment-stale, cicd) remain
 * as inline short-circuits since they bypass fault_routing entirely.
 */
function triageByKeywords(
  itemKey: string,
  errorMessage: string,
  naItems: Set<string>,
  faultRouting?: Record<string, ApmFaultRoute>,
  directories?: Record<string, string | null>,
  ciWorkflowFilePatterns?: string[],
  nodes?: Record<string, { script_type?: string }>,
): string[] {
  const keywords = detectKeywordDomains(errorMessage, faultRouting, directories, ciWorkflowFilePatterns);

  // Environment / auth signals — NOT code bugs, redevelopment won't help.
  if (keywords.hasEnv) {
    console.log(`  ⚠ Environment/auth issue detected — skipping ${itemKey} (not a code bug)`);
    return [itemKey].filter((k) => !naItems.has(k));
  }

  // Deployment-stale signals — deployed artifact is outdated, code is correct.
  // Must be checked BEFORE domain signals to avoid misrouting.
  if (keywords.hasDeploymentStale) {
    console.log("  📦 Deployment-stale detected — routing to re-deploy only (no dev reset)");
    return [...getDeployAugmentationNodes(nodes, naItems), itemKey].filter((k) => !naItems.has(k));
  }

  // Collect all matched fault_routing domains and merge their reset_nodes
  const matchedDomainKeys = Object.entries(keywords.matchedDomains)
    .filter(([, hit]) => hit)
    .map(([domain]) => domain);

  const resetKeys: string[] = [];
  for (const domain of matchedDomainKeys) {
    const domainResets = applyFaultDomain(domain as FaultDomain, itemKey, naItems, faultRouting);
    for (const k of domainResets) {
      if (!resetKeys.includes(k)) resetKeys.push(k);
    }
  }

  // If CI/CD signals detected, also reset deploy items
  if (keywords.hasCicd) {
    for (const k of getDeployAugmentationNodes(nodes, naItems)) {
      if (!resetKeys.includes(k)) resetKeys.push(k);
    }
  }

  // Can't determine root cause → only reset the failing item and let it retry,
  // rather than destroying 45 minutes of completed agent work.
  if (resetKeys.length === 0) {
    console.warn(`  ⚠ Triage could not determine root cause. Retrying ${itemKey} only.`);
    return [itemKey].filter((k) => !naItems.has(k));
  }

  if (!resetKeys.includes(itemKey) && !naItems.has(itemKey)) {
    resetKeys.push(itemKey);
  }
  return resetKeys.filter((k) => !naItems.has(k));
}
