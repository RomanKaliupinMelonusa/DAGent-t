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
      diagnostic.fault_domain, errorMessage, directories, ciWorkflowFilePatterns,
    );
    console.log(`  🎯 Structured triage: fault_domain=${validated}${augmentWithDeploy ? " (+cicd deploy augmentation)" : ""}`);
    const keys = applyFaultDomain(validated, itemKey, naItems);
    // When cicd root cause is detected, ensure deploy items are in the reset
    // list so the agent's cicd-scope commit gets pushed and verified by CI.
    if (augmentWithDeploy) {
      for (const k of ["push-app", "poll-app-ci"]) {
        if (!naItems.has(k) && !keys.includes(k)) keys.push(k);
      }
    }
    return keys;
  }

  // --- Tier 2: CI metadata DOMAIN: header (from poll-ci.sh) ---
  const headerResult = parseDomainHeader(errorMessage);
  if (headerResult) {
    if (headerResult.hasSchemas) {
      // Schema failures cascade to schema-dev + all downstream dev/test items.
      // applyFaultDomain("both") would miss schema-dev, so expand explicitly.
      console.log(`  📋 CI metadata triage: DOMAIN=${headerResult.domain} (schema cascade)`);
      const keys = ["schema-dev", "infra-architect", "backend-dev", "backend-unit-test", "frontend-dev", "frontend-unit-test", itemKey];
      return keys.filter((k) => !naItems.has(k));
    }
    console.log(`  📋 CI metadata triage: DOMAIN=${headerResult.domain}`);
    return applyFaultDomain(headerResult.domain, itemKey, naItems);
  }

  // --- Tier 3: legacy keyword matching (SDK crashes, malformed output) ---
  console.log("  ⚙ Legacy triage: keyword fallback (no structured JSON or DOMAIN header found)");
  return triageByKeywords(itemKey, errorMessage, naItems, directories, ciWorkflowFilePatterns);
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
 * Returns a routing result if the header is present and maps to known domains,
 * or `null` if the header is absent, empty, or maps to "unknown".
 *
 * Format: `DOMAIN: backend,frontend` (comma-separated domains)
 * Mapping:
 *   - "backend"            → { domain: "backend", hasSchemas: false }
 *   - "frontend"           → { domain: "frontend", hasSchemas: false }
 *   - "backend,frontend"   → { domain: "both", hasSchemas: false }
 *   - "schemas"            → { domain: "both", hasSchemas: true }
 *   - "schemas,backend"    → { domain: "both", hasSchemas: true }
 *   - "unknown"            → null (fall through to keyword matching)
 */
