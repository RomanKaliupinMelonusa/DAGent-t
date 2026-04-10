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
} from "./apm-types.js";

// ---------------------------------------------------------------------------
// Token estimation
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
  const workflowsPath = path.join(apmDir, "workflows.yml");
  const workflows: Record<string, ApmWorkflow> = {};
  if (fs.existsSync(workflowsPath)) {
    const workflowsYaml = fs.readFileSync(workflowsPath, "utf-8");
    const rawWorkflows = yaml.load(workflowsYaml) as Record<string, unknown>;
    if (rawWorkflows && typeof rawWorkflows === "object") {
      for (const [name, raw] of Object.entries(rawWorkflows)) {
        const result = ApmWorkflowSchema.safeParse(raw);
        if (!result.success) {
          throw new ApmCompileError(
            `Invalid workflow "${name}" in workflows.yml: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
          );
        }
        workflows[name] = result.data;
      }
    }
  }

  // --- 6. For each agent: resolve includes, validate budget, load template, build compiled entry ---
  const agents: Record<string, ApmCompiledAgent> = {};
  const agentsDir = path.join(apmDir, "agents");

  // --- 5b. Load triage packs ---
  const triagePacksDir = path.join(apmDir, "triage-packs");
  const triageKb: TriageSignature[] = [];
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
      triageKb.push(...result.data.signatures.map((sig) => ({
        ...sig,
        // Normalize snippets at compile time: trim + collapse whitespace.
        // KB snippets are static strings authored by humans — they should never
        // contain dynamic entropy (SHAs, timestamps), but whitespace normalization
        // ensures consistent matching against normalizeDiagnosticTrace() output.
        error_snippet: sig.error_snippet.trim().replace(/\s+/g, " "),
      })));
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

  // --- 7. Build compiled output (resolve env vars in config) ---
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
    triage_kb: triageKb,
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
