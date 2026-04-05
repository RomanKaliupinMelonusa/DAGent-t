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

export const ApmCompiledOutputSchema = z.object({
  version: z.literal("1.0.0"),
  compiledAt: z.string(),
  tokenBudget: z.number().int().positive(),
  agents: z.record(z.string(), ApmCompiledAgentSchema),
  config: ApmConfigSchema.optional(),
});

// ---------------------------------------------------------------------------
// apm.yml manifest schemas
// ---------------------------------------------------------------------------

export const ApmAgentDeclSchema = z.object({
  instructions: z.array(z.string()),
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
