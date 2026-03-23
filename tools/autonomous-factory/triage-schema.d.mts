/**
 * Type declarations for triage-schema.mjs.
 */
import type { z } from "zod";

export declare const TriageDiagnosticSchema: z.ZodObject<{
  fault_domain: z.ZodEnum<["backend", "frontend", "both", "environment"]>;
  diagnostic_trace: z.ZodString;
}>;