export function parseDomainHeader(message: string): { domain: FaultDomain; hasSchemas: boolean } | null {
  const firstLine = message.split("\n")[0]?.trim() ?? "";
  const match = /^DOMAIN:\s*(.+)$/i.exec(firstLine);
  if (!match) return null;

  const domains = match[1].split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (domains.length === 0 || domains.includes("unknown")) return null;

  const hasBackend = domains.includes("backend");
  const hasFrontend = domains.includes("frontend");
  const hasSchemas = domains.includes("schemas");
  const hasInfra = domains.includes("infra");

  // Schemas cascade to all downstream
  if (hasSchemas) return { domain: "both", hasSchemas: true };
  // Infrastructure failures route to infra domain
  if (hasInfra && !hasBackend && !hasFrontend) return { domain: "infra", hasSchemas: false };
  if (hasBackend && hasFrontend) return { domain: "both", hasSchemas: false };
  if (hasBackend) return { domain: "backend", hasSchemas: false };
  if (hasFrontend) return { domain: "frontend", hasSchemas: false };
  if (hasInfra) return { domain: "infra", hasSchemas: false };

  // Unrecognized domain tags → fall through to keyword matching
  return null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Default directory-path signals used when no APM directories config is provided */
const DEFAULT_DIR_SIGNALS: { backend: string[]; frontend: string[] } = {
  backend: ["/backend/"],
  frontend: ["/frontend/", "/e2e/"],
};

/**
 * Build directory-path triage signals from APM config.directories.
 * Maps APM directory keys to triage domains:
 *   - backend, infra → backend domain
 *   - frontend, e2e → frontend domain
 * Schemas are intentionally excluded — handled by schemaSignals which
 * correctly cascades to ALL downstream (not just one domain).
 */
function buildDirectoryPathSignals(
  directories?: Record<string, string | null>,
): { backend: string[]; frontend: string[] } {
  if (!directories) return DEFAULT_DIR_SIGNALS;

  const backendKeys = ["backend", "infra"];
  const frontendKeys = ["frontend", "e2e"];

  const toPatterns = (keys: string[]): string[] =>
    keys
      .map((k) => directories[k])
      .filter((v): v is string => v != null && v.length > 0)
      .map((v) => `/${v}/`);

  const backend = toPatterns(backendKeys);
  const frontend = toPatterns(frontendKeys);

  // Fall back to defaults if APM config yields empty arrays (misconfigured manifest)
  return {
    backend: backend.length > 0 ? backend : DEFAULT_DIR_SIGNALS.backend,
    frontend: frontend.length > 0 ? frontend : DEFAULT_DIR_SIGNALS.frontend,
  };
}

/**
 * Map a validated `FaultDomain` to the set of pipeline item keys that need reset.
 */
function applyFaultDomain(domain: FaultDomain, itemKey: string, naItems: Set<string>): string[] {
  const resetKeys: string[] = [];

  switch (domain) {
    case "backend":
      resetKeys.push("backend-dev", "backend-unit-test");
      break;
    case "frontend":
      resetKeys.push("frontend-dev", "frontend-unit-test");
      break;
    case "both":
      resetKeys.push("backend-dev", "backend-unit-test", "frontend-dev", "frontend-unit-test");
      break;
    case "frontend+infra":
      resetKeys.push("frontend-dev", "frontend-unit-test");
      break;
    case "backend+infra":
      resetKeys.push("backend-dev", "backend-unit-test");
      break;
    case "cicd":
      // CI/CD workflow file issue — route to push-app + poll-app-ci for the
      // deploy-manager agent which has the correct commit scope for .github/
      resetKeys.push("push-app", "poll-app-ci");
      break;
    case "deployment-stale":
      // Deployed artifact is outdated but code on branch is correct.
      // Only re-deploy — do NOT reset dev items (code doesn't need fixing).
      resetKeys.push("push-app", "poll-app-ci");
      break;
    case "deployment-stale-backend":
      // Backend deployment stale — only re-deploy and re-run backend post-deploy test.
      resetKeys.push("push-app", "poll-app-ci");
      break;
    case "deployment-stale-frontend":
      // Frontend deployment stale — only re-deploy and re-run frontend post-deploy test.
      resetKeys.push("push-app", "poll-app-ci");
      break;
    case "infra":
      // Infrastructure error — route to full Wave 1 redevelopment cascade
      resetKeys.push(
        "infra-architect",
        "push-infra",
        "poll-infra-plan",
        "create-draft-pr",
        "await-infra-approval",
        "infra-handoff",
      );
      break;
    case "test-code":
      // Zero cascade — only reset the test agent that wrote the broken test.
      return [itemKey].filter((k) => !naItems.has(k));
    case "blocked":
      // Unfixable error — no items to reset, pipeline must halt.
      return [];
    case "environment":
      // Not a code bug — only reset the post-deploy item itself.
      return [itemKey].filter((k) => !naItems.has(k));
  }

  if (!resetKeys.includes(itemKey)) resetKeys.push(itemKey);
  return resetKeys.filter((k) => !naItems.has(k));
}

// ---------------------------------------------------------------------------
// Keyword domain detection — shared between Tier 1 validation and Tier 3
// ---------------------------------------------------------------------------

/** Keyword signals grouped by domain */
const BACKEND_SIGNALS = [
  "api", "endpoint", "500", "502", "503", "504", "function",
  "timeout", "backend",
  "cosmos", "storage", "queue", "apim", "gateway",
  "empty response", "response format", "data mapping", "404",
];
const FRONTEND_SIGNALS = [
  "ui", "frontend", "component", "page", "render", "selector",
  "testid", "element", "visible", "screenshot", "html", "css",
  "navigation", "route", "display", "button", "form", "modal",
  "handler", "event binding", "javascript error", "console error",
  "click", "data mapping",
];
const INFRA_SIGNALS = [
  "terraform", "tfstate", "state lock", "provider registry",
  ".tf", "resource already exists", "azurerm_", "azapi_",
  "terraform plan", "terraform apply", "terraform init",
  "hcl", "provider configuration",
  "cors", "access-control-allow-origin",
];
const SCHEMA_SIGNALS = [
  "packages/schemas", "@branded/schemas", "schema-dev",
  "schema validation", "schema build",
];

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
   *  push-app + poll-app-ci to the reset list so the workflow fix gets deployed. */
  augmentWithDeploy: boolean;
}

/** Result of keyword-based domain detection */
export interface KeywordDomainResult {
  hasBackend: boolean;
  hasFrontend: boolean;
  hasCicd: boolean;
  hasInfra: boolean;
  hasSchema: boolean;
  hasEnv: boolean;
  hasDeploymentStale: boolean;
}

/**
 * Detect which fault domains are signalled by keywords in the error message.
 * Pure function — no side effects. Used by both `validateFaultDomain()`
 * (Tier 1 sanity check) and `triageByKeywords()` (Tier 3 fallback).
 */
