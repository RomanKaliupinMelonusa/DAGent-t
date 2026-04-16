/**
 * apm-types.ts — Type definitions and Zod schemas for APM compiled output.
 *
 * Defines the interface contract between the APM compiler and the orchestrator.
 * The compiled output is a JSON file produced by `apm compile` (or the shim
 * compiler) and consumed by `apm-context-loader.ts` → `watchdog.ts` → `agents.ts`.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

export const ApmMcpLocalConfigSchema = z.object({
  type: z.literal("local"),
  command: z.string(),
  args: z.array(z.string()),
  tools: z.array(z.string()),
  cwd: z.string().optional(),
  availability: z.enum(["required", "optional"]),
  fsMutator: z.boolean().default(true),
});

export const ApmMcpRemoteConfigSchema = z.object({
  type: z.literal("remote"),
  url: z.string().url(),
  tools: z.array(z.string()),
  availability: z.enum(["required", "optional"]),
  fsMutator: z.boolean().default(true),
});

export const ApmMcpConfigSchema = z.discriminatedUnion("type", [
  ApmMcpLocalConfigSchema,
  ApmMcpRemoteConfigSchema,
]);

/**
 * Per-agent cognitive circuit breaker limits.
 * `soft` triggers a structured warning; `hard` force-disconnects the session.
 * Omit to use orchestrator defaults (soft=30, hard=40).
 */
export const ApmToolLimitsSchema = z.object({
  soft: z.number().int().positive().optional(),
  hard: z.number().int().positive().optional(),
  /** Number of writes to the same file before injecting a thrashing warning. */
  writeThreshold: z.number().int().positive().optional(),
  /** Fraction of session timeout at which to inject a wrap-up directive (0–1). */
  preTimeoutPercent: z.number().min(0).max(1).optional(),
}).optional();

/**
 * Per-agent tool allow-lists for Zero-Trust sandboxing.
 * `core` lists built-in and custom tools (e.g. "file_read", "shell", "write_file").
 * `mcp` maps server names to allowed tool arrays or "*" for wildcard access.
 * Omit entirely during migration — the orchestrator falls back to allow-all.
 */
export const ApmAgentToolsSchema = z.object({
  core: z.array(z.string()).optional().describe("Allowed built-in and custom core tools (e.g., file_read, shell, write_file)"),
  mcp: z.record(z.string(), z.any()).optional().describe("Allowed MCP tools per server — keys are server names, values are tool name arrays or '*' wildcard"),
}).optional();

/**
 * Per-agent security profile for config-driven path sandboxing.
 * `allowedWritePaths` — regex strings for allowed file write paths (app-relative). Empty array = read-only.
 * `blockedCommandRegexes` — regex strings matching shell commands to block (e.g. cloud CLI).
 */
export const ApmAgentSecuritySchema = z.object({
  allowedWritePaths: z.array(z.string()).optional()
    .describe("Regex strings for allowed file write paths (app-relative). Empty array = read-only."),
  blockedCommandRegexes: z.array(z.string()).optional()
    .describe("Regex strings matching shell commands to block (e.g. cloud CLI)."),
}).optional();

export const ApmCompiledAgentSchema = z.object({
  /** Fully assembled rules markdown (compiled from .apm/instructions/). */
  rules: z.string(),
  /** Estimated token count of the rules block. */
  tokenCount: z.number().int().nonnegative(),
  /** MCP server configs for this agent, keyed by server name. */
  mcp: z.record(z.string(), ApmMcpConfigSchema),
  /** Skill descriptions available to this agent, keyed by skill name. */
  skills: z.record(z.string(), z.string()),
  /** Per-agent tool call limits (cognitive circuit breaker). */
  toolLimits: ApmToolLimitsSchema,
  /** Per-agent tool allow-lists for Zero-Trust sandboxing. */
  tools: ApmAgentToolsSchema,
  /** Per-agent security profile for config-driven path sandboxing. */
  security: ApmAgentSecuritySchema,
  /** Raw Handlebars template for the agent's system prompt (read from .apm/agents/<promptFile>). */
  systemPromptTemplate: z.string(),
});

// ---------------------------------------------------------------------------
// App runtime config (urls, test commands, etc.) — unified into apm.yml
// ---------------------------------------------------------------------------

