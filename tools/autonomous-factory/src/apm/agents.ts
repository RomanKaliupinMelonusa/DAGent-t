/**
 * agents.ts — Agent prompt factory for the SDK orchestrator.
 *
 * Compiles Handlebars templates from `.apm/agents/<promptFile>` with runtime
 * context to produce per-agent system messages. The completion partial and
 * helpers are registered at module load time; app-declared partials from
 * `config.handlebarsPartials` are registered per-render inside
 * `getAgentConfig`.
 *
 * Rule content lives in `.apm/instructions/` and is compiled by the APM compiler.
 * Template content lives in `.apm/agents/` and is injected via `systemPromptTemplate`.
 */

import type { ApmCompiledOutput, ApmMcpConfig, ApmWorkflowNode } from "./types.js";
import type { PipelineState, InvocationRecord } from "../types.js";
import type { ArtifactBus } from "../ports/artifact-bus.js";
import { isArtifactKind, type ArtifactKind } from "./artifact-catalog.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentContext {
  featureSlug: string;
  specPath: string;
  /** Path to the machine-checkable acceptance contract. Populated when any
   *  node in the active workflow declares `produces_artifacts: [acceptance]`
   *  (detection is driven by the declared contract, not by hard-coding a
   *  specific node key).
   *
   *  @deprecated Legacy path-form shortcut. For content-inline access prefer
   *  the typed `{{artifact "<producer>" "acceptance"}}` helper in agent
   *  templates — it validates the consumes_artifacts edge and returns the
   *  parsed contract body. Keep using `{{acceptancePath}}` only when the
   *  agent needs the on-disk path (e.g. to pass to a CLI tool). */
  acceptancePath?: string;
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
  /** Session C: optional advisory markdown reporting API-surface drift of a
   *  pinned runtime dependency against its vendored snapshot (see
   *  `lifecycle/dependency-pinning.ts`). Surfaced to templates as
   *  `{{{pwa_kit_drift_report}}}`; agents that do not mention the variable
   *  simply ignore it. */
  pwaKitDriftReport?: string;
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
 *
 * Phase A: agents signal their final outcome to the orchestrator via the
 * `report_outcome` SDK tool, NOT via bash CLI calls. The orchestrator's
 * kernel is the sole writer of pipeline state.
 */
Handlebars.registerPartial('completion', `
### Completion
When you have finished your task and verified it works:
1. Run \`bash tools/autonomous-factory/agent-commit.sh {{scope}} "<message>"\` from the **repository root** to commit your changes.
2. Call the \`report_outcome\` tool exactly ONCE as your LAST action:
   \`\`\`
   report_outcome({ status: "completed" })
   \`\`\`
   For rich content (notes, deployed URLs), write a declared artifact instead:
   - \`outputs/summary.md\` — short architectural summary / decisions. MUST start with a YAML front-matter envelope:
     \`\`\`
     ---
     schemaVersion: 1
     producedBy: <your-node-key>
     producedAt: <ISO-8601 UTC timestamp>
     ---
     <free-form markdown body>
     \`\`\`
     Declare \`produces_artifacts: ["summary"]\`.
   - \`outputs/deployment-url.json\` — \`{ "url": "..." }\` for deploy nodes (declare \`produces_artifacts: ["deployment-url"]\`).

If you cannot complete the task:
\`\`\`
report_outcome({ status: "failed", message: "<detailed reason — ideally a TriageDiagnostic JSON with stack trace, error message, URL, or status code>" })
\`\`\`

**DO NOT** call \`npm run pipeline:complete\` or \`npm run pipeline:fail\` from bash. Use \`report_outcome\` instead. The kernel is the sole writer of pipeline state.
`);

/**
 * Equality helper — enables {{#if (eq itemKey "integration-test")}} in templates.
 */
Handlebars.registerHelper('eq', function (a: unknown, b: unknown) {
  return a === b;
});

