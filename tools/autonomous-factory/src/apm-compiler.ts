/**
 * apm-compiler.ts — APM compiler for the SDK orchestrator.
 *
 * Reads `.apm/apm.yml`, resolves instruction includes, validates token budgets,
 * loads MCP and skill declarations, and writes `.apm/.compiled/context.json`.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

import {
  ApmManifestSchema,
  ApmMcpFileSchema,
  ApmSkillFrontmatterSchema,
  ApmWorkflowSchema,
  TriagePackSchema,
  ApmBudgetExceededError,
  ApmCompileError,
  type ApmCompiledOutput,
  type ApmCompiledAgent,
  type ApmMcpConfig,
  type ApmManifest,
  type ApmWorkflow,
  type TriageSignature,
  type CompiledTriageProfile,
} from "./apm-types.js";

// ---------------------------------------------------------------------------
// Token estimation

// ---------------------------------------------------------------------------
// Node catalog merge — merges node pool + legacy _templates into workflow nodes
// ---------------------------------------------------------------------------

/** Graph-only fields that NEVER inherit from the node pool/templates. */
const GRAPH_ONLY_FIELDS = new Set(["depends_on", "on_failure", "triage", "poll_target", "triage_profile", "post_ci_artifact_to_pr"]);

/**
 * Merge node catalog (from manifest.nodes) and legacy _templates into workflow
 * nodes before Zod validation.
 *
 * Resolution order per node:
 *   1. Explicit `_node` (new) or `_template` (legacy) field → catalog/template key
 *   2. Key-match: workflow node key matches catalog/template key
 *
 * Merge: catalog/template body fields as defaults, workflow node fields win.
 * Graph-only fields (depends_on, on_failure, poll_target, triage_profile,
 * post_ci_artifact_to_pr) are NEVER inherited from catalog/templates.
 *
 * default_on_failure merging:
 *   - If the workflow declares `default_on_failure` and a node declares `on_failure`,
 *     the routes are merged (node routes win). If the node omits `triage`, it
 *     inherits from `default_on_failure.triage`.
 *   - Nodes without `on_failure` are untouched (no implicit opt-in).
 */
function mergeNodeCatalogIntoWorkflow(
  raw: Record<string, unknown>,
  nodeCatalog: Record<string, Record<string, unknown>>,
  legacyTemplates: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  if (!raw?.nodes || typeof raw.nodes !== "object") {
    return raw;
  }

  // Emit deprecation warning for legacy _templates
  if (Object.keys(legacyTemplates).length > 0 && Object.keys(nodeCatalog).length > 0) {
    console.warn(
      "[APM] DEPRECATED: workflows.yml still contains _templates. " +
      "Move node definitions to apm.yml → nodes: and remove _templates. " +
      "Legacy _templates are used as fallback when no catalog match is found.",
    );
  } else if (Object.keys(legacyTemplates).length > 0) {
    console.warn(
      "[APM] DEPRECATED: workflows.yml contains _templates. " +
      "Move node definitions to apm.yml → nodes: and remove _templates.",
    );
  }

  // Combined pool: node catalog takes precedence over legacy templates
  const pool: Record<string, Record<string, unknown>> = { ...legacyTemplates, ...nodeCatalog };

  const rawNodes = raw.nodes as Record<string, Record<string, unknown>>;
  const mergedNodes: Record<string, Record<string, unknown>> = {};
  const defaultOnFailure = raw.default_on_failure as Record<string, unknown> | undefined;

  for (const [key, nodeRaw] of Object.entries(rawNodes)) {
    // Resolve pool entry: explicit _node (new) or _template (legacy), else key-match
    const poolKey = typeof nodeRaw._node === "string"
      ? nodeRaw._node
      : typeof nodeRaw._template === "string"
        ? nodeRaw._template
        : key;
    const poolEntry = pool[poolKey];
    // Strip compiler directives from the output
    const { _node, _template, ...nodeFields } = nodeRaw;
    let merged: Record<string, unknown>;

    if (poolEntry) {
      // Filter out graph-only fields from pool entry
      const filteredPool: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(poolEntry)) {
        if (!GRAPH_ONLY_FIELDS.has(k)) filteredPool[k] = v;
      }
      // Merge: pool defaults + workflow overrides (workflow wins)
      merged = { ...filteredPool, ...nodeFields };
    } else {
      merged = nodeFields;
    }

    // Merge default_on_failure into per-node on_failure
    if (defaultOnFailure && merged.on_failure) {
      const nodeOnFailure = merged.on_failure as Record<string, unknown>;
      const defaultRoutes = (defaultOnFailure.routes ?? {}) as Record<string, unknown>;
      const nodeRoutes = (nodeOnFailure.routes ?? {}) as Record<string, unknown>;
      merged.on_failure = {
        // Node triage wins; fallback to default
        triage: nodeOnFailure.triage ?? defaultOnFailure.triage,
        // Default routes as base, node routes override
        routes: { ...defaultRoutes, ...nodeRoutes },
      };
    }

    mergedNodes[key] = merged;
  }
  return { ...raw, nodes: mergedNodes };
}
// ---------------------------------------------------------------------------

