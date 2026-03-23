/**
 * types.ts — Shared TypeScript interfaces for the orchestrator.
 *
 * These types mirror the runtime shapes produced by pipeline-state.mjs
 * and are used by state.ts, agents.ts, and watchdog.ts.
 */

import { z } from "zod";
import { TriageDiagnosticSchema } from "../triage-schema.mjs";

export { TriageDiagnosticSchema };

export interface PipelineItem {
  key: string;
  label: string;
  agent: string;
  phase: string;
  status: "pending" | "done" | "failed" | "na";
  error: string | null;
  docNote?: string | null;
}

export interface PipelineState {
  feature: string;
  workflowType: string;
  started: string;
  deployedUrl: string | null;
  implementationNotes: string | null;
  items: PipelineItem[];
  errorLog: Array<{
    timestamp: string;
    itemKey: string;
    message: string;
  }>;
}

export interface NextAction {
  key: string | null;
  label: string;
  agent: string | null;
  phase: string | null;
  status: string;
}

export interface FailResult {
  state: PipelineState;
  failCount: number;
  halted: boolean;
}

export interface ResetResult {
  state: PipelineState;
  cycleCount: number;
  halted: boolean;
}

export interface InitResult {
  state: PipelineState;
  statePath: string;
  transPath: string;
}

// ---------------------------------------------------------------------------
// Structured error triage — JSON contract between post-deploy agents and the
// watchdog's deterministic rerouting logic. The LLM classifies; the DAG routes.
//
// TriageDiagnosticSchema is the single source of truth (triage-schema.mjs).
// FaultDomain and TriageDiagnostic are derived from it via z.infer.
// ---------------------------------------------------------------------------

/** Fault domain that determines which dev items get reset on post-deploy failure. */
export type FaultDomain = TriageDiagnostic["fault_domain"];

/** Structured triage diagnostic — inferred from the Zod schema. */
export type TriageDiagnostic = z.infer<typeof TriageDiagnosticSchema>;
