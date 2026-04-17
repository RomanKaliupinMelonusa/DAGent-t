/**
 * agents.ts — Agent prompt factory for the SDK orchestrator.
 *
 * Compiles Handlebars templates from `.apm/agents/<promptFile>` with runtime
 * context to produce per-agent system messages. The completion partial and
 * helpers are registered at module load time.
 *
 * Rule content lives in `.apm/instructions/` and is compiled by the APM compiler.
 * Template content lives in `.apm/agents/` and is injected via `systemPromptTemplate`.
 */

import type { ApmCompiledOutput, ApmMcpConfig } from "./apm-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentContext {
  featureSlug: string;
  specPath: string;
  deployedUrl: string | null;
  workflowName: string;
  repoRoot: string;
  appRoot: string;
  itemKey: string;
  baseBranch: string;
  /** True when force_run_if_changed directories have changes — forces the node to run even without primary changes. */
  forceRunChanges?: boolean;
  /** Generic environment dictionary from apm.yml config.environment — cloud-agnostic key-value pairs.
   *  Keys are app-defined (e.g. SERVICE_A_URL, SERVICE_B_URL, FUNC_APP_NAME, RESOURCE_GROUP). */
  environment?: Record<string, string>;
  /** Test command templates from manifest. Keys map to logical test names, values use {appRoot} placeholder. */
  testCommands?: Record<string, string | null>;
  /** Commit scope path overrides from manifest. Keys are scope names, values are arrays of paths relative to appRoot. */
  commitScopes?: Record<string, string[]>;
  /** Structured handoff artifacts from upstream completed items (parsed JSON). */
  upstreamArtifacts?: Record<string, unknown>;
}

export interface McpLocalServerConfig {
  type: "local";
  command: string;
  args: string[];
  tools: string[];
  cwd?: string;
}

export interface McpRemoteServerConfig {
  type: "remote";
  url: string;
  tools: string[];
}

export type McpServerConfig = McpLocalServerConfig | McpRemoteServerConfig;

