/**
 * types.ts — Shared TypeScript interfaces for the orchestrator.
 *
 * Runtime shapes consumed by activities and helpers under `src/`.
 */

// ---------------------------------------------------------------------------
// Reset operation keys — shared protocol between the state adapter and kernel
// ---------------------------------------------------------------------------

/**
 * Synthetic `itemKey` values written to `errorLog` by the state machine's
 * reset functions. These are NOT real DAG node keys — they're operation
 * markers used for cycle counting and context injection.
 */
export const RESET_OPS = {
  /** resetNodes() for upstream dev redevelopment */
  RESET_FOR_DEV: "reset-for-dev",
  /** resetNodes() for triage reroute */
  RESET_FOR_REROUTE: "reset-for-reroute",
  /** bypassNode() — failing parent flipped to `na` to unlock a downstream
   *  triage reroute target. Cycle counter is bookkeeping-only (does NOT
   *  consume the user's `max_reroutes` budget). */
  BYPASS_FOR_REROUTE: "bypass-for-reroute",
  /** resetNodes() emitted by the seal hook when a triage-reroute target
   *  completes successfully — re-pendings the bypassed parent so the
   *  fix is validated against the gate. Has its own dedicated cycle
   *  budget (default 3) distinct from `RESET_FOR_REROUTE`. */
  RESET_AFTER_FIX: "reset-after-fix",
  /** Legacy error-log marker — kept for backward compat with old state files. */
  RESET_PHASES: "reset-phases",
  /** A4 — sentinel itemKey used by the blocked-verdict circuit breaker.
   *  Each $BLOCKED triage outcome appends one entry tagged with this
   *  itemKey + a `[failing:<nodeKey>] [domain:<domain>] reason` message.
   *  Counted per-failing-node by the triage handler to halt on repeat. */
  TRIAGE_BLOCKED: "triage-blocked",
} as const;

/** All reset-operation keys that indicate a redevelopment cycle */
export const REDEVELOPMENT_RESET_OPS = [
  RESET_OPS.RESET_FOR_DEV,
  RESET_OPS.RESET_FOR_REROUTE,
] as const;

export interface PipelineItem {
  key: string;
  label: string;
  agent: string | null;
  status: "pending" | "done" | "failed" | "na" | "dormant";
  error: string | null;
  docNote?: string | null;
  /** Sticky salvage marker — set when the kernel applies `salvage-draft` to
   *  this item. Subsequent `reset-nodes` dag-commands targeting a salvaged
   *  item are rejected by the reducer (no-op) and produce a telemetry signal.
   *  Prevents later triage cycles from resurrecting a gracefully-degraded node. */
  salvaged?: boolean;
  /** Bypass marker — set when the kernel applies `bypass-node` to this
   *  failing item so a triage reroute can dispatch a downstream debug
   *  agent that would otherwise be DAG-locked behind the failure. The
   *  item's status is flipped from `failed` → `na` for the duration of
   *  the bypass; on the rerouted target's successful seal, the seal hook
   *  emits a `reset-nodes` command with logKey `reset-after-fix` to
   *  re-pending this item and re-validate the gate against the fix. The
   *  marker is cleared by `resetNodes` when the item transitions back to
   *  `pending`. Distinct from `salvaged`: bypass is reversible, salvage
   *  is sticky. */
  bypassedFor?: { routeTarget: string; cycleIndex: number };
  /** Artifact-bus pointer: invocationId of the most recent (or staged) dispatch
   *  for this item. Points into `PipelineState.artifacts`. Set by the kernel
   *  at dispatch time AND when the triage handler stages a re-entrance via
   *  the `stage-invocation` command. The dispatcher reads this to adopt the
   *  staged record (carrying `parentInvocationId` + `trigger`) instead of
   *  allocating a fresh invocationId. Re-entrance prose lives in declared
   *  artifacts (e.g. `triage-handoff` JSON), not on the record itself. */
  latestInvocationId?: string | null;
}

// ---------------------------------------------------------------------------
// Artifact Bus — invocation ledger (Phase 2)
// ---------------------------------------------------------------------------

/**
 * Serialized reference to an artifact owned by the Artifact Bus. Mirrors the
 * `ArtifactRef` union on `ports/artifact-bus.ts` but is the plain-data form
 * persisted inside `InvocationRecord`. The `path` is absolute and recomputable
 * from the other fields via `ArtifactBus.ref()` — stored for convenience so
 * consumers reading state don't need an `ArtifactBus` instance to locate a
 * file on disk.
 */
