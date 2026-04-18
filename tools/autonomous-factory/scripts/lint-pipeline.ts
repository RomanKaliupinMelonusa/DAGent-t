#!/usr/bin/env -S node --import tsx
/**
 * scripts/lint-pipeline.ts — Phase 5 schema validation CLI.
 *
 * Validates the APM configuration of one or more apps:
 *   • Runs the full `compileApm()` compiler (which internally validates
 *     apm.yml, workflows, triage profiles, middleware refs, skills, MCP
 *     files, token budgets, DAG acyclicity, `produces/consumes` flow,
 *     and all node-type constraints).
 *   • Surfaces any `ApmCompileError` with a clean, grep-friendly format.
 *   • In addition, checks that each node's resolved handler reference is
 *     known — either a built-in key or a local path within the app root.
 *
 * Usage:
 *   npm run pipeline:lint                    # lint every .apm/ under apps/
 *   npm run pipeline:lint -- apps/sample-app # lint a single app
 *   npm run pipeline:lint -- --json          # machine-readable output
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileApm } from "../src/apm/compiler.js";
import { inferHandler } from "../src/handlers/registry.js";

interface LintIssue {
  readonly app: string;
  readonly kind: "error" | "warning";
  readonly message: string;
}

interface LintReport {
  readonly app: string;
  readonly ok: boolean;
  readonly issues: ReadonlyArray<LintIssue>;
  readonly workflows: number;
  readonly nodes: number;
  readonly agents: number;
}

function findApps(repoRoot: string): string[] {
  const appsDir = path.join(repoRoot, "apps");
  if (!fs.existsSync(appsDir)) return [];
  const entries = fs.readdirSync(appsDir, { withFileTypes: true });
  const apps: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const apm = path.join(appsDir, e.name, ".apm", "apm.yml");
    if (fs.existsSync(apm)) apps.push(path.join("apps", e.name));
  }
  return apps;
}

function lintApp(appRoot: string): LintReport {
  const appRel = path.relative(process.cwd(), appRoot) || appRoot;
  const issues: LintIssue[] = [];
  let workflows = 0;
  let nodes = 0;
  let agents = 0;
  try {
    const compiled = compileApm(appRoot);
    workflows = Object.keys(compiled.workflows).length;
    agents = Object.keys(compiled.agents).length;
    const handlerDefaults = compiled.config?.handler_defaults;
    for (const [wfName, wf] of Object.entries(compiled.workflows)) {
      for (const [nodeKey, node] of Object.entries(wf.nodes)) {
        nodes++;
        const handlerRef = node.handler ?? inferHandler(node.type, node.script_type, handlerDefaults);
        if (!handlerRef) {
          issues.push({
            app: appRel,
            kind: "error",
            message: `${wfName}.${nodeKey}: cannot infer handler for type="${node.type}" script_type="${node.script_type ?? ""}". Add node.handler or config.handler_defaults entry.`,
          });
          continue;
        }
        if (handlerRef.startsWith("./")) {
          const resolved = path.resolve(appRoot, handlerRef);
          if (!fs.existsSync(resolved)) {
            issues.push({
              app: appRel,
              kind: "error",
              message: `${wfName}.${nodeKey}: custom handler "${handlerRef}" does not exist at ${resolved}`,
            });
          }
        }
        // Warn on deprecated fields
        if (node.injects_infra_rollback && !node.injects_triage_rejection) {
          issues.push({
            app: appRel,
            kind: "warning",
            message: `${wfName}.${nodeKey}: uses deprecated "injects_infra_rollback". Rename to "injects_triage_rejection".`,
          });
        }
        if (node.writes_deploy_sentinel) {
          issues.push({
            app: appRel,
            kind: "warning",
            message: `${wfName}.${nodeKey}: uses deprecated "writes_deploy_sentinel"; sentinel logic now lives in hook scripts.`,
          });
        }
      }
      // Warn on workflow-level deprecated triage field on individual nodes already handled above.
    }
    // Policy sanity check (Phase 4 surface)
    const policy = compiled.config?.policy;
    if (policy?.max_idle_minutes === undefined && policy?.max_total_failures === undefined) {
      issues.push({
        app: appRel,
        kind: "warning",
        message: `config.policy has no max_idle_minutes or max_total_failures set — pipeline cannot self-terminate on stall or failure storm.`,
      });
    }
  } catch (err) {
    issues.push({
      app: appRel,
      kind: "error",
      message: (err as Error).message,
    });
  }
  return {
    app: appRel,
    ok: issues.every((i) => i.kind !== "error"),
    issues,
    workflows,
    nodes,
    agents,
  };
}

function formatHuman(reports: LintReport[]): string {
  const lines: string[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;
  for (const r of reports) {
    const errs = r.issues.filter((i) => i.kind === "error").length;
    const warns = r.issues.filter((i) => i.kind === "warning").length;
    totalErrors += errs;
    totalWarnings += warns;
    const status = r.ok ? "\x1b[32mOK\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    lines.push(`[${status}] ${r.app}  (${r.workflows} workflows, ${r.nodes} nodes, ${r.agents} agents, ${errs} errors, ${warns} warnings)`);
    for (const i of r.issues) {
      const tag = i.kind === "error" ? "\x1b[31merror\x1b[0m" : "\x1b[33mwarn\x1b[0m";
      lines.push(`  ${tag}: ${i.message}`);
    }
  }
  lines.push("");
  lines.push(`Summary: ${totalErrors} error(s), ${totalWarnings} warning(s) across ${reports.length} app(s).`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const positional = args.filter((a) => !a.startsWith("--"));
  const thisFile = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(thisFile), "..", "..", "..");
  const appRoots = positional.length > 0
    ? positional.map((p) => path.resolve(process.cwd(), p))
    : findApps(repoRoot).map((r) => path.join(repoRoot, r));

  if (appRoots.length === 0) {
    console.error("No apps found under apps/*/.apm/apm.yml");
    process.exit(1);
  }

  const reports = appRoots.map(lintApp);
  if (jsonMode) {
    process.stdout.write(JSON.stringify(reports, null, 2) + "\n");
  } else {
    process.stdout.write(formatHuman(reports) + "\n");
  }
  const hasErrors = reports.some((r) => !r.ok);
  process.exit(hasErrors ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