/**
 * Conservative token estimate for Claude models.
 * Claude tokenizes code-heavy content at roughly chars / 3.5.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ---------------------------------------------------------------------------
// Skill frontmatter parser
// ---------------------------------------------------------------------------

/**
 * Extracts YAML frontmatter from a markdown file (between --- delimiters).
 */
function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  return yaml.load(match[1]) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// MCP YAML file parser
// ---------------------------------------------------------------------------

function parseMcpYaml(filePath: string): { name: string; config: ApmMcpConfig } {
  const content = fs.readFileSync(filePath, "utf-8");
  const raw = yaml.load(content) as Record<string, unknown>;
  const parsed = ApmMcpFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApmCompileError(
      `Invalid MCP file ${filePath}: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
    );
  }
  const data = parsed.data;
  const config: ApmMcpConfig = data.type === "remote"
    ? { type: "remote", url: data.url, tools: data.tools, availability: data.availability, fsMutator: data.fsMutator }
    : { type: "local", command: data.command, args: data.args, tools: data.tools, cwd: data.cwd, availability: data.availability, fsMutator: data.fsMutator };
  return { name: data.name, config };
}

// ---------------------------------------------------------------------------
// Environment variable interpolation
// ---------------------------------------------------------------------------

/**
 * Recursively resolves `${ENV_VAR}` patterns in string values.
 * Unresolved variables are left as-is (no error) to allow partial resolution.
 */
function resolveEnvVars<T>(obj: T): T {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_match, name) => {
      return process.env[name] ?? _match;
    }) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVars(item)) as T;
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveEnvVars(value);
    }
    return result as T;
  }
  return obj;
}

// ---------------------------------------------------------------------------
// Compiler
// ---------------------------------------------------------------------------

/**
 * Compiles the `.apm/` directory into a `context.json` output.
 *
 * Compiles the `.apm/` directory into a `context.json` output:
 * 1. Reads and validates apm.yml manifest
 * 2. Loads all .md instruction files from .apm/instructions/ subdirectories
 * 3. Resolves per-agent includes (directory ref → all .md files, file ref → single file)
 * 4. Wraps in "## Coding Rules\n\n" prefix
 * 5. Validates token budgets
 * 6. Loads MCP and skill declarations
 * 7. Writes .apm/.compiled/context.json
 */
export function compileApm(appRoot: string): ApmCompiledOutput {
  const apmDir = path.join(appRoot, ".apm");
  const manifestPath = path.join(apmDir, "apm.yml");

  // --- 1. Read and validate manifest ---
  if (!fs.existsSync(manifestPath)) {
    throw new ApmCompileError(`APM manifest not found: ${manifestPath}`);
  }
  const rawYaml = fs.readFileSync(manifestPath, "utf-8");
  const rawManifest = yaml.load(rawYaml) as Record<string, unknown>;
  const manifestResult = ApmManifestSchema.safeParse(rawManifest);
  if (!manifestResult.success) {
    throw new ApmCompileError(
      `Invalid apm.yml: ${manifestResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
    );
  }
  const manifest: ApmManifest = manifestResult.data;

  // --- 2. Read ALL .md files from instructions/ subdirectories ---
  const instructionsDir = path.join(apmDir, "instructions");
  const ruleContents = new Map<string, string>();

  if (fs.existsSync(instructionsDir)) {
    const subdirs = fs.readdirSync(instructionsDir, { withFileTypes: true });
    for (const entry of subdirs) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(instructionsDir, entry.name);
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".md")).sort();
      for (const file of files) {
        const relPath = `${entry.name}/${file}`;
        const content = fs.readFileSync(path.join(dirPath, file), "utf-8").trim();
        ruleContents.set(relPath, content);
      }
    }
  }

  // --- 3. Load MCP declarations ---
  const mcpDir = path.join(apmDir, "mcp");
  const mcpConfigs = new Map<string, ApmMcpConfig>();
  if (fs.existsSync(mcpDir)) {
    const mcpFiles = fs.readdirSync(mcpDir).filter((f) => f.endsWith(".mcp.yml"));
    for (const file of mcpFiles) {
      const { name, config } = parseMcpYaml(path.join(mcpDir, file));
      mcpConfigs.set(name, config);
    }
  }

  // --- 4. Load skill declarations ---
  const skillsDir = path.join(apmDir, "skills");
  const skillDescriptions = new Map<string, string>();
  if (fs.existsSync(skillsDir)) {
    const skillFiles = fs.readdirSync(skillsDir).filter((f) => f.endsWith(".skill.md"));
    for (const file of skillFiles) {
      const content = fs.readFileSync(path.join(skillsDir, file), "utf-8");
      const frontmatter = parseFrontmatter(content);
      const parsed = ApmSkillFrontmatterSchema.safeParse(frontmatter);
      if (parsed.success) {
        skillDescriptions.set(parsed.data.name, parsed.data.description);
      }
    }
  }

  // --- 5. Load workflow definitions ---
  // Sources: workflows.yml (multi-key) + workflows/*.yml (one workflow per file).
  // Keys starting with `_` are reserved (e.g. _templates) and skipped as workflows.
  // Node resolution: manifest.nodes (pool) takes precedence; legacy _templates as fallback.
  const workflowsPath = path.join(apmDir, "workflows.yml");
  const workflows: Record<string, ApmWorkflow> = {};

  // Node catalog from manifest (the pool)
  const nodeCatalog = (rawManifest.nodes ?? {}) as Record<string, Record<string, unknown>>;

  // Extract legacy _templates from workflows.yml (deprecated, used as fallback)
  let legacyTemplates: Record<string, Record<string, unknown>> = {};

  if (fs.existsSync(workflowsPath)) {
    const workflowsYaml = fs.readFileSync(workflowsPath, "utf-8");
    const rawWorkflows = yaml.load(workflowsYaml) as Record<string, unknown>;
    if (rawWorkflows && typeof rawWorkflows === "object") {
      // Extract _templates section (legacy node palette)
      if (rawWorkflows._templates && typeof rawWorkflows._templates === "object") {
        legacyTemplates = rawWorkflows._templates as Record<string, Record<string, unknown>>;
      }
      for (const [name, raw] of Object.entries(rawWorkflows)) {
        // Skip _-prefixed keys (reserved for templates, anchors, etc.)
        if (name.startsWith("_")) continue;
        // Validate workflow name: lowercase kebab-case
        if (!/^[a-z][a-z0-9-]*$/.test(name)) {
          throw new ApmCompileError(
            `Invalid workflow name "${name}" in workflows.yml: must be lowercase kebab-case (a-z, 0-9, hyphens).`,
          );
        }
        // Merge node catalog + legacy templates into workflow nodes before validation
        const merged = mergeNodeCatalogIntoWorkflow(raw as Record<string, unknown>, nodeCatalog, legacyTemplates);
        const result = ApmWorkflowSchema.safeParse(merged);
        if (!result.success) {
          throw new ApmCompileError(
            `Invalid workflow "${name}" in workflows.yml: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
          );
        }
        workflows[name] = result.data;
      }
    }
  }

  // Load additional workflows from .apm/workflows/*.yml (one workflow per file)
  const workflowsDir = path.join(apmDir, "workflows");
  if (fs.existsSync(workflowsDir)) {
    const wfFiles = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
    for (const file of wfFiles) {
      const name = file.replace(/\.(yml|yaml)$/, "");
      if (!/^[a-z][a-z0-9-]*$/.test(name)) {
        throw new ApmCompileError(
          `Invalid workflow filename "${file}" in workflows/: must be lowercase kebab-case.`,
        );
      }
      if (workflows[name]) {
        throw new ApmCompileError(
          `Duplicate workflow name "${name}": defined in both workflows.yml and workflows/${file}.`,
        );
      }
      const filePath = path.join(workflowsDir, file);
      const raw = yaml.load(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
      const merged = mergeNodeCatalogIntoWorkflow(raw, nodeCatalog, legacyTemplates);
      const result = ApmWorkflowSchema.safeParse(merged);
      if (!result.success) {
        throw new ApmCompileError(
          `Invalid workflow "${name}" in workflows/${file}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        );
      }
      workflows[name] = result.data;
    }
  }

  // --- 6. For each agent: resolve includes, validate budget, load template, build compiled entry ---
  const agents: Record<string, ApmCompiledAgent> = {};
  const agentsDir = path.join(apmDir, "agents");

  // --- 5b. Load triage packs ---
  const triagePacksDir = path.join(apmDir, "triage-packs");
  /** Pack name → resolved signatures (for triage profile compilation). */
  const triagePacksByName = new Map<string, TriageSignature[]>();
  if (fs.existsSync(triagePacksDir)) {
    const packFiles = fs.readdirSync(triagePacksDir).filter((f) => f.endsWith(".json"));
    for (const file of packFiles) {
      const filePath = path.join(triagePacksDir, file);
      const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      const result = TriagePackSchema.safeParse(raw);
      if (!result.success) {
        throw new ApmCompileError(
          `Invalid triage pack ${file}: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
        );
      }
      const normalizedSigs = result.data.signatures.map((sig) => ({
        ...sig,
        error_snippet: sig.error_snippet.trim().replace(/\s+/g, " "),
      }));
      triagePacksByName.set(result.data.name, normalizedSigs);
    }
  }

  for (const [agentKey, agentDecl] of Object.entries(manifest.agents)) {
    // Resolve instructions
    const parts: string[] = [];
    for (const ref of agentDecl.instructions) {
      if (ref.endsWith(".md")) {
        // Single file reference
        const content = ruleContents.get(ref);
        if (!content) {
          throw new ApmCompileError(
            `Instruction file not found: "${ref}" (referenced by agent "${agentKey}"). ` +
            `Check apm.yml instructions.`,
          );
        }
        parts.push(content);
      } else {
        // Directory reference — load all .md files in alphabetical order
        const prefix = `${ref}/`;
        const dirFiles = [...ruleContents.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .sort(([a], [b]) => a.localeCompare(b));

        if (dirFiles.length === 0) {
          throw new ApmCompileError(
            `No instruction files found in directory: "${ref}" (referenced by agent "${agentKey}"). ` +
            `Check .apm/instructions/${ref}/ exists and contains .md files.`,
          );
        }

        for (const [, content] of dirFiles) {
          parts.push(content);
        }
      }
    }

    // Assemble rules block
    const assembled = parts.join("\n\n");
    const rulesBlock = `## Coding Rules\n\n${assembled}`;
    const tokenCount = estimateTokens(rulesBlock);

    // Validate token budget
    if (tokenCount > manifest.tokenBudget) {
      throw new ApmBudgetExceededError(agentKey, tokenCount, manifest.tokenBudget);
    }

    // --- Load agent prompt template from .apm/agents/<promptFile> ---
    const templatePath = path.join(agentsDir, agentDecl.promptFile);
    if (!fs.existsSync(templatePath)) {
      throw new ApmCompileError(
        `Agent template not found: .apm/agents/${agentDecl.promptFile} ` +
        `(referenced by agent "${agentKey}" via promptFile). ` +
        `Create the file or fix the promptFile path in apm.yml.`,
      );
    }
    const systemPromptTemplate = fs.readFileSync(templatePath, "utf-8");

    // Resolve MCP configs for this agent
    const agentMcp: Record<string, ApmMcpConfig> = {};
    for (const mcpName of agentDecl.mcp) {
      const config = mcpConfigs.get(mcpName);
      if (config) {
        agentMcp[mcpName] = config;
      }
      // Silently skip missing MCP declarations — they may be optional
    }

    // Resolve skill descriptions for this agent
    const agentSkills: Record<string, string> = {};
    for (const skillName of agentDecl.skills) {
      const desc = skillDescriptions.get(skillName);
      if (desc) {
        agentSkills[skillName] = desc;
      }
    }

    agents[agentKey] = {
      rules: rulesBlock,
      tokenCount,
      mcp: agentMcp,
      skills: agentSkills,
      toolLimits: agentDecl.toolLimits,
      tools: agentDecl.tools,
      security: agentDecl.security,
      systemPromptTemplate,
    };
  }

  // --- 7. Compile triage profiles ---
  const triageProfiles: Record<string, CompiledTriageProfile> = {};
  for (const [wfName, wf] of Object.entries(workflows)) {
    if (!wf.triage) continue;
    for (const [profileName, profile] of Object.entries(wf.triage)) {
      // Resolve pack references → inline signatures
      const signatures: TriageSignature[] = [];
      for (const packName of profile.packs) {
        const packSigs = triagePacksByName.get(packName);
        if (!packSigs) {
          throw new ApmCompileError(
            `Triage profile "${profileName}" references pack "${packName}" which does not exist in .apm/triage-packs/`,
          );
        }
        signatures.push(...packSigs);
      }

      const compiledKey = `${wfName}.${profileName}`;
      triageProfiles[compiledKey] = {
        llm_fallback: profile.llm_fallback,
        ...(profile.classifier ? { classifier: profile.classifier } : {}),
        max_reroutes: profile.max_reroutes,
        routing: profile.routing,
        signatures,
      };
    }
  }

  // --- 8. Build compiled output (resolve env vars in config) ---
  const resolvedConfig = manifest.config
    ? resolveEnvVars(manifest.config)
    : undefined;

  const output: ApmCompiledOutput = {
    version: "1.0.0",
    compiledAt: new Date().toISOString(),
    tokenBudget: manifest.tokenBudget,
    agents,
    ...(resolvedConfig ? { config: resolvedConfig } : {}),
    workflows,
    triage_profiles: triageProfiles,
  };

  // --- 8. Write to .compiled/context.json ---
  const compiledDir = path.join(apmDir, ".compiled");
  if (!fs.existsSync(compiledDir)) {
    fs.mkdirSync(compiledDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(compiledDir, "context.json"),
    JSON.stringify(output, null, 2),
  );

  return output;
}

/**
 * Returns the modification time of the most recently modified source file
 * in the .apm/ directory (excluding .compiled/).
 */
export function getApmSourceMtime(appRoot: string): number {
  const apmDir = path.join(appRoot, ".apm");
  let maxMtime = 0;

  function walk(dir: string): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".compiled") continue; // skip output dir
        walk(fullPath);
      } else {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs > maxMtime) {
          maxMtime = stat.mtimeMs;
        }
      }
    }
  }

  walk(apmDir);
  return maxMtime;
}