export interface ArtifactRefSerialized {
  /** Stable kind id — see `apm/artifact-catalog.ts`. */
  readonly kind: string;
  readonly scope: "kickoff" | "node";
  readonly slug: string;
  readonly nodeKey?: string;
  readonly invocationId?: string;
  readonly path: string;
}

/**
 * Trigger that caused an invocation to be created. Mirrors the failure-loop
 * vocabulary the kernel already uses elsewhere (reset-for-dev, reset-for-reroute).
 */
export type InvocationTrigger =
  | "initial"
  | "triage-reroute"
  | "retry"
  | "redevelopment-cycle";

/**
 * Persisted metadata for a single invocation of a DAG node. Authoritative
 * record under `PipelineState.artifacts[invocationId]`; the matching
 * `<nodeKey>/<invocationId>/meta.json` file is a mirror, not the source of
 * truth.
 *
 * Supplants per-item `handoffArtifact` and the legacy `pendingContext`
 * string field: emitted handoffs live in `outputs`
 * with their declared kind. Re-entrance context (e.g. triage handoffs)
 * also flows through declared artifacts — the dispatcher's input
 * materialization middleware copies them into `<inv>/inputs/` before the
 * handler runs.
 */
export interface InvocationRecord {
  /** Unique id — see `domain/invocation-id.ts`. Lexicographically time-sortable. */
  readonly invocationId: string;
  /** Owning DAG node (e.g. "storefront-dev"). */
  readonly nodeKey: string;
  /** 1-based sequence index among invocations of the same node, assigned at
   *  dispatch from the pre-existing `cycleCounters[nodeKey]`. Human-readable;
   *  not a uniqueness key. */
  readonly cycleIndex: number;
  /** Why this invocation was created. */
  readonly trigger: InvocationTrigger;
  /** The invocation that caused this one (e.g. the triage invocation that
   *  routed here). Absent for the first invocation of a node. */
  readonly parentInvocationId?: string;
  /** Item key that produced this invocation's pending context, if any.
   *  Human-oriented convenience ("triage-storefront#inv_01H…"). */
  readonly producedBy?: string;
  /** Uniform causality envelope: which invocation caused this one to be
   *  dispatched, and why. Populated for every dispatch flavour:
   *    - `initial`: the most recent upstream completion among `depends_on`
   *      whose seal unblocked this item.
   *    - `retry`: the most recent failed invocation of THIS node.
   *    - `redevelopment-cycle`: the failing invocation in a previous cycle
   *      that triggered the reset (often a `publish-pr` or `live-ui` fail).
   *    - `triage-reroute`: the triage invocation that routed here.
   *  Optional for back-compat with archived runs. */
  readonly triggeredBy?: {
    readonly nodeKey: string;
    readonly invocationId: string;
    readonly reason: InvocationTrigger;
  };
  /** Inverse of `triggeredBy` — when this invocation dispatched a child
   *  (currently only triage handlers do this when they reroute). Lets the
   *  triage record self-describe its callee instead of forcing readers to
   *  scan the staged downstream invocation for `parentInvocationId`. */
  readonly routedTo?: {
    readonly nodeKey: string;
    readonly invocationId: string;
  };
  /** ISO timestamp at dispatch. May be absent for staged records that have
   *  not yet been picked up — the dispatch hook stamps this when the
   *  handler actually starts. */
  readonly startedAt?: string;
  /** ISO timestamp when the invocation terminated (sealed). */
  readonly finishedAt?: string;
  /** Outcome of the owning handler. */
  readonly outcome?: "completed" | "failed" | "error";
  /** Artifacts the invocation consumed (resolved from declared `consumes` /
   *  `consumes_kickoff`). Phase 2 ships the container; population happens
   *  in Phase 4. */
  readonly inputs: ArtifactRefSerialized[];
  /** Artifacts the invocation produced. Populated by the kernel from
   *  `report_outcome` in Phase 4. */
  readonly outputs: ArtifactRefSerialized[];
  /** `true` once the invocation dir is sealed — any subsequent `ArtifactBus.write`
   *  targeting this invocation will throw. Mirrors the adapter's in-memory
   *  cache so seal state survives orchestrator restarts. */
  readonly sealed?: boolean;
  /** Optional structured next-failure hint emitted via `report_outcome`.
   *  Replaces the markdown heading parser the triage handoff builder used
   *  to apply to `debug-notes.md`. Producer-agnostic — any sealed,
   *  completed invocation whose agent supplied the field is eligible
   *  for downstream triage's `priorDebugRecommendation` lookup. */
  readonly nextFailureHint?: import("./harness/outcome-tool.js").NextFailureHint;
}