export function detectKeywordDomains(
  errorMessage: string,
  directories?: Record<string, string | null>,
  ciWorkflowFilePatterns?: string[],
): KeywordDomainResult {
  const msg = errorMessage.toLowerCase();
  const directoryPathSignals = buildDirectoryPathSignals(directories);
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

  return {
    hasBackend: BACKEND_SIGNALS.some((s) => msg.includes(s))
      || directoryPathSignals.backend.some((s) => msg.includes(s)),
    hasFrontend: FRONTEND_SIGNALS.some((s) => msg.includes(s))
      || directoryPathSignals.frontend.some((s) => msg.includes(s)),
    hasCicd: cicdSignals.some((s) => msg.includes(s)),
    hasInfra: INFRA_SIGNALS.some((s) => msg.includes(s)),
    hasSchema: SCHEMA_SIGNALS.some((s) => msg.includes(s)),
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
 * applyFaultDomain only resets push-app + poll-app-ci (shell scripts that can't
 * edit files). Instead, the function keeps the original domain (so the dev agent
 * runs and can fix the workflow file using Fix C's dual-commit instructions)
 * and signals `augmentWithDeploy: true` so the caller adds deploy items to
 * the reset list.
 *
 * Never augments "cicd" (already routes to deploy), "deployment-stale",
 * "deployment-stale-backend", "deployment-stale-frontend" (code is correct),
 * "blocked" (unfixable), or "environment" (not a code bug).
 */
export function validateFaultDomain(
  agentDomain: FaultDomain,
  errorMessage: string,
  directories?: Record<string, string | null>,
  ciWorkflowFilePatterns?: string[],
): ValidationResult {
  // Domains that should never be augmented
  const NO_AUGMENT: Set<FaultDomain> = new Set(["cicd", "deployment-stale", "deployment-stale-backend", "deployment-stale-frontend", "blocked", "environment"]);
  if (NO_AUGMENT.has(agentDomain)) return { domain: agentDomain, augmentWithDeploy: false };

  const keywords = detectKeywordDomains(errorMessage, directories, ciWorkflowFilePatterns);

  // Signal deploy augmentation when BOTH conditions are met:
  // 1. Keyword detection finds cicd signals in the error message
  // 2. The raw error message contains root-cause indicators proving the fix
  //    involves .github/workflows/ (not just a symptom mention)
  // The dev agent keeps its original domain so it can edit the workflow file,
  // and the caller adds push-app + poll-app-ci to ensure the fix gets deployed.
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
 * Legacy keyword-based triage preserved as a fallback for unstructured error
 * messages (e.g. SDK session crashes the agent cannot instrument).
 */
function triageByKeywords(
  itemKey: string,
  errorMessage: string,
  naItems: Set<string>,
  directories?: Record<string, string | null>,
  ciWorkflowFilePatterns?: string[],
): string[] {
  const resetKeys: string[] = [];

  const keywords = detectKeywordDomains(errorMessage, directories, ciWorkflowFilePatterns);

  // Environment / auth signals — NOT code bugs, redevelopment won't help.
  if (keywords.hasEnv) {
    console.log(`  ⚠ Environment/auth issue detected — skipping ${itemKey} (not a code bug)`);
    return [itemKey].filter((k) => !naItems.has(k));
  }

  // Deployment-stale signals — deployed artifact is outdated, code is correct.
  // Must be checked BEFORE backend/frontend signals to avoid misrouting.
  if (keywords.hasDeploymentStale) {
    console.log("  📦 Deployment-stale detected — routing to re-deploy only (no dev reset)");
    return ["push-app", "poll-app-ci", itemKey].filter((k) => !naItems.has(k));
  }

  // Infrastructure issues route to infra-architect (never to app dev agents)
  if (keywords.hasInfra && !keywords.hasBackend && !keywords.hasFrontend && !keywords.hasSchema && !keywords.hasCicd) {
    resetKeys.push("infra-architect");
  }
  // CI/CD workflow issues take priority — dev agents can't fix .github/ files
  else if (keywords.hasCicd && !keywords.hasBackend && !keywords.hasFrontend && !keywords.hasSchema) {
    resetKeys.push("push-app", "poll-app-ci");
  } else {
    if (keywords.hasSchema) {
      // Schema failures cascade to both backend and frontend
      resetKeys.push("schema-dev", "infra-architect", "backend-dev", "backend-unit-test", "frontend-dev", "frontend-unit-test");
    } else {
      if (keywords.hasBackend) {
        resetKeys.push("backend-dev", "backend-unit-test");
      }
      if (keywords.hasFrontend) {
        resetKeys.push("frontend-dev", "frontend-unit-test");
      }
    }
    // If CI/CD signals co-occur with backend/frontend, also reset deploy items
    if (keywords.hasCicd) {
      resetKeys.push("push-app", "poll-app-ci");
    }
    // If infra signals co-occur with app signals, also reset infra
    if (keywords.hasInfra) {
      resetKeys.push("infra-architect");
    }
  }

  // Can't determine root cause → only reset the failing item and let it retry,
  // rather than destroying 45 minutes of completed agent work.
  if (resetKeys.length === 0) {
    console.warn(`  ⚠ Triage could not determine root cause. Retrying ${itemKey} only.`);
    return [itemKey].filter((k) => !naItems.has(k));
  }

  resetKeys.push(itemKey);
  return resetKeys.filter((k) => !naItems.has(k));
}