export interface AgentConfig {
  systemMessage: string;
  model: string;
  mcpServers?: Record<string, McpServerConfig>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = "claude-opus-4.6";

// ---------------------------------------------------------------------------
// Handlebars engine setup
// ---------------------------------------------------------------------------

import Handlebars from "handlebars";

/**
 * Completion partial — injected into every agent prompt via {{> completion}}.
 * Provides the standard completion/failure instructions with pipeline commands.
 */
Handlebars.registerPartial('completion', `
### Completion
When you have finished your task and verified it works:
1. You MUST execute all \`agent-*.sh\` and \`npm run pipeline:*\` scripts from the **repository root**, not the app directory.
2. Run \`bash tools/autonomous-factory/agent-commit.sh {{scope}} "<message>"\`
3. Run \`npm run pipeline:complete {{featureSlug}} {{itemKey}}\`

If you cannot complete the task:
\`\`\`bash
npm run pipeline:fail {{featureSlug}} {{itemKey}} \"<detailed reason>\"
\`\`\`
`);

/**
 * Equality helper — enables {{#if (eq itemKey "integration-test")}} in templates.
 */
Handlebars.registerHelper('eq', function (a: unknown, b: unknown) {
  return a === b;
});

// ---------------------------------------------------------------------------
// Shared helpers (kept from pre-Handlebars agents.ts)
// ---------------------------------------------------------------------------

/**
 * Validates that runtime paths are safe for use in MCP command/arg substitution.
 * Rejects paths containing characters that could break shell execution or argument parsing.
 */
function validateRuntimePath(label: string, p: string): void {
  if (/[\s"'`$\\]/.test(p)) {
    throw new Error(
      `Unsafe ${label} path for MCP substitution: "${p}". ` +
      `Paths must not contain spaces, quotes, or shell metacharacters.`,
    );
  }
}

/**
 * Resolves APM MCP configs by replacing {repoRoot} and {appRoot} placeholders
 * with actual runtime paths. Returns undefined if the agent has no MCP servers.
 */
function resolveMcpPlaceholders(
  mcp: Record<string, ApmMcpConfig>,
  repoRoot: string,
  appRoot: string,
): Record<string, McpServerConfig> | undefined {
  const entries = Object.entries(mcp);
  if (entries.length === 0) return undefined;
  validateRuntimePath("repoRoot", repoRoot);
  validateRuntimePath("appRoot", appRoot);
  const resolved: Record<string, McpServerConfig> = {};
  for (const [name, config] of entries) {
    if (config.type === "remote") {
      resolved[name] = { type: "remote", url: config.url, tools: config.tools };
    } else {
      const resolve = (s: string) =>
        s.replace(/\{repoRoot\}/g, repoRoot).replace(/\{appRoot\}/g, appRoot);
      resolved[name] = {
        type: config.type,
        command: resolve(config.command),
        args: config.args.map(resolve),
        tools: config.tools,
        ...(config.cwd ? { cwd: resolve(config.cwd) } : {}),
      };
    }
  }
  return resolved;
}

/**
 * Resolves a test command template by replacing {appRoot} placeholder.
 * Returns null if the template is null/undefined.
 */
function resolveCmd(template: string | null | undefined, appRoot: string): string | null {
  if (!template) return null;
  return template.replace(/\{appRoot\}/g, appRoot);
}

/**
 * Renders the environment dictionary from apm.yml config as a prompt section.
 * Returns empty string if no environment variables are configured.
 */
function environmentContext(ctx: AgentContext): string {
  if (!ctx.environment || Object.keys(ctx.environment).length === 0) return "";
  const lines = Object.entries(ctx.environment)
    .map(([k, v]) => `- ${k}: \`${v}\``)
    .join("\n");
  return `\n## Environment\n\n${lines}\n`;
}

// ---------------------------------------------------------------------------
// Template data builder
// ---------------------------------------------------------------------------

/**
 * Builds the flat data object that Handlebars templates consume.
 * All values currently computed inline in prompt builders are pre-resolved here.
 */
function buildTemplateData(ctx: AgentContext, apmContext: ApmCompiledOutput): Record<string, unknown> {
  // Generic commit-path resolution — iterate all declared scopes
  const resolvedCommitPaths: Record<string, string> = {};
  if (ctx.commitScopes) {
    for (const [scope, paths] of Object.entries(ctx.commitScopes)) {
      resolvedCommitPaths[scope] = " " + paths.map(p => `${ctx.appRoot}/${p}`).join(" ");
    }
  }

  // Generic test-command resolution — iterate all declared commands
  const resolvedTestCommands: Record<string, string> = {};
  if (ctx.testCommands) {
    for (const [name, template] of Object.entries(ctx.testCommands)) {
      const resolved = resolveCmd(template, ctx.appRoot);
      if (resolved) resolvedTestCommands[name] = resolved;
    }
  }

  return {
    // Spread all AgentContext fields
    featureSlug: ctx.featureSlug,
    specPath: ctx.specPath,
    workflowName: ctx.workflowName,
    repoRoot: ctx.repoRoot,
    appRoot: ctx.appRoot,
    itemKey: ctx.itemKey,
    baseBranch: ctx.baseBranch,
    forceRunChanges: ctx.forceRunChanges ?? false,
    environment: ctx.environment,
    testCommands: ctx.testCommands,
    commitScopes: ctx.commitScopes,

    // Deployed URL — pass as-is from context (resolved by APM hooks, not hardcoded fallback chains)
    deployedUrl: ctx.deployedUrl ?? "DEPLOY_URL_NOT_SET",

    // Boolean flags for template branching — driven by workflow manifest template_flags
    ...((apmContext.workflows?.[ctx.workflowName]?.nodes?.[ctx.itemKey]?.template_flags ?? []) as string[]).reduce(
      (acc: Record<string, boolean>, flag: string) => ({ ...acc, [flag]: true }), {} as Record<string, boolean>,
    ),

    // APM rules for this agent
    rules: apmContext.agents[ctx.itemKey].rules,

    // Pre-rendered environment context string
    environmentContext: environmentContext(ctx),

    // Generic resolved test commands — templates use {{resolvedTestCommands.<name>}} etc.
    resolvedTestCommands,

    // Generic resolved commit paths — templates use {{resolvedCommitPaths.<scope>}} etc.
    resolvedCommitPaths,

    // Upstream handoff artifacts — templates use {{handoffArtifacts.<itemKey>.<field>}}
    handoffArtifacts: ctx.upstreamArtifacts ?? {},

    // Scope for the completion partial (driven by workflow manifest)
    scope: apmContext.workflows?.[ctx.workflowName]?.nodes?.[ctx.itemKey]?.commit_scope ?? "all",
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the agent configuration for a given pipeline item key.
 * Compiles the agent's Handlebars template with runtime context.
 */
export function getAgentConfig(
  itemKey: string,
  context: AgentContext,
  apmContext: ApmCompiledOutput,
): AgentConfig {
  const agentEntry = apmContext.agents[itemKey];
  if (!agentEntry) {
    throw new Error(
      `APM context missing agent "${itemKey}". Available: ${Object.keys(apmContext.agents).join(", ")}`,
    );
  }

  // Compile and evaluate the Handlebars template
  const templateString = agentEntry.systemPromptTemplate;
  const template = Handlebars.compile(templateString, { noEscape: true });
  const data = buildTemplateData(context, apmContext);
  let systemMessage = template(data);

  // Resolve MCP server placeholders
  const mcpServers = resolveMcpPlaceholders(agentEntry.mcp, context.repoRoot, context.appRoot);

  // Inject tool budget into system message — resolved from apm.yml
  // Resolution order: per-agent toolLimits → config.defaultToolLimits
  const agentLimits = agentEntry.toolLimits;
  const manifestDefaults = apmContext.config?.defaultToolLimits;
  const soft = agentLimits?.soft ?? manifestDefaults?.soft ?? 30;
  const hard = agentLimits?.hard ?? manifestDefaults?.hard ?? 40;
  const budgetSection = `

## Tool Call Budget

You have a **hard limit of ${hard} tool calls** for this session. A warning will fire at ${soft} calls.
Plan your work to finish — including commit and pipeline:complete — within this budget.
- File reads are capped at **${agentLimits?.fileReadLineLimit ?? manifestDefaults?.fileReadLineLimit ?? 500} lines** per call. Use start_line/end_line to paginate larger files.
- Shell output is capped at **${agentLimits?.shellOutputLimit ?? manifestDefaults?.shellOutputLimit ?? 64_000} characters**. Pipe through head/tail/grep to narrow results.
- Batch file reads where possible (read large ranges, not many small reads).
- Avoid exploratory grepping — use targeted reads and roam tools.
- Reserve at least **3 tool calls** at the end for: commit, pipeline:complete, and a safety margin.
- If you are approaching the limit, **prioritize committing your work** over further exploration.`;

  systemMessage += budgetSection;

  return {
    systemMessage,
    model: MODEL,
    ...(mcpServers ? { mcpServers } : {}),
  };
}

/**
 * Builds the per-session user message that tells the agent what to do.
 */
export function buildTaskPrompt(
  item: { key: string; label: string },
  slug: string,
  appRoot: string,
  apmContext: ApmCompiledOutput,
): string {
  const hasRoam = !!apmContext.agents[item.key]?.mcp?.["roam-code"];
  const roamPreamble = hasRoam ? `
**IMPORTANT — Roam-First Monorepo Workflow:**
- Start with \`roam_understand ${appRoot}\` or \`roam_context <symbol> ${appRoot}\` to orient yourself — do NOT grep.
- 🚨 **MONOREPO SCOPING RULE:** You MUST append your app boundary to ALL Roam commands to avoid reading code from other applications.
  - Do NOT run: \`roam_context apiClient\`
  - You MUST run: \`roam_context apiClient ${appRoot}\`
- Before modifying ANY file, run \`roam_preflight <symbol> ${appRoot}\` to check blast radius.
- After completing changes, run \`roam_review_change ${appRoot}\` for self-verification.
- If Roam tools are unavailable (MCP connection failed), fall back to standard tools and note this in your completion message.
` : "";

  return `Your task: Complete the "${item.label}" step for feature "${slug}".
${roamPreamble}
1. Read the feature spec: ${appRoot}/in-progress/${slug}_SPEC.md
2. Execute your assigned workflow as described in your system instructions.
3. When finished successfully, run: npm run pipeline:complete ${slug} ${item.key}
4. Then commit state: bash tools/autonomous-factory/agent-commit.sh pipeline "chore(pipeline): mark ${item.label}"
5. If you cannot complete the task, run: npm run pipeline:fail ${slug} ${item.key} "<detailed reason>"`;
}
