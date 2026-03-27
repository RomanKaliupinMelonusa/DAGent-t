/**
 * triage.ts — Structured error triage for post-deploy failures.
 *
 * Determines which dev items need to be reset when a post-deploy agent
 * (live-ui, integration-test) reports a failure.
 *
 * Primary path:  Agent outputs a JSON `TriageDiagnostic` — `fault_domain`
 *                drives deterministic routing.
 * Fallback path: Plain-text message — legacy keyword matching preserved
 *                for SDK-level crashes the agent cannot instrument.
 *
 * The LLM classifies the error; the DAG state machine controls execution.
 */

import { TriageDiagnosticSchema } from "./types.js";
import type { FaultDomain, TriageDiagnostic } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Examine the failure message from a post-deploy item and determine which
 * dev items + test items need to be reset.
 *
 * Filters out items that are N/A for this workflow type.
 * Returns the item keys to pass to `resetForDev` (deploy items are added
 * automatically by the state machine).
 */
export function triageFailure(
  itemKey: string,
  errorMessage: string,
  naItems: Set<string>,
  directories?: Record<string, string | null>,
): string[] {
  // --- Primary path: structured JSON contract ---
  const diagnostic = parseTriageDiagnostic(errorMessage);
  if (diagnostic) {
    console.log(`  🎯 Structured triage: fault_domain=${diagnostic.fault_domain}`);
    return applyFaultDomain(diagnostic.fault_domain, itemKey, naItems);
  }

  // --- Fallback path: legacy keyword matching (SDK crashes, malformed output) ---
  console.log("  ⚙ Legacy triage: keyword fallback (no structured JSON found)");
  return triageByKeywords(itemKey, errorMessage, naItems, directories);
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
      // CI/CD workflow file issue — route to push-code + poll-ci for the
      // deploy-manager agent which has the correct commit scope for .github/
      resetKeys.push("push-code", "poll-ci");
      break;
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
): string[] {
  const msg = errorMessage.toLowerCase();
  const resetKeys: string[] = [];

  // Environment / auth signals — NOT code bugs, redevelopment won't help.
  const envSignals = [
    "az login", "credentials", "auth not available", "not authenticated",
    "no credentials", "login required", "identity not found",
    "managed identity", "devcontainer", "defaultazurecredential",
    "interactive login", "device code",
    // Azure IAM permission errors (non-code-fixable)
    "authorization_requestdenied", "application.readwrite",
    "does not have authorization",
    "insufficient privileges", "access is denied",
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

  const backendSignals = [
    "api", "endpoint", "500", "502", "503", "504", "function",
    "timeout", "cors", "backend", "infra", "terraform",
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
    "deploy-backend.yml", "deploy-frontend.yml", "deploy-infra.yml",
    "ci-integration.yml", ".github/workflows", "workflow file",
    "ci failed", "ci timeout",
    "deploy artifact", "package.json type", "type:module",
    "never committed", "working-tree fix",
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
  const hasSchema = schemaSignals.some((s) => msg.includes(s));

  // CI/CD workflow issues take priority — dev agents can't fix .github/ files
  if (hasCicd && !hasBackend && !hasFrontend && !hasSchema) {
    resetKeys.push("push-code", "poll-ci");
  } else {
    if (hasSchema) {
      // Schema failures cascade to both backend and frontend
      resetKeys.push("schema-dev", "backend-dev", "backend-unit-test", "frontend-dev", "frontend-unit-test");
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
      resetKeys.push("push-code", "poll-ci");
    }
  }

  // Can't determine root cause → reset everything applicable
  if (resetKeys.length === 0) {
    resetKeys.push("schema-dev", "backend-dev", "backend-unit-test", "frontend-dev", "frontend-unit-test");
  }

  resetKeys.push(itemKey);
  return resetKeys.filter((k) => !naItems.has(k));
}
