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
});

// ---------------------------------------------------------------------------
// Workflow DAG schemas (workflows.yml)
// ---------------------------------------------------------------------------

export const ApmWorkflowNodeSchema = z.object({
  /** Execution type: agent = LLM session, script = deterministic shell, approval = human gate, barrier = DAG sync point, triage = failure classification node. */
  type: z.enum(["agent", "script", "approval", "barrier", "triage"]).default("agent"),
  /** Semantic category — replaces hardcoded DEV_ITEMS / TEST_ITEMS / POST_DEPLOY_ITEMS sets. */
  category: z.enum(["dev", "test", "deploy", "finalize"]),
  /** Agent key from the agents section (required when type is "agent"). */
  agent: z.string().optional(),
  /**
   * Handler reference for this node. Determines which NodeHandler implementation executes it.
   * Built-in keys: "copilot-agent", "github-ci-poll", "local-exec".
   * Local paths: "./handlers/my-handler.ts" (resolved against appRoot, sandboxed to repo).
   * If omitted, inferred from `type` + `script_type` for backward compatibility.
   */
  handler: z.string().optional(),
  /** Pipeline phase this node belongs to (must appear in the workflow's phases array). */
  phase: z.string(),
  /** Session timeout in minutes. */
  timeout_minutes: z.number().positive().default(15),
  /** DAG edges — keys of nodes that must complete before this one can run. */
  depends_on: z.array(z.string()).default([]),
  /** Workflow types this node participates in. Empty array = all types. */
  run_if: z.array(z.string()).default([]),
  /** Whether pollReadiness() must pass before the agent session starts. */
  requires_data_plane_ready: z.boolean().default(false),
  /** Directory keys (from config.directories) to check for git changes; skip if none. */
  auto_skip_if_no_changes_in: z.array(z.string()).default([]),
  /** When true, auto-skip if feature has 0 deletions (purely additive). */
  auto_skip_if_no_deletions: z.boolean().default(false),
  /** @deprecated Use `on_failure` instead. Triage profile name (from the workflow's `triage` section). When set, failures trigger triage evaluation. */
  triage: z.string().optional(),
  /** Key of a triage node to dispatch to when this node fails.
   *  Replaces `triage` — decouples failure routing from inline profile resolution.
   *  The referenced node must have `type: "triage"` and exist in the same workflow. */
  on_failure: z.string().optional(),
  /** Triage profile name — only used on nodes with `type: "triage"`.
   *  References a profile from the workflow's `triage` section. */
  triage_profile: z.string().optional(),
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
  /** When set, runPollCi downloads the named CI artifact and posts it to the PR (e.g. "plan-output"). */
  post_ci_artifact_to_pr: z.string().optional(),
  /** When true, writeChangeManifest() is called before the agent session starts. */
  generates_change_manifest: z.boolean().default(false),
  /** When true, buildPhaseRejectionContext() is injected into the agent prompt
   *  during redevelopment cycles triggered by `pipeline:reset-phases`.
   *  @deprecated field name — use `injects_phase_rejection` in new workflows. */
  injects_infra_rollback: z.boolean().default(false),
  /** Alias for `injects_infra_rollback` — preferred name for new workflows. */
  injects_phase_rejection: z.boolean().optional(),
  /** Deterministic handler type for script nodes: poll or local-exec.
   *  Push and publish are now expressed as local-exec with pre/command/post hooks. */
  script_type: z.enum(["poll", "local-exec"]).optional(),
  /** Shell command to execute (required when script_type is "local-exec"). */
  command: z.string().optional(),
  /** For poll nodes — the key of the push node whose SHA to look up in state.lastPushedShas. */
  poll_target: z.string().optional(),
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
  /** When true, this node survives graceful degradation (salvageForDraft). */
  salvage_survivor: z.boolean().optional(),

  // -----------------------------------------------------------------------
  // Circuit breaker — per-node retry and failure handling config (Phase 2)
  // -----------------------------------------------------------------------

  /** Per-node circuit breaker configuration. Controls retry behavior, identical-error
   *  detection, and failure escalation. Replaces hardcoded category-based checks. */
  circuit_breaker: z.object({
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
  }).optional(),
}).refine(
  (node) => node.type !== "agent" || typeof node.agent === "string",
  { message: "Workflow node with type 'agent' must declare an 'agent' field." },
).refine(
  (node) => node.script_type !== "poll" || typeof node.poll_target === "string",
  { message: "Workflow node with script_type 'poll' must declare a 'poll_target' field." },
).refine(
  (node) => !(node.type === "script" && node.script_type === "local-exec") || typeof node.command === "string",
  { message: "Workflow node with script_type 'local-exec' must declare a 'command' field." },
).refine(
  (node) => node.type !== "barrier" || (node.depends_on && node.depends_on.length >= 2),
  { message: "Barrier node must declare at least 2 entries in 'depends_on' (a single dependency does not need a barrier)." },
).refine(
  (node) => node.type !== "barrier" || !node.agent,
  { message: "Barrier node must not declare an 'agent' field (barriers have zero execution)." },
).refine(
  (node) => node.type !== "barrier" || !node.command,
  { message: "Barrier node must not declare a 'command' field (barriers have zero execution)." },
).refine(
  (node) => node.type !== "barrier" || !node.script_type,
  { message: "Barrier node must not declare a 'script_type' field (barriers have zero execution)." },
).refine(
  (node) => node.type !== "triage" || typeof node.triage_profile === "string",
  { message: "Triage node must declare a 'triage_profile' field referencing a triage profile." },
).refine(
  (node) => node.type !== "triage" || !node.agent,
  { message: "Triage node must not declare an 'agent' field." },
).refine(
  (node) => node.type !== "triage" || !node.command,
  { message: "Triage node must not declare a 'command' field." },
);

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

/** A single routing entry inside a triage profile — maps a domain to a single DAG entry-point node. */
export const TriageRouteEntrySchema = z.object({
  /** Human-readable description of this fault domain (injected into LLM triage prompt). */
  description: z.string().optional(),
  /** Single DAG node key to route to. The kernel resets this node + all transitive downstream dependents.
   *  Use "$SELF" to retry the failing node itself. Use `null` to signal "blocked" (halt pipeline). */
  route_to: z.string().nullable(),
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
  /** Explicit ordered phase names (human-authored). */
  phases: z.array(z.string()),
  /** Pipeline nodes keyed by item key. */
  nodes: z.record(z.string(), ApmWorkflowNodeSchema),
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
    // Validate: every triage profile route_to is "$SELF", null, or a valid node key
    const nodeKeys = new Set(Object.keys(wf.nodes));
    for (const [profileName, profile] of Object.entries(wf.triage)) {
      for (const [domain, entry] of Object.entries(profile.routing)) {
        if (entry.route_to !== null && entry.route_to !== "$SELF" && !nodeKeys.has(entry.route_to)) {
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
    // Validate: every on_failure reference points to a triage node in this workflow
    const nodeKeys = new Set(Object.keys(wf.nodes));
    for (const [key, node] of Object.entries(wf.nodes)) {
      if (node.on_failure) {
        if (!nodeKeys.has(node.on_failure)) return false;
        const target = wf.nodes[node.on_failure];
        if (target.type !== "triage") return false;
      }
    }
    return true;
  },
  { message: "on_failure must reference a node with type 'triage' that exists in the workflow." },
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
export type ApmWorkflow = z.infer<typeof ApmWorkflowSchema>;
export type ApmManifest = z.infer<typeof ApmManifestSchema>;
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