export interface AppendInvocationInput {
  readonly invocationId: string;
  readonly nodeKey: string;
  readonly trigger: InvocationTrigger;
  readonly parentInvocationId?: string;
  readonly producedBy?: string;
  readonly triggeredBy?: InvocationRecord["triggeredBy"];
  readonly startedAt?: string;
  readonly inputs?: ArtifactRefSerialized[];
  /** Optional cycleIndex override. Defaults to the current count of
   *  invocations for `nodeKey` (plus one) as derived from `state.artifacts`. */
  readonly cycleIndex?: number;
}

export interface SealInvocationInput {
  readonly invocationId: string;
  readonly outcome: "completed" | "failed" | "error";
  readonly finishedAt?: string;
  readonly outputs?: ArtifactRefSerialized[];
  /** Optional update to the `routedTo` field (used by the triage handler
   *  on a successful reroute to record its callee). */
  readonly routedTo?: InvocationRecord["routedTo"];
  /** Optional structured next-failure hint reported by the agent via
   *  `report_outcome`. Persisted on the InvocationRecord and read by
   *  downstream triage to populate `priorDebugRecommendation`. */
  readonly nextFailureHint?: InvocationRecord["nextFailureHint"];
}

// ---------------------------------------------------------------------------
// Execution Log — persisted per-invocation records for cross-attempt analysis
// ---------------------------------------------------------------------------

/**
 * Persisted record of a single handler invocation. Written by the kernel after
 * every handler execution. The triage handler and node wrapper query these
 * records to make failure-intelligence decisions (dedup, revert bypass, etc.).
 *
 * Unlike `errorLog` (which tracks state mutations) and `ItemSummary` (which is
 * in-memory per-session), the execution log survives orchestrator restarts and
 * provides full attempt history per node.
 */
export interface ExecutionRecord {
  /** Unique identifier for this execution (UUID v4). */
  executionId: string;
  /** DAG node key (e.g. "storefront-dev"). */
  nodeKey: string;
  /** 1-based attempt number within this pipeline run. */
  attempt: number;
  /** Handler outcome. */
  outcome: "completed" | "failed" | "error";
  /** Error message if outcome is not "completed". */
  errorMessage?: string;
  /** Stable error fingerprint (SHA-256 prefix of normalized trace). */
  errorSignature?: string;
  /** Git HEAD before handler execution. */
  headBefore?: string;
  /** Git HEAD after handler execution. */
  headAfter?: string;
  /** Files changed during this execution. */
  filesChanged: string[];
  /** Execution duration in milliseconds. */
  durationMs: number;
  /** ISO timestamp when execution started. */
  startedAt: string;
  /** ISO timestamp when execution finished. */
  finishedAt: string;
}

