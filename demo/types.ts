/**
 * types.ts — Shape of every node and the run-state that flows between them.
 *
 * Linear-array pipeline. No DAG, no scheduler. Failure routing is done
 * by jumping the index in `run.ts` to the node id named in `onFailure`.
 */

export type NodeId =
  | "dev"
  | "unit-test"
  | "e2e-author"
  | "e2e-runner"
  | "storefront-debug"
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
  /** In-place retry count before triggering onFailure. Default 1. */
  readonly maxRetries?: number;
  /**
   * Node id to jump to if this node ultimately fails (after retries).
   * Capped by global maxJumps in run.ts. If omitted, failure terminates
   * the main loop and the finalizer runs with the failure context.
   */
  readonly onFailure?: NodeId;
  /**
   * Node id to jump to on success. Used by storefront-debug to short-loop
   * back into unit-test after a code fix. Default is to advance linearly.
   */
  readonly onSuccess?: NodeId;
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

export interface RunState {
  readonly slug: string;
  readonly app: string; // app root (e.g. apps/commerce-storefront)
  readonly baseBranch: string;
  readonly featureBranch: string;
  readonly specPath: string;
  readonly e2eGuidePath: string;
  /** ISO timestamp. */
  readonly startedAt: string;
  /** Total cross-node failure-routing jumps consumed. */
  jumps: number;
  /** Per-node output, keyed by NodeId. */
  outputs: Partial<Record<NodeId, NodeOutput>>;
  /** Linear history of every node attempt for the finalizer / debugging. */
  history: Array<{ nodeId: NodeId; attempt: NodeAttempt }>;
  /** Set when the main loop terminated abnormally (cap-5 halt or unhandled error). */
  terminalError?: string;
}

export interface RunOptions {
  readonly slug: string;
  readonly app: string;
  readonly specPath?: string;
  readonly e2eGuidePath?: string;
  readonly baseBranch: string;
  readonly resume: boolean;
}