export const ApmConfigSchema = z.object({
  /** Default cognitive circuit breaker limits — used when an agent does not declare per-agent toolLimits. */
  defaultToolLimits: ApmToolLimitsSchema,
  /** Generic key-value environment dictionary — replaces cloud-specific url/resource blocks.
   *  Keys are app-defined (e.g. SERVICE_A_URL, SERVICE_B_URL, FUNC_APP_NAME, RESOURCE_GROUP).
   *  Values support ${ENV_VAR} interpolation resolved at compile time. */
  environment: z.record(z.string(), z.string()).optional(),
  directories: z.record(z.string(), z.nullable(z.string())),
  testCommands: z.record(z.string(), z.nullable(z.string())).optional(),
  commitScopes: z.record(z.string(), z.array(z.string())).optional(),
  ciJobs: z.record(z.string(), z.string()).optional(),
  ciWorkflows: z.object({
    app: z.string().optional(),
    infra: z.string().optional(),
    /** Workflow filename patterns for detection in error logs (e.g. ["deploy-service-a.yml", "deploy-service-b.yml"]).
     *  Used by triage signal matching and context-injection scope detection. */
    filePatterns: z.array(z.string()).optional(),
    /** Exact workflow filename for `gh run list --workflow` when polling infra plan results. */
    infraPlanFile: z.string().optional(),
    /** Template string for the PR comment that tells users how to approve (e.g. infra plan). */
    pr_comment_template: z.string().optional(),
  }).optional(),
  /** Lifecycle hooks — shell commands that abstract cloud-specific operations.
   *  Hook scripts live in `.apm/hooks/` and receive config.environment as env vars.
   *  The orchestrator executes these instead of inline cloud CLI commands.
   *  Agents MUST append validation checks to these scripts when provisioning new
   *  resources or endpoints (Self-Mutating Hook pattern). */
  hooks: z.object({
    /** Resolve environment variables from infrastructure outputs (e.g. terraform output).
     *  Runs BEFORE any other hook. Script must print KEY=VALUE lines to stdout.
     *  The orchestrator merges these into config.environment, replacing any unresolved ${VAR} references. */
    resolveEnvironment: z.string().optional(),
    /** Validate deployed infrastructure reachability. Exit 0 = pass, exit 1 = fail (stdout = diagnostic). */
    validateInfra: z.string().optional(),
    /** Validate deployed application endpoints. Exit 0 = pass, exit 1 = fail (stdout = diagnostic). */
    validateApp: z.string().optional(),
    /** Pre-flight auth check. Exit 0 = authenticated, non-zero = not authenticated. */
    preflightAuth: z.string().optional(),
  }).optional(),
  /** Config-driven commit scope warning injected into dev agents when CI/CD files are involved.
   *  Replaces hardcoded scope guidance. Injected by buildDownstreamFailureContext() when present. */
  ci_scope_warning: z.string().optional(),

  // -----------------------------------------------------------------------
  // Kernel tuning — extracted from hardcoded constants (Phase 1 refactor)
  // -----------------------------------------------------------------------

  /** Pipeline cycle limits for reset functions. Controls how many times
   *  each reset path can fire before the pipeline halts. */
  cycle_limits: z.object({
    /** Max reroute cycles via triage profiles (resetNodes). */
    reroute: z.number().int().positive().default(5),
    /** Max phase-level reset cycles (resetPhases, resumeAfterElevated). */
    phases: z.number().int().positive().default(5),
    /** Max script-only reset cycles per phase (resetScripts). */
    scripts: z.number().int().positive().default(10),
  }).optional(),

  /** Number of identical error signatures before declaring a death spiral
   *  and triggering graceful degradation (salvage to draft). */
  max_same_error_cycles: z.number().int().positive().default(3),

  /** Transient retry policy for CI poll and script executor handlers.
   *  Applies to exit-code-2 (transient/network) failures. */
  transient_retry: z.object({
    /** Max retry attempts for transient errors. */
    max: z.number().int().nonnegative().default(5),
    /** Backoff delay between retries in milliseconds. */
    backoff_ms: z.number().int().nonnegative().default(30_000),
  }).optional(),

  /** Error substrings that indicate fatal, non-retryable SDK/auth errors.
   *  When matched, the pipeline halts immediately (no retry). */
  fatal_sdk_errors: z.array(z.string()).optional(),

  /** LLM token pricing (USD per million tokens) for cost estimation.
   *  Defaults to Anthropic Claude Opus 4 direct pricing. */
  model_pricing: z.object({
    inputPerMillion: z.number().nonnegative().default(15),
    outputPerMillion: z.number().nonnegative().default(75),
    cacheReadPerMillion: z.number().nonnegative().default(1.5),
    cacheWritePerMillion: z.number().nonnegative().default(3.75),
  }).optional(),

  /** Node categories whose failures trigger redevelopment context injection
   *  into upstream dev agents. Default: ["test"]. */
  redevelopment_categories: z.array(z.string()).default(["test"]),

  /** Human-readable labels for phase slugs, used in TRANS.md and reports.
   *  Falls back to title-casing the slug. E.g. { "pre-deploy": "Pre-Deploy", "infra": "Infrastructure (Wave 1)" }. */
  phase_labels: z.record(z.string(), z.string()).optional(),

  /** Handler inference map: node type (or "type:script_type") → handler key.
   *  Used by the kernel when a node does not declare an explicit `handler` field.
   *  Extend this to register new node types without changing kernel code.
   *  Built-in defaults (applied when not overridden):
   *    agent → copilot-agent, script:poll → github-ci-poll, script → local-exec,
   *    approval → approval, barrier → barrier, triage → triage */
  handler_defaults: z.record(z.string(), z.string()).optional(),

  /** Custom handler declarations — pre-register handlers with metadata.
   *  Keys are handler names (used in `handler_defaults` or node `handler` fields).
   *  Each entry declares the handler's file path and optional input/output contracts.
   *  Built-in handlers (copilot-agent, local-exec, etc.) don't need declaration.
   *  Example:
   *    handlers:
   *      webhook-notifier:
   *        path: "./handlers/webhook-notifier.ts"
   *        description: "Sends webhook notifications to external systems"
   *        inputs: { webhookUrl: required }
   *        outputs: ["responseStatus"] */
  handlers: z.record(z.string(), z.object({
    /** File path to the handler module (relative to appRoot, must start with "./"). */
    path: z.string(),
    /** Human-readable description of the handler. */
    description: z.string().optional(),
    /** Input keys expected from handlerData. Maps key → "required" | "optional". */
    inputs: z.record(z.string(), z.enum(["required", "optional"])).optional(),
    /** Output keys the handler produces in handlerOutput. */
    outputs: z.array(z.string()).optional(),
  })).optional(),

  /** Node categories that trigger a roam-code re-index after triage reroute.
   *  When a triage handler reroutes to a node whose category is in this list,
   *  the kernel refreshes the semantic graph index before re-execution.
   *  Default: ["dev", "test"]. Set to [] to disable auto-reindex. */
  reindex_categories: z.array(z.string()).default(["dev", "test"]),
});

