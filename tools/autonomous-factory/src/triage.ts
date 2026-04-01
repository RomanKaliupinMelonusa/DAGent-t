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
  const diagnostic = parseTriageDiagnostic(errorMessage);
  if (diagnostic) {
    console.log(`  🎯 Structured triage: fault_domain=${diagnostic.fault_domain}`);
    return applyFaultDomain(diagnostic.fault_domain, itemKey, naItems);
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
    case "infra":
      // Infrastructure error — route to infra-architect (Wave 1 redevelopment)
      resetKeys.push("infra-architect");
      break;
    case "blocked":
      // Unfixable error — no items to reset, pipeline must halt.
      return [];
    case "environment":
      // Not a code bug — only reset the post-deploy item itself.
      return [itemKey].filter((k) => !naItems.has(k));
  }

  resetKeys.push(itemKey);
  return resetKeys.filter((k) => !naItems.has(k));
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
  const msg = errorMessage.toLowerCase();
  const resetKeys: string[] = [];

  // Environment / auth signals — NOT code bugs, redevelopment won't help.
  // NOTE: Hard IAM blocks (authorization_requestdenied, insufficient privileges,
  // does not have authorization) are intercepted earlier by Tier 0 (isUnfixableError)
  // and never reach this function. The signals below are soft auth failures that
  // can resolve on retry (e.g., token expiry, credential refresh).
  const envSignals = [
    "az login", "credentials", "auth not available", "not authenticated",
    "no credentials", "login required", "identity not found",
    "managed identity", "devcontainer", "defaultazurecredential",
    "interactive login", "device code",
    "access is denied",
    // CI poll timeout — defense-in-depth safety net. Exit codes 2/3 are
    // intercepted at the session-runner boundary before triage runs, but
    // if it leaks through, this prevents misrouting as a code bug.
    // NOTE: "ci is still running" was removed — it contaminated triage
    // when poll-ci stdout mixed polling status with real CI error logs.
    "exiting poll to prevent",
  ];

  if (envSignals.some((s) => msg.includes(s))) {
    console.log(`  ⚠ Environment/auth issue detected — skipping ${itemKey} (not a code bug)`);
    return [itemKey].filter((k) => !naItems.has(k));
  }

  // Deployment-stale signals — deployed artifact is outdated, code is correct.
  // Must be checked BEFORE backend/frontend signals to avoid misrouting.
  const deploymentStaleSignals = [
    "deployment stale", "not in deployed build", "never re-triggered",
    "deployed build contains", "swa deployment stale",
    "function not deployed", "not deployed to azure",
    // Dynamic: "<workflow>.yml never" patterns from config
    ...(ciWorkflowFilePatterns ?? []).map((f) => `${f} never`),
  ];
  if (deploymentStaleSignals.some((s) => msg.includes(s))) {
    console.log("  📦 Deployment-stale detected — routing to re-deploy only (no dev reset)");
    return ["push-app", "poll-app-ci", itemKey].filter((k) => !naItems.has(k));
  }

  const backendSignals = [
    "api", "endpoint", "500", "502", "503", "504", "function",
    "timeout", "backend",
    "cosmos", "storage", "queue", "apim", "gateway",
    "empty response", "response format", "data mapping", "404",
  ];
  const frontendSignals = [
    "ui", "frontend", "component", "page", "render", "selector",
    "testid", "element", "visible", "screenshot", "html", "css",
    "navigation", "route", "display", "button", "form", "modal",
    "handler", "event binding", "javascript error", "console error",
    "click", "data mapping",
  ];
  const cicdSignals = [
    // Dynamic: workflow file patterns from config
    ...(ciWorkflowFilePatterns ?? []),
    ".github/workflows", "workflow file",
    "ci failed", "ci timeout",
    "deploy artifact", "package.json type", "type:module",
    "never committed", "working-tree fix",
  ];
  const infraSignals = [
    "terraform", "tfstate", "state lock", "provider registry",
    ".tf", "resource already exists", "azurerm_", "azapi_",
    "terraform plan", "terraform apply", "terraform init",
    "hcl", "provider configuration",
    "cors", "access-control-allow-origin",
  ];
  const schemaSignals = [
    "packages/schemas", "@branded/schemas", "schema-dev",
    "schema validation", "schema build",
  ];

  // Directory-path signals — CI-provider agnostic. Compilers, linters, and
  // test runners universally include file paths in error output. These catch
  // CI build errors that runtime keywords ("500", "CORS") miss.
  // Dynamically built from APM config.directories when available; falls back
  // to hardcoded defaults for apps without APM manifests.
  const directoryPathSignals = buildDirectoryPathSignals(directories);

  const hasBackend = backendSignals.some((s) => msg.includes(s))
    || directoryPathSignals.backend.some((s) => msg.includes(s));
  const hasFrontend = frontendSignals.some((s) => msg.includes(s))
    || directoryPathSignals.frontend.some((s) => msg.includes(s));
  const hasCicd = cicdSignals.some((s) => msg.includes(s));
  const hasInfra = infraSignals.some((s) => msg.includes(s));
  const hasSchema = schemaSignals.some((s) => msg.includes(s));

  // Infrastructure issues route to infra-architect (never to app dev agents)
  if (hasInfra && !hasBackend && !hasFrontend && !hasSchema && !hasCicd) {
    resetKeys.push("infra-architect");
  }
  // CI/CD workflow issues take priority — dev agents can't fix .github/ files
  else if (hasCicd && !hasBackend && !hasFrontend && !hasSchema) {
    resetKeys.push("push-app", "poll-app-ci");
  } else {
    if (hasSchema) {
      // Schema failures cascade to both backend and frontend
      resetKeys.push("schema-dev", "infra-architect", "backend-dev", "backend-unit-test", "frontend-dev", "frontend-unit-test");
    } else {
      if (hasBackend) {
        resetKeys.push("backend-dev", "backend-unit-test");
      }
      if (hasFrontend) {
        resetKeys.push("frontend-dev", "frontend-unit-test");
      }
    }
    // If CI/CD signals co-occur with backend/frontend, also reset deploy items
    if (hasCicd) {
      resetKeys.push("push-app", "poll-app-ci");
    }
    // If infra signals co-occur with app signals, also reset infra
    if (hasInfra) {
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
