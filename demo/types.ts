/**
 * types.ts — Shape of every node and the run-state that flows between them.
 *
 * Linear-array pipeline. No DAG, no scheduler. Failure routing is done
 * by jumping the index in `run.ts` to the node id named in `onFailure`.
 */

export type NodeId =
  | "baseline"
  | "dev"
  | "unit-test"
  | "e2e-author"
  | "e2e-debug"
  | "pr-creation";

export type NodeKind = "agent" | "script";

export interface NodeDef {
  readonly id: NodeId;
  readonly kind: NodeKind;
  /** Path (under demo/prompts/) of the flattened prompt for agent nodes. */
  readonly promptFile?: string;
  /** Templated shell command for script nodes. `{slug}` / `{appRoot}` substituted. */
  readonly command?: string;
  /** Regex strings (anchored or not) matched against app-relative paths. */
  readonly allowedWritePaths?: readonly string[];
  /** Regex strings of fully-banned bash commands. */
  readonly blockedCommandRegexes?: readonly string[];
  /** MCP server names enabled for this node (e.g. ["roam-code"]). */
  readonly mcp?: readonly string[];
  /** Per-node hard timeout in ms. Defaults applied in run.ts. */
  readonly timeoutMs?: number;
  /** Per-node shell command timeout in ms. Overrides the default 120s. */
  readonly shellTimeoutMs?: number;
  /**
   * Minimum ms between fresh `shell_poll` responses for this node's async
   * processes.  Polls arriving before the interval return a stale result
   * (non-blocking).  Default 0 (no throttle).  Set higher for nodes that
   * run long test suites where rapid polling wastes tool-call budget.
   */
  readonly pollMinIntervalMs?: number;
  /**
   * Kill the session when the LLM is idle (no tool calls in-flight AND
   * no new tool call issued) for this many ms.  Only fires when
   * inFlightToolCalls === 0, so long-running Playwright/shell operations
   * do NOT count as inactivity.  Default: no inactivity watchdog.
   */
  readonly inactivityTimeoutMs?: number;
  /** In-place retry count before triggering onFailure. Default 1. */
  readonly maxRetries?: number;
  /**
   * Node id to jump to if this node ultimately fails (after retries).
   * Capped by global maxJumps in run.ts. If omitted, failure terminates
   * the main loop and the finalizer runs with the failure context.
   */
  readonly onFailure?: NodeId;
  /**
   * Conditional failure routing keyed by `fault_domain` string reported
   * via `report_outcome`. When a fault domain matches a key here, the
   * orchestrator skips remaining in-place retries and jumps directly to
   * the target node. Checked before `onFailure` (static fallback).
   */
  readonly onFailureRoutes?: Readonly<Record<string, NodeId>>;
  /**
   * Node id to jump to on success. Used by recovery agents to short-loop
   * back into a validation node after a fix. Default is to advance linearly.
   */
  readonly onSuccess?: NodeId;
  /**
   * When true, this node is skipped during linear pipeline progression
   * (i → i+1). It only executes when reached via failure routing (i.e.
   * `_failureSource` is set). Use for recovery nodes like
   * recovery nodes that have no work to do unless a prior node failed.
   */
  readonly recoveryOnly?: boolean;
  /**
   * If true, this node always runs even if the main loop terminated with
   * an error. Reserved for the pr-creation finalizer.
   */
  readonly alwaysRun?: boolean;
}

export type NodeStatus = "pending" | "running" | "completed" | "failed";

export interface NodeAttempt {
  readonly attempt: number;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly status: "completed" | "failed";
  readonly errorSummary?: string;
  /** Path (under .runs/<slug>/) to the per-attempt log file. */
  readonly logPath: string;
}

export interface NodeOutput {
  status: NodeStatus;
  attempts: NodeAttempt[];
  /** Free-form structured output captured from agent's report_outcome tool. */
  result?: Record<string, unknown>;
  errorSummary?: string;
}

export interface NodeMetrics {
  nodeId: NodeId;
  attempt: number;
  wallClockMs: number;
  toolCalls: Record<string, number>;
  testRuns?: number;
  ok: boolean;
}

export interface RunState {
  readonly slug: string;
  readonly app: string; // app root (e.g. apps/commerce-storefront)
  readonly baseBranch: string;
  readonly featureBranch: string;
  /**
   * Absolute path to the spec-kit feature folder
   * (e.g. apps/commerce-storefront/specs/001-plp-quick-view).
   * Required on the first run; persisted in state.json for resume.
   */
  readonly specFolderPath: string;
  /**
   * Absolute path to the staged `_kickoff/` directory produced by
   * stage-spec.sh. Populated during branch setup; agents read inputs
   * from here.
   */
  readonly kickoffDir: string;
  /**
   * Absolute path to the per-feature `.dagent/<slug>/` directory inside the
   * app root. All run state (state.json, logs/, snapshots/) lives here.
   */
  readonly dagentDir: string;
  /** ISO timestamp. */
  readonly startedAt: string;
  /** Total cross-node failure-routing jumps consumed. */
  jumps: number;
  /** Per-node output, keyed by NodeId. */
  outputs: Partial<Record<NodeId, NodeOutput>>;
  /** Linear history of every node attempt for the finalizer / debugging. */
  history: Array<{ nodeId: NodeId; attempt: NodeAttempt }>;
  /** Port the pipeline-managed dev server is listening on. */
  devServerPort?: number;
  /** Set when the main loop terminated abnormally (cap-5 halt or unhandled error). */
  terminalError?: string;
}

export interface RunOptions {
  readonly slug: string;
  readonly app: string;
  readonly specFolderPath?: string;
  readonly baseBranch: string;
  readonly resume: boolean;
}
