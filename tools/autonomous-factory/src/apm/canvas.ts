/**
 * canvas.ts — Flat, tool-friendly projection of the APM compiled output.
 *
 * The canvas is a lossy but self-contained JSON snapshot suitable for:
 *   - Graphical DAG editors / visualisation dashboards
 *   - Round-trip editing flows (canvas → YAML fragment → canvas)
 *   - External tooling that should NOT depend on the full compiler API
 *
 * The schema is intentionally narrower than `ApmCompiledOutput`:
 *   - Agents keep only metadata (no rules / system prompt text)
 *   - Workflows keep node graph fields + triage profile declarations
 *   - No MCP details, no capability profiles, no hooks
 *
 * Round-trip contract:
 *   toCanvas(fromCanvas(canvas))  deep-equals canvas
 *
 * This guarantees that canvas-level edits can be serialised, re-hydrated,
 * and re-serialised without information loss at the canvas level.
 */

import { z } from "zod";

import type { ApmCompiledOutput } from "./types.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const ApmCanvasAgentSchema = z.object({
  key: z.string(),
  tokenCount: z.number().int().nonnegative(),
  mcpServers: z.array(z.string()),
  skills: z.array(z.string()),
});

export const ApmCanvasOnFailureSchema = z.object({
  triage: z.string(),
  routes: z.record(z.string(), z.string().nullable()),
});

export const ApmCanvasNodeSchema = z.object({
  key: z.string(),
  type: z.string(),
  category: z.string(),
  node_kind: z.string().optional(),
  agent: z.string().optional(),
  handler: z.string().optional(),
  script_type: z.string().optional(),
  depends_on: z.array(z.string()),
  triggers: z.array(z.string()),
  triage_profile: z.string().optional(),
  on_failure: ApmCanvasOnFailureSchema.optional(),
  timeout_minutes: z.number().positive().optional(),
});

export const ApmCanvasTriageRouteSchema = z.object({
  description: z.string().optional(),
  retries: z.number().int().positive().optional(),
});

export const ApmCanvasTriageProfileSchema = z.object({
  name: z.string(),
  classifier: z.string().optional(),
  max_reroutes: z.number().int().positive(),
  routing: z.record(z.string(), ApmCanvasTriageRouteSchema),
});

export const ApmCanvasWorkflowSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  nodes: z.array(ApmCanvasNodeSchema),
  triage_profiles: z.array(ApmCanvasTriageProfileSchema),
});

export const ApmCanvasSchema = z.object({
  version: z.literal("1.0.0"),
  app: z.string(),
  agents: z.array(ApmCanvasAgentSchema),
  workflows: z.array(ApmCanvasWorkflowSchema),
});

export type ApmCanvas = z.infer<typeof ApmCanvasSchema>;
export type ApmCanvasAgent = z.infer<typeof ApmCanvasAgentSchema>;
export type ApmCanvasWorkflow = z.infer<typeof ApmCanvasWorkflowSchema>;
export type ApmCanvasNode = z.infer<typeof ApmCanvasNodeSchema>;
export type ApmCanvasTriageProfile = z.infer<typeof ApmCanvasTriageProfileSchema>;

// ---------------------------------------------------------------------------
// Exporter — compiled APM → canvas
// ---------------------------------------------------------------------------

/**
 * Project an `ApmCompiledOutput` into an `ApmCanvas`.
 * Pure function, deterministic key ordering.
 */
export function toCanvas(app: string, compiled: ApmCompiledOutput): ApmCanvas {
  const agents: ApmCanvasAgent[] = Object.keys(compiled.agents)
    .sort()
    .map((key) => {
      const a = compiled.agents[key];
      return {
        key,
        tokenCount: a.tokenCount,
        mcpServers: Object.keys(a.mcp).sort(),
        skills: Object.keys(a.skills).sort(),
      };
    });

  const workflows: ApmCanvasWorkflow[] = Object.keys(compiled.workflows)
    .sort()
    .map((wfName) => projectWorkflow(wfName, compiled.workflows[wfName], compiled));

  return { version: "1.0.0", app, agents, workflows };
}

function projectWorkflow(
  name: string,
  wf: ApmCompiledOutput["workflows"][string],
  compiled: ApmCompiledOutput,
): ApmCanvasWorkflow {
  const nodes: ApmCanvasNode[] = Object.keys(wf.nodes)
    .sort()
    .map((key) => {
      const n = wf.nodes[key];
      const node: ApmCanvasNode = {
        key,
        type: n.type,
        category: n.category,
        depends_on: [...n.depends_on].sort(),
        triggers: [...n.triggers],
      };
      if (n.node_kind) node.node_kind = n.node_kind;
      if (n.agent) node.agent = n.agent;
      if (n.handler) node.handler = n.handler;
      if (n.script_type) node.script_type = n.script_type;
      if (n.triage_profile) node.triage_profile = n.triage_profile;
      if (n.timeout_minutes !== undefined) node.timeout_minutes = n.timeout_minutes;
      if (n.on_failure) {
        node.on_failure = {
          triage: n.on_failure.triage,
          routes: { ...n.on_failure.routes },
        };
      }
      return node;
    });

  const triage_profiles: ApmCanvasTriageProfile[] = Object.keys(compiled.triage_profiles)
    .filter((key) => key.startsWith(`${name}.`))
    .sort()
    .map((compiledKey) => {
      const profile = compiled.triage_profiles[compiledKey];
      const profileName = compiledKey.slice(name.length + 1);
      const routing: Record<string, { description?: string; retries?: number }> = {};
      for (const [dom, entry] of Object.entries(profile.routing)) {
        const r: { description?: string; retries?: number } = {};
        if (entry.description) r.description = entry.description;
        if (entry.retries !== undefined) r.retries = entry.retries;
        routing[dom] = r;
      }
      const out: ApmCanvasTriageProfile = {
        name: profileName,
        max_reroutes: profile.max_reroutes,
        routing,
      };
      if (profile.classifier) out.classifier = profile.classifier;
      return out;
    });

  const out: ApmCanvasWorkflow = { name, nodes, triage_profiles };
  if (wf.description) out.description = wf.description;
  return out;
}