export interface PipelineState {
  feature: string;
  workflowName: string;
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
  /** Node execution types — open set; built-in: agent, script, approval, triage. */
  nodeTypes: Record<string, string>;
  /** Node semantic categories — open set; built-in: dev, test, deploy, finalize. */
  nodeCategories: Record<string, string>;
  /** Whether pipeline:fail messages must be valid TriageDiagnostic JSON — persisted at init from workflows.yml */
  jsonGated: Record<string, boolean>;
  /** Item keys marked N/A due to workflow type (not salvage) — for resumeAfterElevated */
  naByType: string[];
  /** Item keys demoted to N/A by the salvage scheduler (A5) — distinct from
   *  `naByType` (workflow-shape elision) so retrospective tooling can tell
   *  the two apart. Populated by `salvageForDraft` when a deploy-category
   *  salvage survivor's full dependency chain is N/A. */
  naBySalvage?: string[];
  /** Node keys that survive graceful degradation (salvageForDraft) — persisted at init from workflows.yml */
  salvageSurvivors: string[];
  /** Node keys exempt from the salvage deploy-orphan demotion sweep — persisted
   *  at init from `salvage_immune: true` in workflows.yml. Only meaningful in
   *  combination with `salvageSurvivors`. Optional for backward compatibility
   *  with legacy state files (treated as empty when absent). */
  salvageImmune?: string[];
  /** Item keys initialized as dormant due to `activation: "triage-only"`. Parallels naByType. */
  dormantByActivation?: string[];
  /** Consumer-key → producer-keys map for `consumes_artifacts` edges with
   *  `required: true`. Persisted at init from workflows.yml so the salvage
   *  scheduler can spare producers feeding surviving consumers. Optional
   *  for backward compatibility with legacy state files. */
  requiredArtifactProducers?: Record<string, string[]>;
  /** Producer-key → consumer-keys map for `consumes_artifacts` edges with
   *  `required: false`. Inverse of `requiredArtifactProducers`. Persisted
   *  at init from workflows.yml so `salvageForDraft` can prune the
   *  demotion cascade through advisory edges. Optional for backward
   *  compatibility with legacy state files. */
  optionalArtifactConsumers?: Record<string, string[]>;
  /** Persisted execution log — one record per handler invocation, survives restarts. */
  executionLog?: ExecutionRecord[];
  /** Per-item reroute/retry counters keyed by `${itemKey}` or `${itemKey}:${subkind}`.
   *  Authoritatively mutated by the kernel (`applyAdminCommand`, `applyDagCommand`).
   *  Persistence is now owned by Temporal workflow state; legacy on-disk state
   *  files no longer exist. */
  cycleCounters?: Record<string, number>;
  /** Artifact-bus (Phase 2) invocation ledger, keyed by invocationId.
   *  Authoritative index for per-dispatch artifacts + lineage. `items[].latestInvocationId`
   *  points here. Absent on legacy state files; the adapter backfills an empty
   *  object on read. */
  artifacts?: Record<string, InvocationRecord>;
}

/** Status values for pipeline items in the DAG scheduler. */
export type PipelineItemStatus = "pending" | "done" | "failed" | "na" | "dormant";

/** Scheduler-level status (superset: includes terminal sentinel values). */
export type SchedulerStatus = PipelineItemStatus | "complete" | "blocked";

export interface NextAction {
  key: string | null;
  label: string;
  agent: string | null;
  status: SchedulerStatus;
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
// Triage v2 — 2-layer profile-based system (RAG → LLM).
// ---------------------------------------------------------------------------

/** Result of the 2-layer triage evaluation. */
export interface TriageResult {
  /** Routing domain (key from the triage profile's routing section). */
  domain: string;
  /** Human-readable explanation of the classification. */
  reason: string;
  /** Which layer produced the classification.
   *  - `contract`: Layer 0 deterministic classifier (structured Playwright
   *    report + ACCEPTANCE contract, or canonical raw-error regex). No
   *    RAG, no LLM — the verdict came straight from the failing node's
   *    own machine-readable artifacts.
   *  - `rag`: Layer 1 substring match from a triage pack.
   *  - `llm`: Layer 2 LLM router.
   *  - `fallback`: No layer classified; triage handler degraded.
   */
  source: "contract" | "rag" | "llm" | "fallback";
  /** Top RAG matches (up to 3), regardless of which layer won. */
  rag_matches?: Array<{ snippet: string; domain: string; reason: string; rank: number }>;
  /** LLM response latency in ms (only set when LLM layer was invoked). */
  llm_response_ms?: number;
}

/**
 * Full triage record assembled by the triage handler (handlers/triage.ts).
 * Captures everything about a failure classification for retrospective analysis.
 * Serialised to the `triage-handoff` artifact at
 * `<slug>/<triage-nodeKey>/<invocationId>/triage-handoff.json` and emitted as
 * a `triage.evaluate` event.
 */
export interface TriageRecord {
  /** The DAG node that failed. */
  failing_item: string;
  /** Stable error fingerprint (SHA-256 prefix of normalized trace). */
  error_signature: string;

  /** Pre-guard result (set by triage handler, not evaluateTriage). */
  guard_result: "passed" | "timeout_bypass" | "unfixable_halt" | "death_spiral" | "retry_dedup" | "session_idle_exhausted" | "blocked_repeat" | "evidence_empty_self_reset";
  guard_detail?: string;

