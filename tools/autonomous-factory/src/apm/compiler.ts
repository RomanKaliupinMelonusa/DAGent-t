/**
 * apm-compiler.ts — APM compiler for the SDK orchestrator.
 *
 * Reads `.apm/apm.yml`, resolves instruction includes, validates token budgets,
 * loads MCP and skill declarations, and writes `.apm/.compiled/context.json`.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import yaml from "js-yaml";

const require = createRequire(import.meta.url);

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
} from "./types.js";
import {
  resolveCapabilityProfile,
  renderPreferencesMarkdown,
} from "./capability-profiles.js";
import { validateArtifactIO } from "./artifact-io-validator.js";
import { lintAssembledInstructions, formatViolations } from "./instruction-lint.js";
import { BUILTIN_TRIAGE_PATTERNS } from "../triage/builtin-patterns.js";

// ---------------------------------------------------------------------------
// Plugin discovery — record app-local plugin paths in compiled output
// ---------------------------------------------------------------------------

/**
 * Scan `.apm/<kind>/*.ts` and record app-root-relative module paths for every
 * plugin category the runtime supports. Paths are not imported here — the
 * compiler stays a pure transform; `src/apm/plugin-loader.ts` loads modules
 * at bootstrap.
 */
function scanPluginDirs(apmDir: string): { middlewares: string[] } {
  return {
    middlewares: listPluginFiles(path.join(apmDir, "middlewares")),
  };
}

function listPluginFiles(dir: string): string[] {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|mts|js|mjs)$/.test(e.name) && !e.name.endsWith(".d.ts"))
    .map((e) => `./.apm/${path.basename(dir)}/${e.name}`)
    .sort();
}

// ---------------------------------------------------------------------------
// Token estimation

// ---------------------------------------------------------------------------
// Node catalog merge — merges node pool + legacy _templates into workflow nodes
// ---------------------------------------------------------------------------

/** Graph-only fields that NEVER inherit from the node pool/templates. */
const GRAPH_ONLY_FIELDS = new Set(["depends_on", "on_failure", "triage", "poll_target", "triage_profile", "post_ci_artifact_to_pr"]);

/** Lightweight Levenshtein-based suggestion for config typos. Returns the
 *  closest candidate within edit-distance ≤ 3, or null. */
function nearestNeighbor(input: string, candidates: readonly string[]): string | null {
  if (candidates.length === 0) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const cand of candidates) {
    const d = editDistance(input, cand);
    if (d < bestDist) { bestDist = d; best = cand; }
  }
  return bestDist <= 3 ? best : null;
}
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j];
      row[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, row[j], row[j - 1]);
      prev = tmp;
    }
  }
  return row[n];
}

/**
 * Session B (Item 4) — flatten `routeProfiles` into `{ triage?, routes }`
 * objects with `extends` removed, ready for node-level merging.
 *
 * Inheritance contract (🆁4): depth ≤ 1. A profile may extend another
 * profile, but the parent MUST NOT itself have `extends`. Chains of length
 * ≥ 2 (A → B → C) and cycles (including self-cycles A → A) are rejected
 * with `ApmCompileError` so deeper chains cannot silently drop mid-chain
 * overrides. Cycle detection is retained as a guard rail even though
 * depth-1 enforcement makes non-trivial cycles structurally impossible.
 */