// ---------------------------------------------------------------------------
// Importer — canvas → minimal compiled-shape (for round-trip + tooling)
// ---------------------------------------------------------------------------

/**
 * Rehydrate an `ApmCanvas` into the minimal subset of `ApmCompiledOutput`
 * needed to round-trip back through `toCanvas()`.
 *
 * This is NOT a full compiler — it produces only the fields the canvas
 * projects. It is safe to feed into `toCanvas()` again; it is NOT safe to
 * feed into the runtime (agent rules, MCP configs, etc. are intentionally
 * absent).
 */
export function fromCanvas(canvas: ApmCanvas): {
  app: string;
  compiled: ApmCompiledOutput;
} {
  const agents: ApmCompiledOutput["agents"] = {};
  for (const a of canvas.agents) {
    const mcp: Record<string, never> = {};
    for (const name of a.mcpServers) {
      // Placeholder entries — round-trip preserves keys only, not config.
      (mcp as Record<string, unknown>)[name] = {
        type: "local",
        command: "",
        args: [],
        tools: [],
        availability: "optional",
        fsMutator: true,
      };
    }
    const skills: Record<string, string> = {};
    for (const s of a.skills) skills[s] = "";
    agents[a.key] = {
      rules: "",
      tokenCount: a.tokenCount,
      mcp: mcp as ApmCompiledOutput["agents"][string]["mcp"],
      skills,
      toolLimits: undefined,
      tools: undefined,
      security: undefined,
      systemPromptTemplate: "",
    };
  }

  const workflows: ApmCompiledOutput["workflows"] = {};
  const triage_profiles: ApmCompiledOutput["triage_profiles"] = {};

  for (const wf of canvas.workflows) {
    const nodes: Record<string, ApmCompiledOutput["workflows"][string]["nodes"][string]> = {};
    for (const n of wf.nodes) {
      // Minimal node shape matching ApmWorkflowNode with required defaults.
      nodes[n.key] = {
        type: n.type,
        category: n.category,
        depends_on: [...n.depends_on],
        triggers: [...n.triggers] as ("schedule" | "route")[],
        timeout_minutes: n.timeout_minutes ?? 15,
        requires_data_plane_ready: false,
        auto_skip_if_no_changes_in: [],
        auto_skip_if_no_deletions: false,
        auto_skip_unless_triage_reroute: false,
        template_flags: [],
        force_run_if_changed: [],
        commit_scope: "all",
        diff_attribution_dirs: [],
        writes_deploy_sentinel: false,
        generates_change_manifest: false,
        injects_infra_rollback: false,
        captures_head_sha: false,
        signals_create_pr: false,
        produces: [],
        consumes: [],
        consumes_kickoff: [],
        produces_artifacts: [],
        consumes_artifacts: [],
        consumes_reroute: [],
        ...(n.node_kind ? { node_kind: n.node_kind as "agent" | "script" | "control-flow" | "diagnostic" } : {}),
        ...(n.agent ? { agent: n.agent } : {}),
        ...(n.handler ? { handler: n.handler } : {}),
        ...(n.script_type ? { script_type: n.script_type } : {}),
        ...(n.triage_profile ? { triage_profile: n.triage_profile } : {}),
        ...(n.on_failure
          ? { on_failure: { triage: n.on_failure.triage, routes: { ...n.on_failure.routes } } }
          : {}),
      } as ApmCompiledOutput["workflows"][string]["nodes"][string];
    }

    workflows[wf.name] = {
      ...(wf.description ? { description: wf.description } : {}),
      nodes,
      unfixable_signals: [],
      triage: {},
      routeProfiles: {},
    } as ApmCompiledOutput["workflows"][string];

    for (const tp of wf.triage_profiles) {
      const compiledKey = `${wf.name}.${tp.name}`;
      const routing: Record<string, { description?: string; retries?: number }> = {};
      for (const [dom, r] of Object.entries(tp.routing)) {
        const entry: { description?: string; retries?: number } = {};
        if (r.description) entry.description = r.description;
        if (r.retries !== undefined) entry.retries = r.retries;
        routing[dom] = entry;
      }
      triage_profiles[compiledKey] = {
        llm_fallback: true,
        ...(tp.classifier ? { classifier: tp.classifier } : {}),
        max_reroutes: tp.max_reroutes,
        routing,
        domains: Object.keys(routing),
        patterns: [],
        signatures: [],
      };
    }
  }

  const compiled: ApmCompiledOutput = {
    version: "1.0.0",
    compiledAt: new Date(0).toISOString(),
    tokenBudget: 1,
    agents,
    workflows,
    triage_profiles,
    plugins: { middlewares: [] },
  };

  return { app: canvas.app, compiled };
}
