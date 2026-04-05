/**
 * triage-schema.mjs — Single source of truth for the TriageDiagnostic Zod schema.
 *
 * Imported by:
 *   - src/types.ts  (TypeScript orchestrator — derives TS types via z.infer)
 *   - pipeline-state.mjs (CLI boundary — validates post-deploy failure messages)
 *
 * Defined as .mjs so both consumers can import it without build steps.
 */

import { z } from "zod";

/**
 * Zod schema for the structured triage diagnostic emitted by post-deploy
 * agents (live-ui, integration-test) when calling `pipeline:fail`.
 *
 * The watchdog parses this JSON to route the failure deterministically.
 * If parsing fails, the watchdog falls back to legacy keyword matching.
 */
export const TriageDiagnosticSchema = z.object({
  /** Which domain owns the bug — drives the reset-key selection. */
  fault_domain: z.enum([
    "backend", "frontend", "both", "environment",
    "frontend+infra", "backend+infra", "cicd", "blocked",
    "infra", "deployment-stale", "deployment-stale-backend",
    "deployment-stale-frontend", "test-code",
  ]).describe(
    "The root cause domain of the failure. " +
    "CRITICAL RULES: " +
    "1. INFRA: Select if the error relates to a missing environment variable, missing cloud resource, " +
    "CORS failure, database connection timeout, or 403 Forbidden, even if it surfaced during a backend or frontend test. " +
    "2. BACKEND/FRONTEND: Select only for app logic errors, 500s, or incorrect data transformations. " +
    "3. TEST-CODE: Select if the test itself is written incorrectly (e.g., Playwright timeouts, bad locators, " +
    "race conditions) or contradicts the SPEC.md."
  ),

  /** Human-readable trace: stack traces, URLs, status codes, App Insights output. */
  diagnostic_trace: z.string().min(1),
});
