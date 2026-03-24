/**
 * Type declarations for triage-schema.mjs.
 */
import type { z } from "zod";

export declare const TriageDiagnosticSchema: z.ZodObject<{
  fault_domain: z.ZodEnum<["backend", "frontend", "both", "environment", "frontend+infra", "backend+infra", "cicd"]>;
  diagnostic_trace: z.ZodString;
}>;