function flattenRouteProfiles(
  raw: Record<string, Record<string, unknown>> | undefined,
): Record<string, { triage?: string; routes: Record<string, string | null> }> {
  if (!raw || typeof raw !== "object") return {};
  const source = raw;
  const out: Record<string, { triage?: string; routes: Record<string, string | null> }> = {};

  for (const key of Object.keys(source)) {
    const entry = source[key];
    const parentKey = typeof entry.extends === "string" ? entry.extends : null;

    if (!parentKey) {
      out[key] = {
        triage: entry.triage as string | undefined,
        routes: { ...((entry.routes ?? {}) as Record<string, string | null>) },
      };
      continue;
    }

    // Cycle guard: self-cycle (A -> A). Non-self cycles are also
    // impossible under depth-1 (the depth check below fires first),
    // but we keep the explicit check so future refactors that relax
    // the depth cap inherit cycle safety.
    if (parentKey === key) {
      throw new ApmCompileError(
        `routeProfiles inheritance cycle: ${key} -> ${key}`,
      );
    }

    const parent = source[parentKey];
    if (!parent) {
      throw new ApmCompileError(
        `routeProfiles[${key}].extends references unknown profile "${parentKey}". ` +
        `Defined profiles: ${Object.keys(source).join(", ") || "(none)"}`,
      );
    }

    // Depth-1 enforcement: parent must not itself extend another profile.
    // 2-cycle check (A -> B -> A) runs first so cycle errors win over
    // the generic depth message when the intent was a cycle.
    if (typeof parent.extends === "string") {
      const grand = parent.extends;
      if (grand === key) {
        throw new ApmCompileError(
          `routeProfiles inheritance cycle: ${key} -> ${parentKey} -> ${key}`,
        );
      }
      throw new ApmCompileError(
        `routeProfiles inheritance exceeds max depth of 1: ` +
        `${key} -> ${parentKey} -> ${grand}. ` +
        `Flatten "${parentKey}" (inline its parent's routes) or remove ` +
        `"${key}.extends" so only one level of inheritance is used.`,
      );
    }

    const selfRoutes = (entry.routes ?? {}) as Record<string, string | null>;
    const parentRoutes = (parent.routes ?? {}) as Record<string, string | null>;
    out[key] = {
      triage: (entry.triage as string | undefined) ?? (parent.triage as string | undefined),
      routes: { ...parentRoutes, ...selfRoutes },
    };
  }

  return out;
}

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
 * on_failure merging precedence (lowest → highest):
 *   1. routeProfiles[on_failure.extends] (flattened, single-level w/ cycle check)
 *   2. workflow-level default_on_failure
 *   3. the node's own on_failure
 * Nodes without `on_failure` are untouched (no implicit opt-in).
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
  const routeProfiles = flattenRouteProfiles(
    raw.routeProfiles as Record<string, Record<string, unknown>> | undefined,
  );

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

    // on_failure merge: routeProfiles[extends] → default_on_failure → node.on_failure
    if (merged.on_failure) {
      const nodeOnFailure = merged.on_failure as Record<string, unknown>;
      const extendsKey = typeof nodeOnFailure.extends === "string" ? nodeOnFailure.extends : null;
      let base: { triage?: string; routes: Record<string, string | null> } = { routes: {} };

      if (extendsKey) {
        const profile = routeProfiles[extendsKey];
        if (!profile) {
          throw new ApmCompileError(
            `Node "${key}" on_failure.extends references unknown routeProfile "${extendsKey}". ` +
            `Defined profiles: ${Object.keys(routeProfiles).join(", ") || "(none)"}`,
          );
        }
        base = { triage: profile.triage, routes: { ...profile.routes } };
      }

      if (defaultOnFailure) {
        base = {
          triage: (defaultOnFailure.triage as string | undefined) ?? base.triage,
          routes: { ...base.routes, ...((defaultOnFailure.routes ?? {}) as Record<string, string | null>) },
        };
      }

      const nodeRoutes = (nodeOnFailure.routes ?? {}) as Record<string, string | null>;
      merged.on_failure = {
        triage: nodeOnFailure.triage ?? base.triage,
        routes: { ...base.routes, ...nodeRoutes },
      };
    }

    mergedNodes[key] = merged;
  }
  return { ...raw, nodes: mergedNodes };
}
// ---------------------------------------------------------------------------

/**
 * Token estimation with tiktoken (cl100k_base) for Claude models.
 * Falls back to the chars/3.5 heuristic if tiktoken is unavailable.
 * The optional `margin` multiplier (e.g. 1.1 = 10%) provides a safety buffer.
 */
let _tiktokenEncoder: { encode: (text: string) => number[] } | null | undefined;