/**
 * Phase 3 — typed artifact accessor: `{{artifact "<producerKey>" "<kind>"}}`.
 *
 * Resolves to the parsed content of an upstream node's handoff artifact.
 * Fails at RENDER time with an actionable error when:
 *   (a) the producer+kind was not declared in the consuming node's
 *       `consumes_artifacts` (`@root.__declaredConsumes`), or
 *   (b) no content was collected for that producer (e.g. upstream never
 *       produced the expected kind).
 *
 * This helper is the typed alternative to bare `{{upstreamArtifacts.<key>}}`
 * access — the latter skips the contract check and silently interpolates
 * `undefined` when the edge is undeclared. The companion instruction-lint
 * rule flags the bare form so authors migrate to this helper.
 */
Handlebars.registerHelper('artifact', function (
  this: unknown,
  producer: unknown,
  kind: unknown,
  options: Handlebars.HelperOptions,
) {
  if (typeof producer !== "string" || producer.length === 0) {
    throw new Error(
      `{{artifact}} helper requires a non-empty producer node key as the first argument.`,
    );
  }
  if (typeof kind !== "string" || kind.length === 0) {
    throw new Error(
      `{{artifact}} helper requires a non-empty kind string as the second argument.`,
    );
  }
  const root = (options.data?.root ?? {}) as {
    __declaredConsumes?: ReadonlyArray<{ from: string; kind: string }>;
    __upstreamArtifacts?: Record<string, unknown>;
    itemKey?: string;
  };
  const declared = root.__declaredConsumes;
  if (!declared) {
    throw new Error(
      `{{artifact "${producer}" "${kind}"}} called but no declared consumes_artifacts ` +
        `were threaded into template data. This indicates a caller bug — every template ` +
        `render must populate \`__declaredConsumes\` from the workflow node.`,
    );
  }
  const match = declared.find((c) => c.from === producer && c.kind === kind);
  if (!match) {
    const declaredStr = declared.length > 0
      ? declared.map((c) => `"${c.from}:${c.kind}"`).join(", ")
      : "(none)";
    throw new Error(
      `{{artifact "${producer}" "${kind}"}} references an undeclared edge for node ` +
        `"${root.itemKey ?? "<unknown>"}". Declared consumes_artifacts: ${declaredStr}. ` +
        `Add \`{ from: "${producer}", kind: "${kind}" }\` to the node's consumes_artifacts ` +
        `in workflows.yml, or remove this helper call.`,
    );
  }
  const content = root.__upstreamArtifacts?.[producer];
  if (content === undefined) {
    // Declared but not produced (upstream not completed or schema mismatch).
    // Required edges are enforced elsewhere (Phase 2.1 fail-fast + I/O
    // validator) — the helper returns an empty string so optional edges
    // degrade gracefully.
    const isOptional = (match as { required?: boolean }).required === false;
    return isOptional ? "" : `[artifact ${producer}:${kind} unresolved]`;
  }
  // Objects → JSON; primitives → String().
  if (typeof content === "object" && content !== null) {
    return JSON.stringify(content, null, 2);
  }
  return String(content);
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
    acceptancePath: ctx.acceptancePath ?? "",
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

    // Session C — advisory drift report (empty string when absent so the
    // Handlebars `{{#if}}` block collapses cleanly for runs without drift).
    pwa_kit_drift_report: ctx.pwaKitDriftReport ?? "",

    // Generic resolved test commands — templates use {{resolvedTestCommands.<name>}} etc.
    resolvedTestCommands,

    // Generic resolved commit paths — templates use {{resolvedCommitPaths.<scope>}} etc.
    resolvedCommitPaths,

    // Scope for the completion partial (driven by workflow manifest)
    scope: apmContext.workflows?.[ctx.workflowName]?.nodes?.[ctx.itemKey]?.commit_scope ?? "all",

    // Phase 3 — typed artifact helper context. Reserved keys (leading
    // double-underscore) used by the `{{artifact}}` helper to validate
    // declared edges and resolve parsed upstream content. Not intended
    // for direct template consumption.
    __declaredConsumes: (apmContext.workflows?.[ctx.workflowName]?.nodes?.[ctx.itemKey]?.consumes_artifacts ?? []) as ReadonlyArray<{ from: string; kind: string; required?: boolean }>,
    __upstreamArtifacts: ctx.upstreamArtifacts ?? {},
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

  // Register app-declared Handlebars partials for this render. Built-in
  // names (`completion`, `eq`, `artifact`) are guarded at compile time in
  // compiler.ts — by the time we reach here, every app partial is safe to
  // register. Re-registration is idempotent (Handlebars overwrites the
  // same name); a future optimisation could cache by compile timestamp.
  const appPartials = apmContext.config?.handlebarsPartials;
  if (appPartials) {
    for (const [name, source] of Object.entries(appPartials)) {
      Handlebars.registerPartial(name, source);
    }
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
Plan your work to finish — including the final commit and the \`report_outcome\` call — within this budget.
- File reads are capped at **${agentLimits?.fileReadLineLimit ?? manifestDefaults?.fileReadLineLimit ?? 500} lines** per call. Use start_line/end_line to paginate larger files.
- Shell output is capped at **${agentLimits?.shellOutputLimit ?? manifestDefaults?.shellOutputLimit ?? 64_000} characters**. Pipe through head/tail/grep to narrow results.
- Batch file reads where possible (read large ranges, not many small reads).
- Avoid exploratory grepping — use targeted reads and roam tools.
- Reserve at least **3 tool calls** at the end for: commit, \`report_outcome\`, and a safety margin.
- If you are approaching the limit, **prioritize committing your work** over further exploration.`;

  systemMessage += budgetSection;

  return {
    systemMessage,
    model: MODEL,
    ...(mcpServers ? { mcpServers } : {}),
  };
}

/**
 * Options for declarative Inputs/Outputs rendering (Phase 4).
 *
 * When `node`, `pipelineState`, and `artifactBus` are supplied AND the node
 * declares any of `consumes_kickoff` / `produces_artifacts` / `consumes_artifacts`,
 * `buildTaskPrompt` will append an **Inputs/Outputs** block that lists
 * concrete on-disk paths per artifact kind. Absent these, the prompt
 * degrades gracefully to its legacy form so apps can migrate incrementally.
 */
export interface BuildTaskPromptOptions {
  readonly node?: ApmWorkflowNode;
  readonly pipelineState?: PipelineState;
  readonly artifactBus?: ArtifactBus;
  /** The current dispatch invocation id (used to render own-output paths). */
  readonly invocationId?: string;
}

/**
 * Render the declarative Inputs/Outputs section. Phase C: always renders at
 * minimum the kickoff spec path so the agent never has to guess where the
 * feature brief lives, and renders a Re-invocation lineage block when the
 * current dispatch was routed here by triage (or a prior cycle).
 */
function renderIoBlock(
  slug: string,
  itemKey: string,
  opts: BuildTaskPromptOptions | undefined,
): string {
  if (!opts?.artifactBus) return "";
  const bus = opts.artifactBus;
  const node = opts.node;
  const kickoff = node?.consumes_kickoff ?? [];
  const produces = node?.produces_artifacts ?? [];
  const consumes = node?.consumes_artifacts ?? [];
  const invocationId = opts.invocationId ?? "<this-invocation>";
  const lines: string[] = [];

  lines.push("", "**Declared Inputs / Outputs (from `workflows.yml`):**", "");

  // Kickoff block. If the node declared `consumes_kickoff`, render those
  // kinds. Otherwise fall back to the default feature spec kickoff path so
  // the agent always knows where the brief lives — preserves behaviour of
  // the legacy hardcoded "Read the feature spec: …_SPEC.md" step.
  if (kickoff.length > 0) {
    lines.push("Kickoff inputs (read-only, produced once at pipeline start):");
    for (const kindStr of kickoff) {
      if (!isArtifactKind(kindStr)) {
        lines.push(`  · ${kindStr} (unknown kind — skipped)`);
        continue;
      }
      const kind: ArtifactKind = kindStr;
      lines.push(`  · ${kind} → ${bus.kickoffPath(slug, kind)}`);
    }
  } else {
    lines.push("Kickoff inputs:");
    lines.push(`  · spec → ${bus.kickoffPath(slug, "spec")}`);
  }
  lines.push("");

  if (consumes.length > 0) {
    lines.push("Upstream node artifacts:");
    for (const entry of consumes) {
      if (!isArtifactKind(entry.kind)) {
        lines.push(`  · ${entry.kind} from ${entry.from} (unknown kind — skipped)`);
        continue;
      }
      const kind: ArtifactKind = entry.kind;
      const upstream = opts.pipelineState?.artifacts
        ? Object.values(opts.pipelineState.artifacts).find(
            (rec) => rec.nodeKey === entry.from,
          )
        : undefined;
      if (upstream) {
        const p = bus.nodePath(slug, entry.from, upstream.invocationId, kind);
        lines.push(`  · ${kind} from ${entry.from} → ${p}`);
      } else if (entry.required !== false) {
        lines.push(`  · ${kind} from ${entry.from} (REQUIRED — not yet produced)`);
      } else {
        lines.push(`  · ${kind} from ${entry.from} (optional — not produced)`);
      }
    }
    lines.push("");
  }

  if (produces.length > 0) {
    lines.push(
      "Outputs YOU must write (under YOUR invocation dir — the pipeline seals it at handler exit):",
    );
    for (const kindStr of produces) {
      if (!isArtifactKind(kindStr)) {
        lines.push(`  · ${kindStr} (unknown kind — skipped)`);
        continue;
      }
      const kind: ArtifactKind = kindStr;
      lines.push(`  · ${kind} → ${bus.nodePath(slug, itemKey, invocationId, kind)}`);
    }
    lines.push("");
  } else {
    lines.push("Outputs: (none declared — this node has no persistent artifact contract)");
    lines.push("");
  }

  // Re-invocation lineage — ancestry tree when this dispatch was re-routed
  // by triage or a prior cycle. Rendered only when an ancestor exists.
  const lineage = renderLineageBlock(slug, itemKey, opts);
  if (lineage) lines.push(lineage);

  return lines.join("\n");
}

/**
 * Walk `state.artifacts[...].parentInvocationId` backwards from the current
 * item's staged invocation record and render a compact ancestry block.
 * Returns an empty string when no ancestor exists.
 */
function renderLineageBlock(
  slug: string,
  itemKey: string,
  opts: BuildTaskPromptOptions | undefined,
): string {
  const state = opts?.pipelineState;
  if (!state) return "";
  const item = state.items.find((i) => i.key === itemKey);
  const records: Record<string, InvocationRecord> = state.artifacts ?? {};
  const staged = item?.latestInvocationId ? records[item.latestInvocationId] : undefined;
  const firstParentId = staged?.parentInvocationId;
  if (!firstParentId) return "";
  const chain: Array<{ id: string; nodeKey: string; outcome?: string }> = [];
  let cursor: string | undefined = firstParentId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    const rec: InvocationRecord | undefined = records[cursor];
    if (!rec) {
      chain.push({ id: cursor, nodeKey: "unknown" });
      break;
    }
    chain.push({ id: rec.invocationId, nodeKey: rec.nodeKey, outcome: rec.outcome });
    cursor = rec.parentInvocationId;
  }
  if (chain.length === 0) return "";
  const out: string[] = [];
  out.push("**Re-invocation context** (this dispatch was routed here — lineage newest→oldest):");
  for (const link of chain) {
    const outcome = link.outcome ? ` [${link.outcome}]` : "";
    out.push(`  · ${link.nodeKey}${outcome}  (${link.id.slice(0, 16)}…)`);
  }
  out.push(
    "  Read the predecessor artifacts above (Declared Inputs) — when this is a triage reroute the `triage-handoff` JSON in `inputs/` carries the diagnosis — before changing any code.",
  );
  out.push("");
  return out.join("\n");
}

/**
 * Builds the per-session user message that tells the agent what to do.
 */
export function buildTaskPrompt(
  item: { key: string; label: string },
  slug: string,
  appRoot: string,
  apmContext: ApmCompiledOutput,
  opts?: BuildTaskPromptOptions,
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
${roamPreamble}${renderIoBlock(slug, item.key, opts)}
1. Read the inputs declared above (the Declared Inputs block lists concrete on-disk paths).
2. Execute your assigned workflow as described in your system instructions.
3. Commit your changes via \`bash tools/autonomous-factory/agent-commit.sh <scope> "<message>"\`.
4. As your LAST action, call the \`report_outcome\` tool exactly once: \`report_outcome({ status: "completed" })\` on success, or \`report_outcome({ status: "failed", message: "<detailed reason>" })\` if you cannot complete the task.
   Do NOT run \`npm run pipeline:complete\` or \`npm run pipeline:fail\` from bash — the kernel is the sole writer of pipeline state.`;
}