// ---------------------------------------------------------------------------
// Workflow DAG schemas (workflows.yml)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shared node body fields — reused by both the node catalog and workflow nodes.
// These describe WHAT a node does (execution config), NOT how it connects (graph).
// ---------------------------------------------------------------------------

const circuitBreakerSchema = z.object({
  /** Minimum in-memory attempts before the identical-error detector activates.
   *  Default 3 (skip triggered on attempt 3+ if error and HEAD unchanged). */
  min_attempts_before_skip: z.number().int().positive().default(3),
  /** When true and the CB fires, defer once for a clean-slate revert opportunity
   *  (agent-branch.sh revert) instead of halting immediately.
   *  Replaces the hardcoded `category === "dev"` check. Default: true for dev nodes. */
  allows_revert_bypass: z.boolean().optional(),
  /** When true, a timeout loop triggers salvageForDraft instead of halting.
   *  Replaces the hardcoded `category === "dev" && isTimeoutLoop` check. Default: true for dev nodes. */
  allows_timeout_salvage: z.boolean().optional(),
  /** When true, identical error + identical HEAD causes immediate halt on attempt 2+.
   *  Intended for deterministic (script) handlers where retry with same input is futile.
   *  Replaces the hardcoded `type === "script"` K2 check. Default: true for script nodes. */
  halt_on_identical: z.boolean().optional(),
  /** Effective attempt count at which a revert warning is injected into the agent prompt.
   *  Only applies when allows_revert_bypass is true. Default: 3. */
  revert_warning_at: z.number().int().positive().default(3),
});

const consumesEntrySchema = z.object({
  key: z.string(),
  from: z.string().default("*"),
  required: z.boolean().default(true),
});

/** On-failure routing shape — used by both default_on_failure and per-node on_failure. */
export const OnFailureSchema = z.object({
  /** Key of the triage node that classifies this failure. */
  triage: z.string(),
  /** Domain → target node key. "$SELF" retries the failing node; null halts the pipeline. */
  routes: z.record(z.string(), z.string().nullable()).default({}),
});

/**
 * Node body fields — the execution shape of a node.
 * Shared between the node catalog (ApmNodeCatalogEntrySchema) and
 * the full merged workflow node (ApmWorkflowNodeSchemaBase).
 * Graph-only fields (phase, depends_on, on_failure, poll_target, triage_profile,
 * post_ci_artifact_to_pr) are NOT included here.
 */
