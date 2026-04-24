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
import { compileVolatilePatterns, DEFAULT_VOLATILE_PATTERNS } from "../src/domain/index.js";

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

/**
 * Aggregate every `errorLog[*].message` across all in-progress slugs for
 * an app. Best-effort: returns `[]` when no `in-progress/` directory or
 * no `_state.json` files exist (pre-first-run apps), suppressing the
 * dead-pattern lint silently.
 */
function readRecentErrorMessages(appRoot: string): string[] {
  const inProgress = path.join(appRoot, "in-progress");
  if (!fs.existsSync(inProgress)) return [];
  const messages: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(inProgress, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const stateFile = path.join(inProgress, e.name, "_state.json");
    if (!fs.existsSync(stateFile)) continue;
    try {
      const raw = fs.readFileSync(stateFile, "utf8");
      const parsed = JSON.parse(raw) as { errorLog?: Array<{ message?: unknown }> };
      for (const entry of parsed.errorLog ?? []) {
        if (typeof entry.message === "string") messages.push(entry.message);
      }
    } catch {
      // Corrupt or partial state file — ignore.
    }
  }
  return messages;
}

/**
 * Warn on user-declared volatile patterns whose regex matched zero error
 * messages in the most recent run(s). Catches both authoring mistakes
 * (pattern targets the wrong shape) and patterns whose triggering
 * failure no longer occurs in the corpus. Built-in defaults are NOT
 * checked — they are stack-agnostic and assumed good.
 *
 * Patterns are run against the same intermediate string the kernel
 * fingerprinter sees: defaults applied first, then workflow patterns
 * applied as we walk through them so per-node patterns observe the
 * post-workflow form (mirrors `DefaultKernelRules.maybeReportFires`).
 */
function lintDeadVolatilePatterns(
  appRoot: string,
  appRel: string,
  compiled: ReturnType<typeof compileApm>,
): LintIssue[] {
  const issues: LintIssue[] = [];
  const userWorkflowRaw = compiled.config?.error_signature?.volatile_patterns;
  let workflowCompiled;
  try {
    workflowCompiled = compileVolatilePatterns(userWorkflowRaw);
  } catch (err) {
    // compileApm should have caught invalid regex sources, but be defensive.
    issues.push({
      app: appRel,
      kind: "error",
      message: `config.error_signature.volatile_patterns: ${(err as Error).message}`,
    });
    return issues;
  }

  // Collect per-node patterns by (workflow, node).
  const perNode: Array<{ wf: string; node: string; compiled: ReturnType<typeof compileVolatilePatterns> }> = [];
  for (const [wfName, wf] of Object.entries(compiled.workflows)) {
    for (const [nodeKey, node] of Object.entries(wf.nodes)) {
      const raw = (node as { error_signature?: { volatile_patterns?: typeof userWorkflowRaw } })
        .error_signature?.volatile_patterns;
      if (!raw || raw.length === 0) continue;
      try {
        perNode.push({ wf: wfName, node: nodeKey, compiled: compileVolatilePatterns(raw) });
      } catch (err) {
        issues.push({
          app: appRel,
          kind: "error",
          message: `${wfName}.${nodeKey}.error_signature.volatile_patterns: ${(err as Error).message}`,
        });
      }
    }
  }

  if (workflowCompiled.length === 0 && perNode.length === 0) return issues;

  const messages = readRecentErrorMessages(appRoot);
  if (messages.length === 0) return issues;  // No corpus, can't judge.

  // Pre-normalize via defaults once per message, then walk workflow
  // patterns detect-then-apply, then per-node patterns against the
  // post-workflow form.
  const workflowNormalized = messages.map((m) => {
    let cur = m;
    for (const [re, repl] of DEFAULT_VOLATILE_PATTERNS) cur = cur.replace(re, repl);
    return cur;
  });
  // Walk workflow patterns once across all messages, tracking whether
  // each fired anywhere; afterwards, mutate `workflowNormalized` so
  // per-node patterns see the same intermediate the kernel sees.
  for (let i = 0; i < workflowCompiled.length; i++) {
    const [re, repl] = workflowCompiled[i]!;
    let fired = false;
    for (let m = 0; m < workflowNormalized.length; m++) {
      re.lastIndex = 0;
      if (re.test(workflowNormalized[m]!)) fired = true;
      re.lastIndex = 0;
      workflowNormalized[m] = workflowNormalized[m]!.replace(re, repl);
    }
    if (!fired) {
      const src = (userWorkflowRaw?.[i] as { pattern?: string } | undefined)?.pattern ?? "?";
      issues.push({
        app: appRel,
        kind: "warning",
        message: `config.error_signature.volatile_patterns[${i}] (/${src}/) matched no errorLog messages in the most recent run(s) — possibly dead config or stale pattern.`,
      });
    }
  }

  for (const { wf, node, compiled: patterns } of perNode) {
    for (let i = 0; i < patterns.length; i++) {
      const [re] = patterns[i]!;
      let fired = false;
      for (const norm of workflowNormalized) {
        re.lastIndex = 0;
        if (re.test(norm)) { fired = true; break; }
      }
      if (!fired) {
        issues.push({
          app: appRel,
          kind: "warning",
          message: `${wf}.${node}.error_signature.volatile_patterns[${i}] matched no errorLog messages in the most recent run(s) — possibly dead config.`,
        });
      }
    }
  }

  return issues;
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
    const strict = compiled.config?.strict_handler_inference;
    for (const [wfName, wf] of Object.entries(compiled.workflows)) {
      for (const [nodeKey, node] of Object.entries(wf.nodes)) {
        nodes++;
        const handlerRef = node.handler ?? inferHandler(node.type, node.script_type, handlerDefaults, strict);
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

    // Dead volatile_patterns check — flag user-supplied patterns that
    // matched zero observed signatures in the most recent run. Catches
    // both authoring mistakes (pattern targets the wrong shape) and
    // patterns whose triggering failure no longer occurs. Best-effort:
    // requires a recent `_state.json` under `in-progress/` for the app.
    issues.push(...lintDeadVolatilePatterns(appRoot, appRel, compiled));
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
