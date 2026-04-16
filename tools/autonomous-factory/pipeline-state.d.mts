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
  /** Structured handoff artifact (JSON string) for downstream agent contracts.
   *  Dev agents use this to communicate typed data (testid maps, affected routes,
   *  SSR-safety flags) to SDET and test runner agents. */
  handoffArtifact?: string | null;
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
    /** Stable fingerprint of the error (volatile tokens stripped, SHA-256 prefix).
     *  Enables cross-cycle identity tracking for death-spiral prevention. */
    errorSignature?: string | null;
  }>;
  /** DAG dependency graph — persisted at init from workflows.yml */
  dependencies: Record<string, string[]>;
  /** Explicit ordered phase names — persisted at init from workflows.yml */
  phases: string[];
  /** Node execution types — persisted at init from workflows.yml */
  nodeTypes: Record<string, "agent" | "script" | "approval" | "barrier">;
  /** Node semantic categories — replaces DEV_ITEMS/TEST_ITEMS/POST_DEPLOY_ITEMS sets */
  nodeCategories: Record<string, "dev" | "test" | "deploy" | "finalize">;
  /** Whether pipeline:fail messages must be valid TriageDiagnostic JSON — persisted at init from workflows.yml */
  jsonGated: Record<string, boolean>;
  /** Item keys marked N/A due to workflow type (not salvage) — for resumeAfterElevated */
  naByType: string[];
  /** Node keys that survive graceful degradation (salvageForDraft) — persisted at init from workflows.yml */
  salvageSurvivors: string[];
  /** Last triage record — persisted for downstream context injection. */
  lastTriageRecord?: TriageRecord | null;
}

/** Full triage record assembled by the triage-dispatcher. */
interface TriageRecord {
  failing_item: string;
  error_signature: string;
  guard_result: "passed" | "timeout_bypass" | "unfixable_halt" | "death_spiral";
  guard_detail?: string;
  rag_matches: Array<{ snippet: string; domain: string; reason: string; rank: number }>;
  rag_selected: string | null;
  llm_invoked: boolean;
  llm_domain?: string;
  llm_reason?: string;
  llm_response_ms?: number;
  domain: string;
  reason: string;
  source: "rag" | "llm" | "fallback";
  route_to: string;
  cascade: string[];
  cycle_count: number;
  domain_retry_count: number;
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
 * The programmatic `failItem()` function (imported by state.ts) accepts any
 * string as the error message.
 */
export function failItem(slug: string, itemKey: string, message: string): FailResult;
export function resetScripts(slug: string, phase: string): ResetResult;
export function resetPhases(slug: string, phasesCsv: string, reason: string, maxCycles?: number): ResetResult;
export function resetForReroute(slug: string, routeToKey: string, reason: string, maxReroutes?: number): ResetResult;
export function salvageForDraft(slug: string, failedItemKey: string): PipelineState;
export function resumeAfterElevated(slug: string): ResetResult;
export function recoverElevated(slug: string, errorMessage: string): ResetResult;
export function getStatus(slug: string): PipelineState;
export function getNext(slug: string): NextAction;
export function getNextAvailable(slug: string): NextAction[];
export function setNote(slug: string, note: string): PipelineState;
export function setDocNote(slug: string, itemKey: string, note: string): PipelineState;
export function setHandoffArtifact(slug: string, itemKey: string, artifactJson: string): PipelineState;
export function setUrl(slug: string, url: string): PipelineState;
export function setLastTriageRecord(slug: string, record: TriageRecord): PipelineState;
export function readState(slug: string): PipelineState;
export function getDownstream(state: PipelineState, seedKeys: string[]): string[];
export function getUpstream(state: PipelineState, seedKeys: string[]): string[];
export function cascadeBarriers(state: PipelineState, keysToReset: Set<string>): Set<string>;
