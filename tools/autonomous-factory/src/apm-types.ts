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
   *  Keys are app-defined (e.g. FRONTEND_URL, BACKEND_URL, FUNC_APP_NAME, RESOURCE_GROUP).
   *  Values support ${ENV_VAR} interpolation resolved at compile time. */
  environment: z.record(z.string(), z.string()).optional(),
  directories: z.record(z.string(), z.nullable(z.string())),
  testCommands: z.record(z.string(), z.nullable(z.string())).optional(),
  commitScopes: z.record(z.string(), z.array(z.string())).optional(),
  ciJobs: z.record(z.string(), z.string()).optional(),
  ciWorkflows: z.object({
    app: z.string().optional(),
    infra: z.string().optional(),
    /** Workflow filename patterns for detection in error logs (e.g. ["deploy-backend.yml", "deploy-frontend.yml"]).
     *  Used by triage signal matching and context-injection scope detection. */
    filePatterns: z.array(z.string()).optional(),
    /** Exact workflow filename for `gh run list --workflow` when polling infra plan results. */
    infraPlanFile: z.string().optional(),
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
  preflight: z
    .object({
      apimRouteCheck: z
        .object({
          functionGlob: z.string(),
          specGlob: z.string(),
        })
        .optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Workflow DAG schemas (workflows.yml)
// ---------------------------------------------------------------------------

export const ApmWorkflowNodeSchema = z.object({
  /** Execution type: agent = LLM session, script = deterministic shell, approval = human gate. */
  type: z.enum(["agent", "script", "approval"]).default("agent"),
  /** Semantic category — replaces hardcoded DEV_ITEMS / TEST_ITEMS / POST_DEPLOY_ITEMS sets. */
  category: z.enum(["dev", "test", "deploy", "finalize"]),
  /** Agent key from the agents section (required when type is "agent"). */
  agent: z.string().optional(),
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
  /** Whether `pipeline:fail` messages must be valid TriageDiagnostic JSON for triage routing. */
  triage_json_gated: z.boolean().default(false),
  /** Commit scope for `agent-commit.sh`. Defaults to "all" (no scope restriction). */
  commit_scope: z.string().default("all"),
  /** Directory keys (from config.directories) or literal path prefixes for scoped git-diff attribution.
   *  Empty array = no scope restriction (all non-state files). Entries ending in "/" are literal prefixes. */
  diff_attribution_dirs: z.array(z.string()).default([]),
  /** When true, runPushCode writes `.deploy-trigger` sentinel files to force CI. */
  writes_deploy_sentinel: z.boolean().default(false),
  /** When set, runPollCi downloads the named CI artifact and posts it to the PR (e.g. "plan-output"). */
  post_ci_artifact_to_pr: z.string().optional(),
  /** When true, writeChangeManifest() is called before the agent session starts. */
  generates_change_manifest: z.boolean().default(false),
  /** When true, buildInfraRollbackContext() is injected into the agent prompt. */
  injects_infra_rollback: z.boolean().default(false),
}).refine(
  (node) => node.type !== "agent" || typeof node.agent === "string",
  { message: "Workflow node with type 'agent' must declare an 'agent' field." },
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

/** Schema for a fault_routing entry — maps a fault domain to the nodes that should be reset. */
export const ApmFaultRouteSchema = z.object({
  /** Node keys to reset. Use "$SELF" as a sentinel that the kernel replaces with the current itemKey at runtime. */
  reset_nodes: z.array(z.string()),
});

export const ApmWorkflowSchema = z.object({
  /** Explicit ordered phase names (human-authored). */
  phases: z.array(z.string()),
  /** Pipeline nodes keyed by item key. */
  nodes: z.record(z.string(), ApmWorkflowNodeSchema),
  /** Maximum redevelopment cycles before the pipeline halts. */
  max_redevelopment_cycles: z.number().int().positive().default(5),
  /** Maximum re-deploy cycles before the pipeline halts. */
  max_redeploy_cycles: z.number().int().positive().default(3),
  /** Declarative fault routing — maps fault domain strings to reset node lists.
   *  WYSIWYG: the kernel returns exactly what is declared here. No hidden appending.
   *  Use "$SELF" to include the calling item in the reset list. */
  fault_routing: z.record(z.string(), ApmFaultRouteSchema).default({}),
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
    // Validate: every fault_routing reset_nodes entry is "$SELF" or a valid node key
    const nodeKeys = new Set(Object.keys(wf.nodes));
    for (const [domain, route] of Object.entries(wf.fault_routing)) {
      for (const node of route.reset_nodes) {
        if (node !== "$SELF" && !nodeKeys.has(node)) return false;
      }
    }
    return true;
  },
  { message: "fault_routing reset_nodes references an undefined node key (use \"$SELF\" for the calling item)." },
);

export const ApmCompiledOutputSchema = z.object({
  version: z.literal("1.0.0"),
  compiledAt: z.string(),
  tokenBudget: z.number().int().positive(),
  agents: z.record(z.string(), ApmCompiledAgentSchema),
  config: ApmConfigSchema.optional(),
  /** Workflow DAG definitions (keyed by workflow name, e.g. "default"). */
  workflows: z.record(z.string(), ApmWorkflowSchema).default({}),
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
export type ApmFaultRoute = z.infer<typeof ApmFaultRouteSchema>;
export type ApmManifest = z.infer<typeof ApmManifestSchema>;
export type ApmMcpFile = z.infer<typeof ApmMcpFileSchema>;
export type ApmSkillFrontmatter = z.infer<typeof ApmSkillFrontmatterSchema>;
export type ApmGeneratedInstruction = z.infer<typeof ApmGeneratedInstructionSchema>;

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