const nodeBodyFields = {
  /** Execution type: built-in types are "agent", "script", "approval", "barrier", "triage".
   *  Custom types are allowed — declare a matching handler in config.handler_defaults or node.handler. */
  type: z.string().default("agent"),
  /** Semantic category — built-in: "dev", "test", "deploy", "finalize".
   *  Custom categories are allowed — referenced by redevelopment_categories, reindex_categories, etc. */
  category: z.string(),
  /** Agent key from the agents section (required when type is "agent"). */
  agent: z.string().optional(),
  /**
   * Handler reference for this node. Determines which NodeHandler implementation executes it.
   * Built-in keys: "copilot-agent", "github-ci-poll", "local-exec".
   * Local paths: "./handlers/my-handler.ts" (resolved against appRoot, sandboxed to repo).
   * If omitted, inferred from `type` + `script_type` for backward compatibility.
   */
  handler: z.string().optional(),
  /** Session timeout in minutes. */
  timeout_minutes: z.number().positive().default(15),
  /** Whether pollReadiness() must pass before the agent session starts. */
  requires_data_plane_ready: z.boolean().default(false),
  /** Directory keys (from config.directories) to check for git changes; skip if none. */
  auto_skip_if_no_changes_in: z.array(z.string()).default([]),
  /** When true, auto-skip if feature has 0 deletions (purely additive). */
  auto_skip_if_no_deletions: z.boolean().default(false),
  /** Handlebars template flags — injected as boolean `true` keys into the template context.
   *  Replaces hardcoded itemKey-derived booleans (e.g. isPostDeploy, isLiveUi). */
  template_flags: z.array(z.string()).default([]),
  /** Directory keys (from config.directories) whose changes force this node to run
   *  even when primary auto_skip_if_no_changes_in dirs have no changes.
   *  Replaces the hardcoded live-ui infra change detection hack. */
  force_run_if_changed: z.array(z.string()).default([]),
  /** Commit scope for `agent-commit.sh`. Defaults to "all" (no scope restriction). */
  commit_scope: z.string().default("all"),
  /** Directory keys (from config.directories) or literal path prefixes for scoped git-diff attribution.
   *  Empty array = no scope restriction (all non-state files). Entries ending in "/" are literal prefixes. */
  diff_attribution_dirs: z.array(z.string()).default([]),
  /** @deprecated — push is now local-exec; sentinel logic lives in hooks/write-deploy-sentinels.sh. */
  writes_deploy_sentinel: z.boolean().default(false),
  /** When true, writeChangeManifest() is called before the agent session starts. */
  generates_change_manifest: z.boolean().default(false),
  /** When true, buildPhaseRejectionContext() is injected into the agent prompt
   *  during redevelopment cycles triggered by `pipeline:reset-phases`.
   *  @deprecated field name — use `injects_phase_rejection` in new workflows. */
  injects_infra_rollback: z.boolean().default(false),
  /** Alias for `injects_infra_rollback` — preferred name for new workflows. */
  injects_phase_rejection: z.boolean().optional(),
  /** Deterministic handler type for script nodes: built-in values are "poll" and "local-exec".
   *  Custom script_type values are allowed — declare a matching handler in config.handler_defaults.
   *  Push and publish are now expressed as local-exec with pre/command/post hooks. */
  script_type: z.string().optional(),
  /** Shell command to execute (required when script_type is "local-exec"). */
  command: z.string().optional(),
  /** For poll nodes — the key into config.ciWorkflows for CI_WORKFLOW_FILTER (e.g. "infra", "app"). */
  ci_workflow_key: z.string().optional(),
  /** Shell command to run BEFORE the handler body as a pre-flight check.
   *  If it exits non-zero, the node fails immediately. Runs on every attempt
   *  (including first), so should be idempotent (e.g. kill stale processes,
   *  then validate environment health). The kernel executes this generically
   *  for ALL handler types (agent, script, etc.); all framework-specific
   *  knowledge lives in the command itself. */
  pre: z.string().optional(),
  /** Shell command to run AFTER the handler body completes successfully.
   *  If it exits non-zero, the node fails. Use for cleanup, validation hooks,
   *  or any post-processing that doesn't need LLM involvement.
   *  Executed by the kernel for ALL handler types. */
  post: z.string().optional(),
  /** When true, the kernel auto-captures git HEAD SHA after post-hook completion
   *  and stores it in handlerData.lastPushedSha for downstream poll nodes.
   *  Replaces the hardcoded `category === "deploy" && type === "script"` check. */
  captures_head_sha: z.boolean().default(false),
  /** When true, successful completion signals the watchdog to archive feature files.
   *  Used by the publish-pr node to trigger post-pipeline archiving. */
  signals_create_pr: z.boolean().default(false),
  /** Data keys this node produces in handlerOutput (declared for validation + tracing).
   *  Example: ["lastPushedSha", "ciRunId"]. The kernel validates downstream `consumes`
   *  against upstream `produces` at compile time. */
  produces: z.array(z.string()).default([]),
  /** Data keys this node expects in handlerData from upstream nodes.
   *  Each entry: { key: "lastPushedSha", from: "push-app", required: true }.
   *  `from` = upstream node key (or "*" = any). `required` defaults to true.
   *  The kernel warns/fails at dispatch if required keys are missing. */
  consumes: z.array(consumesEntrySchema).default([]),
  /** When true, this node survives graceful degradation (salvageForDraft). */
  salvage_survivor: z.boolean().optional(),
  /** Per-node circuit breaker configuration. Controls retry behavior, identical-error
   *  detection, and failure escalation. Replaces hardcoded category-based checks. */
  circuit_breaker: circuitBreakerSchema.optional(),
} as const;

// ---------------------------------------------------------------------------
// Node Catalog Entry — the "pool" definition of a reusable node (apm.yml → nodes:)
// No graph-only fields (phase, depends_on, on_failure, poll_target, triage_profile, post_ci_artifact_to_pr).
// ---------------------------------------------------------------------------

export const ApmNodeCatalogEntrySchema = z.object(nodeBodyFields);

// ---------------------------------------------------------------------------
// Workflow Node Ref — how a workflow references a pool node + graph wiring.
// Graph-only fields are required/present; body fields are optional overrides.
// After the compiler merges pool defaults + ref overrides, the result matches
// ApmWorkflowNodeSchema (the full merged shape used by the runtime).
// ---------------------------------------------------------------------------