  /** RAG layer matches (up to 3, ranked by specificity). */
  rag_matches: Array<{ snippet: string; domain: string; reason: string; rank: number }>;
  /** The RAG snippet selected for routing (null if LLM or fallback won). */
  rag_selected: string | null;

  /** Whether the LLM layer was invoked. */
  llm_invoked: boolean;
  llm_domain?: string;
  llm_reason?: string;
  llm_response_ms?: number;

  /** Final classification. */
  domain: string;
  reason: string;
  source: "contract" | "rag" | "llm" | "fallback";

  /** Routing decision (set by triage handler after evaluateTriage). */
  route_to: string;
  cascade: string[];
  cycle_count: number;
  domain_retry_count: number;
}

/**
 * Structured handoff payload emitted by the triage handler when it reroutes
 * a failure to a dev agent. Serialized to the `triage-handoff` JSON
 * artifact that the materialize-inputs middleware copies into the
 * rerouted node's `inputs/` directory (declared via `consumes_reroute`).
 * Carries the diagnosis up-front so the receiving agent does not have to
 * re-discover it from raw logs.
 */
export interface TriageHandoff {
  /** On-disk wire-format version. Producers stamp the catalog's canonical
   *  value (currently `1`); consumers treat an absent field as `1`
   *  (pre-versioning artifacts on disk). Bumping requires either a
   *  backwards-compatible schema union or a parallel major. */
  readonly schemaVersion?: 1;
  /** The item whose failure triggered this handoff (upstream of route-to). */
  readonly failingItem: string;
  /** Trimmed error excerpt (first N lines) — no secrets, deterministic. */
  readonly errorExcerpt: string;
  /** Stable fingerprint of the error for cross-cycle identity. */
  readonly errorSignature: string;
  /** Classified fault domain. */
  readonly triageDomain: string;
  /** Human-readable classification reason. */
  readonly triageReason: string;
  /** Number of prior attempts for the failing item. */
  readonly priorAttemptCount: number;
  /** Files touched in the failing attempt, if known. */
  readonly touchedFiles?: readonly string[];
  /** Provenance for `touchedFiles`. `"self"` when the files come from the
   *  failing item's own attempt summary. Otherwise the item key whose
   *  summary supplied the list (a recent upstream writer such as the dev
   *  node when the failing item is a non-writing script like `e2e-runner`
   *  or `push-app`). Omitted when `touchedFiles` is empty. */
  readonly touchedFilesSource?: string;
  /** Optional advisory surfaced alongside the diagnosis — e.g. a
   *  consecutive-domain warning recommending `agent-branch.sh revert`
   *  when the last two reroutes stayed in the same domain. Free-form
   *  markdown; empty/undefined = no advisory. */
  readonly advisory?: string;
  /** Level-1 screenshot/trace evidence harvested from a Playwright JSON
   *  reporter artifact. Paths are absolute and point to copies persisted
   *  under `<appRoot>/.dagent/<slug>_evidence/` so they survive the
   *  Playwright cleanup of `test-results/` between runs. Omitted when
   *  the failure is not a Playwright-json failure or no binary
   *  attachments were present. */
  readonly evidence?: ReadonlyArray<{
    readonly testTitle: string;
    readonly attachments: ReadonlyArray<{
      readonly name: string;
      readonly path: string;
      readonly contentType: string;
    }>;
    /** Playwright `error-context.md` — ARIA snapshot of the DOM at the
     *  failure point. Pre-truncated to keep the handoff compact; the full
     *  artifact lives under `test-results/…/error-context.md` for deeper
     *  forensics. Absent when the reporter did not emit this attachment. */
    readonly errorContext?: string;
  }>;
  /** Browser-side runtime signals captured by the Playwright JSON reporter
   *  (console errors, failed network requests, uncaught exceptions) after
   *  `baseline-analyzer` noise has been subtracted. These are the signals
   *  the dev agent needs to diagnose root cause \u2014 the `errorExcerpt`
   *  above only says which assertion failed, not *why*.
   *
   *  Caps (applied by `toBrowserSignals`): 10 uncaught / 15 console /
   *  15 network; each entry truncated to 300 characters. Omitted when the
   *  payload is not a Playwright-json failure or every channel is empty
   *  after filtering. */
  readonly browserSignals?: {
    readonly consoleErrors: readonly string[];
    readonly failedRequests: readonly string[];
    readonly uncaughtErrors: ReadonlyArray<{
      readonly message: string;
      readonly inTest: string;
    }>;
  };
  /** Per-channel counts of entries subtracted by `filterNoise` against
   *  the pre-feature baseline. Rendered under the browser-signals block
   *  as a provenance footer so the dev agent can verify the filter ran.
   *  All zero / absent when no filtering happened. */
  readonly baselineDropCounts?: {
    readonly console: number;
    readonly network: number;
    readonly uncaught: number;
  };
  /** Compact per-test failure summary projected from a structured failure
   *  (e.g. Playwright JSON reporter). Only the minimum needed for a dev
   *  agent to know *which* tests failed and a one-line reason — stack
   *  traces, attachments, console/network signals, ARIA snapshots are
   *  intentionally excluded. A future debug agent with Playwright MCP
   *  access is expected to harvest richer context on demand.
   *
   *  Omitted when the failure payload is not a recognised structured
   *  format or no tests failed. */
  readonly failedTests?: ReadonlyArray<{
    readonly title: string;
    readonly file?: string;
    readonly line?: number | null;
    /** Single-line error message (first non-empty line of the failure
     *  excerpt, truncated). */
    readonly error: string;
  }>;
  /** Pointer to the pre-feature noise catalogue captured by
   *  `baseline-analyzer` (`.dagent/<slug>_BASELINE.json`). The
   *  current dev-agent prompt does not filter via this file (the
   *  compact `failedTests` list replaces raw stdout), but a future
   *  debug agent with Playwright MCP access will need to consult it
   *  to tell feature-attributable errors apart from pre-existing
   *  platform noise. Rendered as a single provenance line in the
   *  handoff markdown. Omitted when no baseline was captured. */
  readonly baselineRef?: {
    /** Workspace-relative path to the baseline JSON file. */
    readonly path: string;
    /** Pattern counts per channel — lets the dev/debug agent judge
     *  how much pre-feature noise is expected before opening the file. */
    readonly consolePatternCount: number;
    readonly networkPatternCount: number;
    readonly uncaughtPatternCount: number;
  };
  /** Invocation id assigned to this triage run itself (Phase 5). Downstream
   *  dispatches caused by this handoff record it as their
   *  `parentInvocationId`, giving lineage queries a traversable chain from
   *  the original failure through every reroute. Absent during the Phase 5
   *  rollout window — consumers must treat this as optional. */
  readonly triageInvocationId?: string;
  /** True when this handoff was emitted from a graceful-degradation exit
   *  (no reroute target). The triage node still owes the ledger a
   *  `triage-handoff` artifact because it declares
   *  `produces_artifacts: [triage-handoff]`, so we write one for the
   *  record even when no downstream dev agent will consume it. Absent /
   *  false means the handoff is carrying a live reroute target. */
  readonly degraded?: boolean;
  /** Recommendation parsed out of the most recent `storefront-debug`
   *  `debug-notes.md` artifact when its body included a recognised
   *  recommendation marker. The debug specialist's diagnosis that the next failure
   *  will actually be in test code, not the component itself —
   *  surfaced here so the next triage cycle can prefer the
   *  recommended classification instead of looping back to debug.
   *  Absent when no recognised heading was present, the body was
   *  empty, or the recommended domain is not in the failing node's
   *  routing table. */
  readonly priorDebugRecommendation?: {
    /** Inferred fault domain from the heading. Currently always
     *  `"test-code"` — both supported headings map to the same domain. */
    readonly domain: string;
    /** Heading body, trimmed. Free-form prose copied verbatim from the
     *  debug-notes artifact. */
    readonly note: string;
    /** `cycleIndex` of the source `storefront-debug` invocation —
     *  rendered alongside the recommendation so the LLM router and
     *  dev agent can tell how recent the diagnosis is. */
    readonly cycleIndex: number;
  };
}

/**
 * Extract `diagnostic_trace` from a JSON error message, if present.
 * Used by the circuit breaker to normalize error comparisons.
 */
export function extractDiagnosticTrace(message: string): string | null {
  try {
    const parsed = JSON.parse(message);
    if (parsed && typeof parsed === "object" && typeof parsed.diagnostic_trace === "string") {
      return parsed.diagnostic_trace;
    }
  } catch { /* not JSON */ }
  return null;
}

// ---------------------------------------------------------------------------
// Session telemetry — data structures collected by the orchestrator's
// session runner and consumed by reporting functions.
// ---------------------------------------------------------------------------

/** Summary of decisions collected from each item's session */
export interface ItemSummary {
  key: string;
  label: string;
  agent: string;
  attempt: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  outcome: "completed" | "failed" | "error" | "in-progress";
  /** Agent-reported intents (high-level "what I'm doing" messages) */
  intents: string[];
  /** Final assistant messages (full text, not truncated) */
  messages: string[];
  /** Files read by the agent */
  filesRead: string[];
  /** Files written or edited by the agent */
  filesChanged: string[];
  /** Shell commands executed with exit context */
  shellCommands: ShellEntry[];
  /** Tool call counts by category */
  toolCounts: Record<string, number>;
  /** Error message if the step failed */
  errorMessage?: string;
  /**
   * Stable error fingerprint emitted by the orchestrator (not by the
   * agent). Set by gates that classify a failure into a known taxonomy
   * (e.g. `runner.contract_violation`, `missing_required_output:<kind>`,
   * `invalid_envelope_output:<kind>`) so triage can route deterministically
   * without substring-matching `errorMessage`. The dispatch-layer
   * `materializeItemSummary` may override / propagate this from
   * `result.summary.errorSignature`.
   */
  errorSignature?: string;
  /** Git HEAD after this attempt — used for identical-error dedup */
  headAfterAttempt?: string;
  /** Accumulated input tokens from assistant.usage events */
  inputTokens: number;
  /** Accumulated output tokens from assistant.usage events */
  outputTokens: number;
  /** Accumulated cache-read tokens (prompt caching) */
  cacheReadTokens: number;
  /** Accumulated cache-creation tokens */
  cacheWriteTokens: number;
  /** Budget utilization snapshot — populated at session end by the copilot-agent handler. */
  budgetUtilization?: {
    toolCallsUsed: number;
    toolCallLimit: number;
    tokensConsumed: number;
    tokenBudget?: number;
  };
  /**
   * Outcome reported by the agent via the `report_outcome` SDK tool.
   * Last call wins. Read by `handlers/copilot-agent.ts` to translate
   * into a kernel Command (Phase A — kernel-sole-writer).
   * Undefined when the agent never called the tool.
   */
  reportedOutcome?: import("./harness/outcome-tool.js").ReportedOutcome;
  /**
   * Number of times the runner-internal node-contract gate fired a
   * recovery nudge into this session. Surfaced into `_FLIGHT.json` for
   * visibility; absent when the gate was satisfied on the first pass.
   */
  contractRecoveryAttempts?: number;
  /**
   * True when one of the recovery nudges fixed the gap (i.e. the gate
   * subsequently returned `ok: true`). Absent when no nudges fired or
   * when the budget was exhausted without recovery.
   */
  contractRecoveryRecovered?: boolean;
  /**
   * Pre-`report_outcome` validation gate state (currently used by
   * `spec-compiler` only). Increments each time the gate rejects a
   * `completed` outcome; once it exceeds the configured cap the gate
   * forcibly records a `failed` outcome.
   */
  precompletionGateRejections?: number;
  /**
   * Set to `true` once `report_outcome` has been recorded with a
   * passing pre-completion gate (or with no gate). Subsequent tool
   * calls are then policy-violations — the session-discipline listener
   * disconnects the session within a short grace window.
   */
  reportOutcomeTerminal?: boolean;
  /**
   * Annotation set by the post-completion session-discipline listener
   * when it forcibly disconnects a session that kept calling tools
   * after a successful `report_outcome`.
   */
  postCompletionToolCallAnnotation?: string;
}

export interface ShellEntry {
  command: string;
  timestamp: string;
  /** Whether this was a pipeline:complete/fail or agent-commit call */
  isPipelineOp: boolean;
}

/** Detailed MCP tool telemetry log entry */
export interface McpToolLogEntry {
  timestamp: string;
  tool: string;
  /** MCP server name that owns this tool (e.g. "playwright") */
  server?: string;
  args?: Record<string, unknown>;
  success?: boolean;
  result?: string;
}
