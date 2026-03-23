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
  fault_domain: z.enum(["backend", "frontend", "both", "environment"]),
  /** Human-readable trace: stack traces, URLs, status codes, App Insights output. */
  diagnostic_trace: z.string().min(1),
});