/** Make all node body fields optional for workflow ref overrides. */
const optionalNodeBodyFields = Object.fromEntries(
  Object.entries(nodeBodyFields).map(([key, schema]) => [key, (schema as z.ZodTypeAny).optional()]),
) as { [K in keyof typeof nodeBodyFields]: z.ZodOptional<(typeof nodeBodyFields)[K]> };

export const ApmWorkflowNodeRefSchema = z.object({
  /** Explicit reference to a node catalog entry by key. If omitted, the compiler
   *  matches by workflow node key against the catalog. Replaces `_template`. */
  _node: z.string().optional(),
  /** Pipeline phase this node belongs to (must appear in the workflow's phases array). */
  phase: z.string(),
  /** DAG edges — keys of nodes that must complete before this one can run. */
  depends_on: z.array(z.string()).default([]),
  /** @deprecated Use `on_failure` instead. Triage profile name (from the workflow's `triage` section). */
  triage: z.string().optional(),
  /** Failure routing config — merged with workflow-level default_on_failure.
   *  Per-node routes override defaults. If triage is omitted here but present in
   *  default_on_failure, the default is inherited. */
  on_failure: OnFailureSchema.partial().optional(),
  /** Triage profile name — only used on nodes with `type: "triage"`. */
  triage_profile: z.string().optional(),
  /** For poll nodes — the key of the push node whose SHA to look up in handlerOutputs. */
  poll_target: z.string().optional(),
  /** When set, runPollCi downloads the named CI artifact and posts it to the PR (e.g. "plan-output"). */
  post_ci_artifact_to_pr: z.string().optional(),
  // --- All body fields as optional overrides ---
  ...optionalNodeBodyFields,
});

// ---------------------------------------------------------------------------
// Full merged workflow node — the shape after compiler merges pool + ref + defaults.
// This is what the runtime (session-runner, agents.ts) consumes.
// ---------------------------------------------------------------------------

