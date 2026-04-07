/**
 * Type declarations for pipeline-state.mjs — the JavaScript state management module.
 * This file allows TypeScript (NodeNext resolution) to import pipeline-state.mjs.
 */

interface PipelineItem {
  key: string;
  label: string;
  agent: string | null;
  phase: string;
  status: "pending" | "done" | "failed" | "na";
  error: string | null;
  docNote?: string | null;
}

interface PipelineState {
  feature: string;
  workflowType: string;
  started: string;
  deployedUrl: string | null;
  implementationNotes: string | null;
  elevatedApply?: boolean;
  items: PipelineItem[];
  errorLog: Array<{
    timestamp: string;
    itemKey: string;
    message: string;
  }>;
  /** DAG dependency graph — persisted at init from workflows.yml */
  dependencies: Record<string, string[]>;
  /** Explicit ordered phase names — persisted at init from workflows.yml */
  phases: string[];
  /** Node execution types — persisted at init from workflows.yml */
  nodeTypes: Record<string, "agent" | "script" | "approval">;
  /** Node semantic categories — replaces DEV_ITEMS/TEST_ITEMS/POST_DEPLOY_ITEMS sets */
  nodeCategories: Record<string, "dev" | "test" | "deploy" | "finalize">;
  /** Whether pipeline:fail messages must be valid TriageDiagnostic JSON — persisted at init from workflows.yml */
  jsonGated: Record<string, boolean>;
  /** Item keys marked N/A due to workflow type (not salvage) — for resumeAfterElevated */
  naByType: string[];
}

interface NextAction {
  key: string | null;
  label: string;
  agent: string | null;
  phase: string | null;
  status: string;
}

interface FailResult {
  state: PipelineState;
  failCount: number;
  halted: boolean;
}

interface ResetResult {
  state: PipelineState;
  cycleCount: number;
  halted: boolean;
}

interface InitResult {
  state: PipelineState;
  statePath: string;
  transPath: string;
}

export function initState(slug: string, workflowType: string, contextJsonPath?: string): InitResult;
export function completeItem(slug: string, itemKey: string): PipelineState;
/**
 * Record a failure for a pipeline item.
 *
 * **CLI-level validation:** When invoked via the CLI (`npm run pipeline:fail`)
 * for a post-deploy item (`live-ui`, `integration-test`), the `message`
 * parameter is validated against a Zod `TriageDiagnosticSchema`:
 *   `{ fault_domain: "backend"|"frontend"|"both"|"environment", diagnostic_trace: string }`
 * If validation fails, the CLI exits with code 1 and a descriptive error,
 * forcing the LLM agent to retry with correct JSON formatting.
 *
 * The programmatic `failItem()` function (imported by state.ts) does NOT
 * validate — it accepts any string to support SDK-level crash messages.
 */
export function failItem(slug: string, itemKey: string, message: string): FailResult;
export function resetScripts(slug: string, phase: string): ResetResult;
export function resetPhases(slug: string, phasesCsv: string, reason: string, maxCycles?: number): ResetResult;
export function resetForDev(slug: string, itemKeys: string[], reason: string, maxCycles?: number): ResetResult;
export function resetForRedeploy(slug: string, itemKeys: string[], reason: string, maxCycles?: number): ResetResult;
export function salvageForDraft(slug: string, failedItemKey: string): PipelineState;
export function resumeAfterElevated(slug: string): ResetResult;
export function recoverElevated(slug: string, errorMessage: string): ResetResult;
export function getStatus(slug: string): PipelineState;
export function getNext(slug: string): NextAction;
export function getNextAvailable(slug: string): NextAction[];
export function setNote(slug: string, note: string): PipelineState;
export function setDocNote(slug: string, itemKey: string, note: string): PipelineState;
export function setUrl(slug: string, url: string): PipelineState;
export function readState(slug: string): PipelineState;
export function getDownstream(state: PipelineState, seedKeys: string[]): string[];
export function getUpstream(state: PipelineState, seedKeys: string[]): string[];