function getTiktokenEncoder(): typeof _tiktokenEncoder {
  if (_tiktokenEncoder !== undefined) return _tiktokenEncoder;
  try {
    const { encodingForModel } = require("js-tiktoken") as typeof import("js-tiktoken");
    _tiktokenEncoder = encodingForModel("gpt-4o");
  } catch {
    _tiktokenEncoder = null; // Not available — use heuristic
  }
  return _tiktokenEncoder;
}

function estimateTokens(text: string, margin = 1.0): number {
  const encoder = getTiktokenEncoder();
  if (encoder) {
    return Math.ceil(encoder.encode(text).length * margin);
  }
  // Heuristic fallback: chars / 3.5
  return Math.ceil((text.length / 3.5) * margin);
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

  // --- 5c. Validate artifact-bus declarations per workflow (Phase 3). ---
  // Every node's `consumes_kickoff`, `produces_artifacts`, and
  // `consumes_artifacts` are checked against the artifact catalog and DAG
  // topology. Soft warnings (optional missing outputs) are logged; hard
  // violations throw `ApmCompileError`.
  //
  // Phase 1.3: `config.strict_consumes_artifacts` upgrades the
  // "agent node declares no consumes_artifacts" condition from silent
  // to fatal. Default off — flipping requires every agent node to either
  // declare upstream edges or write `consumes_artifacts: []` explicitly.
  const strictConsumesArtifacts =
    manifest.config?.strict_consumes_artifacts === true;
  for (const [workflowName, workflow] of Object.entries(workflows)) {
    const { warnings } = validateArtifactIO(workflowName, workflow, {
      strictConsumesArtifacts,
    });
    for (const w of warnings) {
      console.warn(
        `[APM] workflow "${workflowName}" node "${w.node}": ${w.message}`,
      );
    }
  }

  // --- 6. For each agent: resolve includes, validate budget, load template, build compiled entry ---
  const agents: Record<string, ApmCompiledAgent> = {};
  const agentsDir = path.join(apmDir, "agents");

  // --- 5c. Resolve app-registered Handlebars partials ---
  // Inline source is recognised by `{{` or a newline; anything else is
  // treated as a path relative to `.apm/` and read from disk. Names that
  // collide with built-in partials or helpers registered in agents.ts
  // raise a fatal error so apps can't silently override orchestrator
  // contracts (e.g. the `completion` partial).
  const BUILTIN_PARTIAL_NAMES = new Set(["completion", "eq", "artifact"]);
  const resolvedHandlebarsPartials: Record<string, string> = {};
  const declaredPartials = manifest.config?.handlebarsPartials ?? {};
  for (const [name, source] of Object.entries(declaredPartials)) {
    if (BUILTIN_PARTIAL_NAMES.has(name)) {
      throw new ApmCompileError(
        `config.handlebarsPartials["${name}"] collides with a built-in Handlebars ` +
        `partial/helper. Built-in names reserved: ${[...BUILTIN_PARTIAL_NAMES].join(", ")}.`,
      );
    }
    const isInline = source.includes("{{") || source.includes("\n");
    if (isInline) {
      resolvedHandlebarsPartials[name] = source;
    } else {
      const partialPath = path.join(apmDir, source);
      if (!fs.existsSync(partialPath)) {
        throw new ApmCompileError(
          `config.handlebarsPartials["${name}"] points to "${source}" ` +
          `which does not exist under .apm/. Provide inline source (containing ` +
          `"{{" or a newline) or a valid path relative to .apm/.`,
        );
      }
      resolvedHandlebarsPartials[name] = fs.readFileSync(partialPath, "utf-8");
    }
  }

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

  // Normalize `promptFile` to an ordered fragment array so downstream code
  // is fragment-agnostic. A declared string becomes a single-entry array;
  // a declared array is used verbatim. The join-string is the dedupe key
  // for slug-literal lint reporting — agents sharing the identical fragment
  // set are reported together.
  const promptFragments = (agentDecl: { promptFile: string | string[] }): string[] =>
    Array.isArray(agentDecl.promptFile) ? agentDecl.promptFile : [agentDecl.promptFile];
  const promptFragmentKey = (agentDecl: { promptFile: string | string[] }): string =>
    promptFragments(agentDecl).join("\0");

  // Track agents that share a prompt-fragment set so the slug-literal lint
  // reports each offending fragment-set once, listing every agent that
  // reuses it. Without this, a prompt set referenced by N agents would
  // print the same N×M offenders.
  const lintReportedPromptKeys = new Set<string>();
  const agentsByPromptKey = new Map<string, string[]>();
  for (const [agentKey, agentDecl] of Object.entries(manifest.agents)) {
    const k = promptFragmentKey(agentDecl);
    const list = agentsByPromptKey.get(k);
    if (list) list.push(agentKey);
    else agentsByPromptKey.set(k, [agentKey]);
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

    // --- Phase 7: Schema gate on rendered instructions ---
    // Reject prompts that hard-code legacy `<slug>_*` paths or unbacked
    // `${SLUG}_*` envvars. Code spans (fenced blocks + inline backticks)
    // are exempted so migration notes can quote the old shape.
    const violations = lintAssembledInstructions(assembled);
    if (violations.length > 0) {
      throw new ApmCompileError(
        formatViolations(agentKey, path.basename(appRoot), violations),
      );
    }

    // --- Capability profile resolution ---
    // When the agent declares `capability_profile`, flatten its extends
    // chain and translate into the effective `security` + `tools` blocks.
    // Soft preferences are appended to the rules block as a dedicated
    // "Tool Routing Guidance" section.
    let effectiveTools = agentDecl.tools;
    let effectiveSecurity = agentDecl.security;
    let preferencesMd = "";
    if (agentDecl.capability_profile !== undefined) {
      const resolved = resolveCapabilityProfile(
        agentDecl.capability_profile,
        manifest.capability_profiles ?? {},
      );
      // Profile-derived values take precedence over flat fields.
      effectiveTools = resolved.tools;
      effectiveSecurity = resolved.security;
      preferencesMd = renderPreferencesMarkdown(resolved.preferences);
    }

    const rulesBlock = preferencesMd
      ? `## Coding Rules\n\n${assembled}\n\n${preferencesMd}`
      : `## Coding Rules\n\n${assembled}`;
    const tokenCount = estimateTokens(rulesBlock, manifest.tokenizerMargin);

    // Validate token budget
    if (tokenCount > manifest.tokenBudget) {
      throw new ApmBudgetExceededError(agentKey, tokenCount, manifest.tokenBudget);
    }

    const pct = Math.round((tokenCount / manifest.tokenBudget) * 100);
    const engine = getTiktokenEncoder() ? "tiktoken" : "heuristic";
    console.log(`[APM] agent "${agentKey}": ${tokenCount}/${manifest.tokenBudget} tokens (${pct}%) [${engine}]`);

    // --- Load agent prompt template(s) from .apm/agents/<promptFile> ---
    // `promptFile` may be a single path or an ordered list of fragment
    // paths; fragments are concatenated with a blank line between them
    // into one template, applied to the rest of the pipeline as-is.
    const fragments = promptFragments(agentDecl);
    const fragmentContents: string[] = [];
    for (const fragment of fragments) {
      const templatePath = path.join(agentsDir, fragment);
      if (!fs.existsSync(templatePath)) {
        const via = fragments.length === 1
          ? "via promptFile"
          : `via promptFile fragment [${fragments.indexOf(fragment)}]`;
        throw new ApmCompileError(
          `Agent template not found: .apm/agents/${fragment} ` +
          `(referenced by agent "${agentKey}" ${via}). ` +
          `Create the file or fix the promptFile path in apm.yml.`,
        );
      }
      fragmentContents.push(fs.readFileSync(templatePath, "utf-8"));
    }
    const systemPromptTemplate = fragmentContents.join("\n\n");
    const promptSource = fragments.length === 1
      ? fragments[0]
      : `[${fragments.join(" + ")}]`;

    // Lint: ERROR on literal `{{featureSlug}}_*.ext` constructions inside
    // fenced code blocks. Those are executable instructions (shell snippets,
    // tool-call arguments) that bypass the typed Declared I/O block and
    // re-introduce the flat `in-progress/<slug>_*` namespace the artifact
    // bus replaced. Inline-backtick references inside the standard "legacy
    // path warning" boilerplate are intentional and excluded by this
    // heuristic (only fenced ``` blocks are scanned). Promoted from
    // warning to error after both apps cleared the surface.
    const promptKey = promptFragmentKey(agentDecl);
    const slugLiteralLint = lintAgentPromptForSlugLiterals(systemPromptTemplate);
    if (slugLiteralLint.length > 0 && !lintReportedPromptKeys.has(promptKey)) {
      lintReportedPromptKeys.add(promptKey);
      const sharingAgents = agentsByPromptKey.get(promptKey) ?? [agentKey];
      const sharedNote = sharingAgents.length > 1
        ? ` (shared by agents: ${sharingAgents.join(", ")})`
        : "";
      const lines = slugLiteralLint
        .map((hit) => `  .apm/agents/${promptSource}:${hit.line}: ${hit.text}`)
        .join("\n");
      throw new ApmCompileError(
        `[APM] agent "${agentKey}": ${slugLiteralLint.length} literal {{featureSlug}}_* path(s) ` +
        `inside fenced code blocks (use the Declared I/O block instead)${sharedNote}:\n${lines}`,
      );
    }

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
      tools: effectiveTools,
      security: effectiveSecurity,
      systemPromptTemplate,
    };
  }

  // --- 7. Compile triage profiles ---
  const triageProfiles: Record<string, CompiledTriageProfile> = {};
  // Reserved pseudo-domains never need to be declared in `domains:`.
  const RESERVED_DOMAINS = new Set(["blocked"]);
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

      // Resolve domain set: explicit `domains:` wins; otherwise derive from routing keys.
      const routingKeys = Object.keys(profile.routing);
      const declaredDomains = profile.domains;
      if (declaredDomains && declaredDomains.length > 0) {
        const declaredSet = new Set(declaredDomains);
        for (const k of routingKeys) {
          if (!declaredSet.has(k)) {
            throw new ApmCompileError(
              `Triage profile "${wfName}.${profileName}" declares routing domain "${k}" ` +
              `that is not in the profile's domains list [${declaredDomains.join(", ")}]. ` +
              `Add it to domains: or remove from routing:.`,
            );
          }
        }
      }
      const domainSet = new Set(declaredDomains ?? routingKeys);

      // Resolve patterns: prepend built-ins unless opted out. Built-in
      // patterns are silently filtered out when their suggested domain is
      // not in this profile's domain set — they are general-purpose hints,
      // not required routes. User-declared patterns (from `profile.patterns`)
      // are strictly validated: an unrouted domain is a config error.
      const declaredPatterns = profile.patterns ?? [];
      const includeBuiltins = profile.builtin_patterns !== false;
      const filteredBuiltins = includeBuiltins
        ? BUILTIN_TRIAGE_PATTERNS.filter(
            (p) => domainSet.has(p.domain) || RESERVED_DOMAINS.has(p.domain),
          )
        : [];
      const patterns = [...filteredBuiltins, ...declaredPatterns];

      // Validate declared-pattern domains against the profile's domain set.
      // Reserved pseudo-domains are allowed. Built-ins are not validated
      // here — they were already filtered above.
      for (const pat of declaredPatterns) {
        if (!domainSet.has(pat.domain) && !RESERVED_DOMAINS.has(pat.domain)) {
          throw new ApmCompileError(
            `Triage profile "${wfName}.${profileName}" has a declared pattern emitting ` +
            `domain "${pat.domain}" which is not in the profile's domain set ` +
            `[${[...domainSet].join(", ")}]. ` +
            `Add "${pat.domain}" to routing: or domains:.`,
          );
        }
      }

      const compiledKey = `${wfName}.${profileName}`;
      triageProfiles[compiledKey] = {
        llm_fallback: profile.llm_fallback,
        ...(profile.classifier ? { classifier: profile.classifier } : {}),
        max_reroutes: profile.max_reroutes,
        routing: profile.routing,
        domains: [...domainSet],
        patterns,
        signatures,
      };
    }

    // Session B (Item 4) — validate every node's on_failure.routes key
    // resolves to a declared domain for the referenced triage profile.
    for (const [nodeKey, node] of Object.entries(wf.nodes)) {
      if (!node.on_failure) continue;
      const triageNodeKey = node.on_failure.triage;
      const triageNode = wf.nodes[triageNodeKey];
      const profileName = triageNode?.triage_profile;
      if (!profileName) continue;
      const compiledKey = `${wfName}.${profileName}`;
      const compiled = triageProfiles[compiledKey];
      if (!compiled) continue;
      const allowed = new Set([...compiled.domains, ...RESERVED_DOMAINS]);
      for (const key of Object.keys(node.on_failure.routes)) {
        if (!allowed.has(key)) {
          const suggestion = nearestNeighbor(key, [...allowed]);
          throw new ApmCompileError(
            `Node "${nodeKey}" on_failure.routes has domain key "${key}" ` +
            `which is not in triage profile "${compiledKey}" ` +
            `[${[...allowed].sort().join(", ")}]. ` +
            (suggestion ? `Did you mean "${suggestion}"?` : "Fix the domain key or add it to routing:."),
          );
        }
      }
    }
  }

  // --- 8. Build compiled output (resolve env vars in config) ---
  const resolvedConfig = manifest.config
    ? resolveEnvVars(manifest.config)
    : undefined;

  // Replace the raw (possibly path-form) handlebarsPartials map with the
  // resolved inline contents from step 5c — agents.ts registers these
  // verbatim at render time.
  if (resolvedConfig && Object.keys(resolvedHandlebarsPartials).length > 0) {
    resolvedConfig.handlebarsPartials = resolvedHandlebarsPartials;
  }

  const output: ApmCompiledOutput = {
    version: "1.0.0",
    compiledAt: new Date().toISOString(),
    tokenBudget: manifest.tokenBudget,
    agents,
    ...(resolvedConfig ? { config: resolvedConfig } : {}),
    workflows,
    triage_profiles: triageProfiles,
    plugins: scanPluginDirs(apmDir),
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

/**
 * lintAgentPromptForSlugLiterals — flag every `{{featureSlug}}_*.<ext>`
 * path in an agent prompt that is NOT a documented negative example.
 *
 * Background: the artifact bus replaced the flat
 * `in-progress/<slug>_<KIND>.<ext>` namespace with per-invocation typed
 * artifacts, and kernel-owned files moved under `<slug>/` (e.g.
 * `<slug>/_trans.md`, `<slug>/_change-manifest.json`). Legacy flat
 * paths like `<slug>_TRANS.md` or `<slug>_CHANGES.json` are no longer
 * written, so any prompt that reads or writes them is broken.
 *
 * Live constructions inside fenced code blocks (shell snippets,
 * `cat`/`>` redirects, tool-call args) and prose reads/writes in
 * inline backticks are both bugs. Documented negative examples are
 * intentional: a line containing one of the allow-list markers
 * (`do NOT`, `never`, `no longer scanned`, case-insensitive) is
 * treated as documentation and skipped.
 *
 * The lint is a pure string scan: returns one entry per offending line
 * with its 1-based line number and the line text (trimmed). Returns
 * `[]` when the prompt is clean.
 */
export function lintAgentPromptForSlugLiterals(
  prompt: string,
): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = [];
  const lines = prompt.split("\n");
  const slugLiteralRe = /\{\{\s*featureSlug\s*\}\}_[A-Za-z0-9-]+/;
  const allowListRe = /\b(do\s+not|never|no\s+longer\s+scanned)\b/i;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    if (/^\s*```/.test(raw)) continue;
    if (!slugLiteralRe.test(raw)) continue;
    if (allowListRe.test(raw)) continue;
    hits.push({ line: i + 1, text: raw.trim() });
  }
  return hits;
}