const ApmWorkflowNodeSchemaBase = z.object({
  ...nodeBodyFields,
  /** Pipeline phase this node belongs to (must appear in the workflow's phases array). */
  phase: z.string(),
  /** DAG edges — keys of nodes that must complete before this one can run. */
  depends_on: z.array(z.string()).default([]),
  /** @deprecated Use `on_failure` instead. Triage profile name (from the workflow's `triage` section). When set, failures trigger triage evaluation. */
  triage: z.string().optional(),
  /** Failure routing config — declares which triage node classifies failures
   *  and where each classified domain routes to.
   *  `triage`: key of a triage node in this workflow.
   *  `routes`: domain → target node key (or "$SELF" to retry, or null to halt).
   *  Unmatched domains default to "$SELF". */
  on_failure: OnFailureSchema.optional(),
  /** Triage profile name — only used on nodes with `type: "triage"`.
   *  References a profile from the workflow's `triage` section. */
  triage_profile: z.string().optional(),
  /** For poll nodes — the key of the push node whose SHA to look up in handlerOutputs. */
  poll_target: z.string().optional(),
  /** When set, runPollCi downloads the named CI artifact and posts it to the PR (e.g. "plan-output"). */
  post_ci_artifact_to_pr: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Node constraint system — extensible validation for built-in + custom types
// ---------------------------------------------------------------------------

/**
 * A node constraint function. Returns true if valid, false if violated.
 * The framework runs all constraints for the node's type; custom types
 * register constraints via `registerNodeConstraint()`.
 */
export interface NodeConstraint {
  /** Constraint applies to nodes with this type (or "*" for all types). */
  type: string;
  /** Human-readable error message when constraint fails. */
  message: string;
  /** Validation function — return true if constraint is satisfied. */
  check: (node: Record<string, unknown>) => boolean;
}

/** Registry of node constraints, keyed by type. */
const NODE_CONSTRAINTS: NodeConstraint[] = [
  // ── agent constraints ──
  { type: "agent", message: "Workflow node with type 'agent' must declare an 'agent' field.", check: (n) => typeof n.agent === "string" },
  // ── script constraints ──
  { type: "script", message: "Workflow node with script_type 'poll' must declare a 'poll_target' field.", check: (n) => n.script_type !== "poll" || typeof n.poll_target === "string" },
  { type: "script", message: "Workflow node with script_type 'local-exec' must declare a 'command' field.", check: (n) => n.script_type !== "local-exec" || typeof n.command === "string" },
  // ── barrier constraints ──
  { type: "barrier", message: "Barrier node must declare at least 2 entries in 'depends_on'.", check: (n) => Array.isArray(n.depends_on) && (n.depends_on as string[]).length >= 2 },
  { type: "barrier", message: "Barrier node must not declare an 'agent' field.", check: (n) => !n.agent },
  { type: "barrier", message: "Barrier node must not declare a 'command' field.", check: (n) => !n.command },
  { type: "barrier", message: "Barrier node must not declare a 'script_type' field.", check: (n) => !n.script_type },
  // ── triage constraints ──
  { type: "triage", message: "Triage node must declare a 'triage_profile' field.", check: (n) => typeof n.triage_profile === "string" },
  { type: "triage", message: "Triage node must not declare an 'agent' field.", check: (n) => !n.agent },
  { type: "triage", message: "Triage node must not declare a 'command' field.", check: (n) => !n.command },
];

/**
 * Register a custom node constraint. Custom types call this to add
 * validation rules that run at workflow parse time.
 *
 * @example
 * registerNodeConstraint({
 *   type: "webhook",
 *   message: "Webhook node must declare a 'webhook_url' field.",
 *   check: (n) => typeof n.webhook_url === "string",
 * });
 */
export function registerNodeConstraint(constraint: NodeConstraint): void {
  NODE_CONSTRAINTS.push(constraint);
}

/**
 * Validate a parsed workflow node against all applicable constraints.
 * Returns an array of violation messages (empty = valid).
 */
export function validateNodeConstraints(node: Record<string, unknown>): string[] {
  const nodeType = (node.type as string) ?? "agent";
  const violations: string[] = [];
  for (const c of NODE_CONSTRAINTS) {
    if (c.type !== nodeType && c.type !== "*") continue;
    if (!c.check(node)) violations.push(c.message);
  }
  return violations;
}

/**
 * Zod-compatible superRefine that runs the constraint registry.
 * Applied to ApmWorkflowNodeSchema via .superRefine().
 */
function nodeConstraintRefine(node: Record<string, unknown>, ctx: z.RefinementCtx): void {
  for (const msg of validateNodeConstraints(node)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
  }
}

export const ApmWorkflowNodeSchema = ApmWorkflowNodeSchemaBase.superRefine(nodeConstraintRefine);

/**
 * Topological sort for DAG acyclicity validation.
 * Returns sorted keys or throws on cycle detection.
 */
export function topoSort(nodes: Record<string, { depends_on?: string[] }>): string[] {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const result: string[] = [];

  function visit(key: string): void {
    if (stack.has(key)) throw new Error(`Cycle detected in workflow DAG involving node "${key}"`);
    if (visited.has(key)) return;
    stack.add(key);
    for (const dep of nodes[key]?.depends_on ?? []) {
      visit(dep);
    }
    stack.delete(key);
    visited.add(key);
    result.push(key);
  }

  for (const key of Object.keys(nodes)) visit(key);
  return result;
}

// ---------------------------------------------------------------------------
// Triage Profile schemas (v2 — DAG-native routing)
// ---------------------------------------------------------------------------

/** A single routing entry inside a triage profile — domain classification hint for the triage engine. */
export const TriageRouteEntrySchema = z.object({
  /** Human-readable description of this fault domain (injected into LLM triage prompt). */
  description: z.string().optional(),
  /** @deprecated Routing now lives on the failing node's on_failure.routes. Kept for backward compat.
   *  Single DAG node key to route to. Use "$SELF" to retry the failing node itself. Use `null` to signal "blocked". */
  route_to: z.string().nullable().optional(),
  /** Maximum consecutive times this domain can trigger a reroute before escalating to blocked.
   *  Default: unlimited (governed by profile-level max_reroutes). */
  retries: z.number().int().positive().optional(),
});

/** Triage profile — a reusable triage configuration referenced by workflow nodes. */
export const TriageProfileSchema = z.object({
  /** Names of triage packs (from .apm/triage-packs/<name>.json) used by the RAG layer. */
  packs: z.array(z.string()).default([]),
  /** @deprecated Use `classifier` instead. Enable LLM fallback when the RAG layer has no match. */
  llm_fallback: z.boolean().default(true),
  /** Classification strategy for the triage engine.
   *  - `"rag+llm"` (default): RAG first, LLM fallback if no match.
   *  - `"rag-only"`: Deterministic RAG only — no LLM cost.
   *  - `"llm-only"`: Skip RAG, always use LLM cognitive classification.
   *  When set, overrides `llm_fallback`. */
  classifier: z.enum(["rag+llm", "rag-only", "llm-only"]).optional(),
  /** Maximum total reroutes allowed for this profile before the pipeline halts.
   *  Replaces the separate max_redevelopment_cycles / max_redeploy_cycles budgets. */
  max_reroutes: z.number().int().positive().default(5),
  /** Domain → routing entry. Domain keys are dynamic per-profile (no global enum). */
  routing: z.record(z.string(), TriageRouteEntrySchema),
});

export const ApmWorkflowSchema = z.object({
  /** Human-readable description for UI display. */
  description: z.string().optional(),
  /** Explicit ordered phase names (human-authored). */
  phases: z.array(z.string()),
  /** Pipeline nodes keyed by item key. */
  nodes: z.record(z.string(), ApmWorkflowNodeSchema),
  /** Workflow-level default failure routing — inherited by nodes that declare on_failure.
   *  Per-node on_failure.routes override/extend these defaults.
   *  Nodes without on_failure are unaffected (no implicit opt-in). */
  default_on_failure: OnFailureSchema.optional(),
  /** Error substrings that signal unfixable conditions — no agent can fix these.
   *  When any signal matches, the pipeline halts immediately for human intervention. */
  unfixable_signals: z.array(z.string()).default([]),
  /** Triage profiles — keyed by profile name. Nodes reference profiles via the `triage` field.
   *  Each profile declares RAG packs, LLM fallback, routing domains, and reroute budgets. */
  triage: z.record(z.string(), TriageProfileSchema).default({}),
}).refine(
  (wf) => {
    // Validate: every depends_on reference is a valid node key
    const nodeKeys = new Set(Object.keys(wf.nodes));
    for (const [key, node] of Object.entries(wf.nodes)) {
      for (const dep of node.depends_on) {
        if (!nodeKeys.has(dep)) return false;
      }
    }
    return true;
  },
  { message: "Workflow node depends_on references an undefined node key." },
).refine(
  (wf) => {
    // Validate: every node's phase appears in the phases array
    const phases = new Set(wf.phases);
    for (const node of Object.values(wf.nodes)) {
      if (!phases.has(node.phase)) return false;
    }
    return true;
  },
  { message: "Workflow node references a phase not listed in the workflow's phases array." },
).refine(
  (wf) => {
    // Validate: DAG is acyclic
    try {
      topoSort(wf.nodes);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Workflow DAG contains a cycle." },
).refine(
  (wf) => {
    // Validate: every triage profile route_to (deprecated) is "$SELF", null, or a valid node key
    const nodeKeys = new Set(Object.keys(wf.nodes));
    for (const [profileName, profile] of Object.entries(wf.triage)) {
      for (const [domain, entry] of Object.entries(profile.routing)) {
        if (entry.route_to !== undefined && entry.route_to !== null && entry.route_to !== "$SELF" && !nodeKeys.has(entry.route_to)) {
          return false;
        }
      }
    }
    return true;
  },
  { message: "Triage profile route_to references an undefined node key (use \"$SELF\" or null)." },
).refine(
  (wf) => {
    // Validate: every node's triage field references a defined triage profile
    for (const [key, node] of Object.entries(wf.nodes)) {
      if (node.triage && !(node.triage in wf.triage)) return false;
    }
    return true;
  },
  { message: "Workflow node references an undefined triage profile." },
).refine(
  (wf) => {
    // Validate: every on_failure.triage reference points to a triage node in this workflow
    const nodeKeys = new Set(Object.keys(wf.nodes));
    for (const [key, node] of Object.entries(wf.nodes)) {
      if (node.on_failure) {
        const triageKey = node.on_failure.triage;
        if (!nodeKeys.has(triageKey)) return false;
        const target = wf.nodes[triageKey];
        if (target.type !== "triage") return false;
        // Validate: every route value is a valid node key, "$SELF", or null
        for (const [domain, routeTo] of Object.entries(node.on_failure.routes)) {
          if (routeTo !== null && routeTo !== "$SELF" && !nodeKeys.has(routeTo)) return false;
        }
      }
    }
    return true;
  },
  { message: "on_failure.triage must reference a triage node; on_failure.routes values must be valid node keys, '$SELF', or null." },
).refine(
  (wf) => {
    // Validate: every triage node's triage_profile references a defined triage profile
    for (const [key, node] of Object.entries(wf.nodes)) {
      if (node.type === "triage" && node.triage_profile && !(node.triage_profile in wf.triage)) return false;
    }
    return true;
  },
  { message: "Triage node's triage_profile references an undefined triage profile." },
);

// ---------------------------------------------------------------------------
// Triage Knowledge Base schemas (RAG triage packs)
// ---------------------------------------------------------------------------

/** A single triage signature — maps an error snippet to a fault domain. */
export const TriageSignatureSchema = z.object({
  /** The exact substring to fast-match against error traces. */
  error_snippet: z.string(),
  /** Target fault domain for routing (must exist in the triage profile's routing section). */
  fault_domain: z.string(),
  /** Human-readable explanation of why this snippet maps to this domain. */
  reason: z.string(),
});

/** A triage pack — a named collection of signatures for a specific stack. */
export const TriagePackSchema = z.object({
  name: z.string(),
  stack: z.string(),
  signatures: z.array(TriageSignatureSchema),
});

/** A compiled triage profile — profile with pack signatures resolved inline. */
export const CompiledTriageProfileSchema = z.object({
  /** @deprecated Use `classifier` instead. */
  llm_fallback: z.boolean(),
  /** Classification strategy — resolved from profile. When absent, derive from llm_fallback. */
  classifier: z.enum(["rag+llm", "rag-only", "llm-only"]).optional(),
  max_reroutes: z.number().int().positive(),
  routing: z.record(z.string(), TriageRouteEntrySchema),
  /** Resolved signatures from the referenced packs. */
  signatures: z.array(TriageSignatureSchema),
});

export const ApmCompiledOutputSchema = z.object({
  version: z.literal("1.0.0"),
  compiledAt: z.string(),
  tokenBudget: z.number().int().positive(),
  agents: z.record(z.string(), ApmCompiledAgentSchema),
  config: ApmConfigSchema.optional(),
  /** Workflow DAG definitions (keyed by workflow name, e.g. "default"). */
  workflows: z.record(z.string(), ApmWorkflowSchema).default({}),

  /** Compiled triage profiles — keyed by "<workflow>.<profile>" (e.g. "default.storefront"). */
  triage_profiles: z.record(z.string(), CompiledTriageProfileSchema).default({}),
});

// ---------------------------------------------------------------------------
// apm.yml manifest schemas
// ---------------------------------------------------------------------------

export const ApmAgentDeclSchema = z.object({
  instructions: z.array(z.string()),
  /** Path to the Handlebars agent template relative to .apm/agents/. */
  promptFile: z.string().describe("Path to the Handlebars agent template relative to .apm/agents/"),
  mcp: z.array(z.string()),
  skills: z.array(z.string()).default([]),
  toolLimits: ApmToolLimitsSchema,
  tools: ApmAgentToolsSchema,
  security: ApmAgentSecuritySchema,
});

export const ApmGeneratedInstructionSchema = z.object({
  instructions: z.array(z.string()),
  title: z.string(),
  preamble: z.string().optional(),
});

export const ApmManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  tokenBudget: z.number().int().positive(),
  agents: z.record(z.string(), ApmAgentDeclSchema),
  /** Reusable node pool — all node types (agent, script, barrier, triage, approval).
   *  Replaces `_templates` from workflows.yml. Nodes define WHAT to execute;
   *  workflows define HOW to connect them (phase, edges, failure routing). */
  nodes: z.record(z.string(), ApmNodeCatalogEntrySchema).default({}),
  generatedInstructions: z
    .record(z.string(), ApmGeneratedInstructionSchema)
    .optional(),
  config: ApmConfigSchema.optional(),
});

// ---------------------------------------------------------------------------
// MCP file schema (roam-code.mcp.yml, playwright.mcp.yml)
// ---------------------------------------------------------------------------

export const ApmMcpLocalFileSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  type: z.literal("local"),
  command: z.string(),
  args: z.array(z.string()),
  tools: z.array(z.string()).default(["*"]),
  cwd: z.string().optional(),
  availability: z.enum(["required", "optional"]).default("optional"),
  fsMutator: z.boolean().default(true),
});

export const ApmMcpRemoteFileSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  type: z.literal("remote"),
  url: z.string().url(),
  tools: z.array(z.string()).default(["*"]),
  availability: z.enum(["required", "optional"]).default("optional"),
  fsMutator: z.boolean().default(true),
});

export const ApmMcpFileSchema = z.discriminatedUnion("type", [
  ApmMcpLocalFileSchema,
  ApmMcpRemoteFileSchema,
]);

// ---------------------------------------------------------------------------
// Skill file schema (parsed from YAML frontmatter of .skill.md)
// ---------------------------------------------------------------------------

export const ApmSkillFrontmatterSchema = z.object({
  name: z.string(),
  command: z.string().optional(),
  description: z.string(),
});

// ---------------------------------------------------------------------------
// Inferred TypeScript Types
// ---------------------------------------------------------------------------

export type ApmConfig = z.infer<typeof ApmConfigSchema>;
export type ApmMcpConfig = z.infer<typeof ApmMcpConfigSchema>;
export type ApmToolLimits = z.infer<typeof ApmToolLimitsSchema>;
export type ApmAgentTools = z.infer<typeof ApmAgentToolsSchema>;
export type ApmAgentSecurity = z.infer<typeof ApmAgentSecuritySchema>;
export type ApmCompiledAgent = z.infer<typeof ApmCompiledAgentSchema>;
export type ApmCompiledOutput = z.infer<typeof ApmCompiledOutputSchema>;
export type ApmWorkflowNode = z.infer<typeof ApmWorkflowNodeSchema>;
export type ApmWorkflowNodeRef = z.infer<typeof ApmWorkflowNodeRefSchema>;
export type ApmNodeCatalogEntry = z.infer<typeof ApmNodeCatalogEntrySchema>;
export type ApmWorkflow = z.infer<typeof ApmWorkflowSchema>;
export type ApmManifest = z.infer<typeof ApmManifestSchema>;
export type OnFailure = z.infer<typeof OnFailureSchema>;
export type ApmMcpFile = z.infer<typeof ApmMcpFileSchema>;
export type ApmSkillFrontmatter = z.infer<typeof ApmSkillFrontmatterSchema>;
export type ApmGeneratedInstruction = z.infer<typeof ApmGeneratedInstructionSchema>;
export type TriageSignature = z.infer<typeof TriageSignatureSchema>;
export type TriagePack = z.infer<typeof TriagePackSchema>;
export type TriageRouteEntry = z.infer<typeof TriageRouteEntrySchema>;
export type TriageProfile = z.infer<typeof TriageProfileSchema>;
export type CompiledTriageProfile = z.infer<typeof CompiledTriageProfileSchema>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ApmCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApmCompileError";
  }
}

export class ApmBudgetExceededError extends ApmCompileError {
  constructor(
    public readonly agentKey: string,
    public readonly actualTokens: number,
    public readonly budget: number,
  ) {
    super(
      `APM token budget exceeded for agent "${agentKey}": ` +
      `~${actualTokens} tokens assembled, budget is ${budget}. ` +
      `Refactor instruction files in .apm/instructions/ to reduce size.`,
    );
    this.name = "ApmBudgetExceededError";
  }
}
