/**
 * run.ts — Demo pipeline entry point.
 *
 * Linear loop with failure-routing index jumps and a try/catch/finally
 * finalizer (pr-creation). State is JSON on disk. Resume reloads state
 * and skips any node already marked `completed`.
 *
 * CLI:
 *   --slug <name>            (required)
 *   --app <path>             (required, e.g. apps/commerce-storefront)
 *   --spec <path>            (required on first run)
 *   --e2e-guide <path>       (required on first run)
 *   --base-branch <branch>   (default: main)
 *   --resume                 (reload state.json and skip completed nodes)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runAgentNode } from "./agent.ts";
import { runScriptNode } from "./script.ts";
import { MAIN_NODES, FINALIZER } from "./nodes.ts";
import {
  ensureRunDirs,
  initOutput,
  loadState,
  logsDir,
  saveState,
  snapshotNode,
} from "./state.ts";
import type { NodeAttempt, NodeDef, NodeId, RunState } from "./types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MAX_JUMPS = 5;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliArgs {
  slug: string;
  /** Required on first run; optional on --resume (falls back to state.json). */
  app?: string;
  spec?: string;
  e2eGuide?: string;
  baseBranch: string;
  resume: boolean;
}

function parseCli(argv: readonly string[]): CliArgs {
  const args: Partial<CliArgs> = { baseBranch: "main", resume: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--slug":          args.slug = next(); break;
      case "--app":           args.app = next(); break;
      case "--spec":          args.spec = next(); break;
      case "--e2e-guide":     args.e2eGuide = next(); break;
      case "--base-branch":   args.baseBranch = next(); break;
      case "--resume":        args.resume = true; break;
      case "--help":
      case "-h":
        printUsage(); process.exit(0);
      default:
        // tolerate `--resume <slug>` short form
        if (!args.slug && !a.startsWith("--")) args.slug = a;
        break;
    }
  }
  if (!args.slug) { printUsage(); throw new Error("Missing --slug"); }
  // On resume, --app is optional and falls back to state.json. On a fresh
  // run it's still required (initState validates this below).
  if (!args.app && !args.resume) { printUsage(); throw new Error("Missing --app"); }
  return args as CliArgs;
}

function printUsage(): void {
  console.error(
    "Usage: npm run demo -- --slug <name> --app <path> " +
    "[--spec <path>] [--e2e-guide <path>] [--base-branch <branch>] [--resume]",
  );
}

// ---------------------------------------------------------------------------
// State init / resume
// ---------------------------------------------------------------------------

function initState(args: CliArgs): RunState {
  const existing = args.resume ? loadState(args.slug) : null;
  if (existing) {
    console.log(`[run] resuming '${args.slug}' from ${Object.keys(existing.outputs).length} completed nodes`);
    return existing;
  }
  if (!args.app) {
    throw new Error("Missing --app (no prior state.json found to resume from).");
  }
  if (!args.spec || !args.e2eGuide) {
    throw new Error("First run requires --spec and --e2e-guide.");
  }
  const specPath = path.resolve(REPO_ROOT, args.spec);
  const e2eGuidePath = path.resolve(REPO_ROOT, args.e2eGuide);
  if (!fs.existsSync(specPath))      throw new Error(`Spec not found: ${specPath}`);
  if (!fs.existsSync(e2eGuidePath))  throw new Error(`E2E guide not found: ${e2eGuidePath}`);
  const featureBranch = `feature/${args.slug}`;
  return {
    slug: args.slug,
    app: args.app,
    baseBranch: args.baseBranch,
    featureBranch,
    specPath,
    e2eGuidePath,
    startedAt: new Date().toISOString(),
    jumps: 0,
    outputs: {},
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Branch setup — shells out to the existing repo wrapper.
// ---------------------------------------------------------------------------

function ensureFeatureBranch(state: RunState): void {
  const wrapper = path.join(REPO_ROOT, "demo", "scripts", "agent-branch.sh");
  if (!fs.existsSync(wrapper)) {
    console.warn(`[run] WARN: ${wrapper} not present — creating branch with raw git.`);
    try {
      execSync(`git checkout -B ${state.featureBranch} ${state.baseBranch}`, {
        cwd: REPO_ROOT, stdio: "inherit",
      });
    } catch (err) {
      throw new Error(`Failed to create branch: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }
  console.log(`[run] creating branch ${state.featureBranch} off ${state.baseBranch}`);
  execSync(`bash ${wrapper} create-feature ${state.slug}`, {
    cwd: REPO_ROOT,
    env: { ...process.env, BASE_BRANCH: state.baseBranch, APP_ROOT: path.resolve(REPO_ROOT, state.app) },
    stdio: "inherit",
  });
}

// ---------------------------------------------------------------------------
// Single-node execution with retries
// ---------------------------------------------------------------------------

async function executeNode(node: NodeDef, state: RunState): Promise<void> {
  const out = state.outputs[node.id] ?? initOutput();
  state.outputs[node.id] = out;
  out.status = "running";

  const maxAttempts = (node.maxRetries ?? 1) + 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    ensureRunDirs(state.slug);
    const logPath = path.join(logsDir(state.slug), `${node.id}.${attempt}.log`);
    const startedAt = new Date().toISOString();
    console.log(`\n[run] ▶ ${node.id} (attempt ${attempt}/${maxAttempts}) — log: ${logPath}`);

    const res = node.kind === "agent"
      ? await runAgentNode(node, state, attempt, REPO_ROOT, logPath)
      : await runScriptNode(node, state, attempt, REPO_ROOT, logPath);

    const attemptRecord: NodeAttempt = {
      attempt,
      startedAt,
      endedAt: new Date().toISOString(),
      status: res.ok ? "completed" : "failed",
      errorSummary: res.errorMessage,
      logPath: path.relative(REPO_ROOT, logPath),
    };
    out.attempts.push(attemptRecord);
    state.history.push({ nodeId: node.id, attempt: attemptRecord });

    if (res.ok) {
      out.status = "completed";
      out.result = res.result;
      out.errorSummary = undefined;
      saveState(state);
      snapshotNode(state, node.id);
      console.log(`[run] ✓ ${node.id} completed`);
      return;
    }

    out.errorSummary = res.errorMessage;
    saveState(state);
    console.log(`[run] ✗ ${node.id} attempt ${attempt} failed: ${res.errorMessage}`);
  }

  out.status = "failed";
  saveState(state);
  snapshotNode(state, node.id);
  // The throw is what triggers failure routing in the outer loop.
  throw Object.assign(new Error(`Node ${node.id} failed after ${maxAttempts} attempt(s).`), {
    nodeId: node.id,
  });
}

// ---------------------------------------------------------------------------
// Main loop with index-jump failure routing
// ---------------------------------------------------------------------------

function findIndex(nodes: readonly NodeDef[], id: NodeId): number {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error(`Cannot route to unknown node '${id}'.`);
  return idx;
}

async function runMainLoop(state: RunState): Promise<void> {
  let i = 0;
  while (i < MAIN_NODES.length) {
    const node = MAIN_NODES[i];

    if (state.outputs[node.id]?.status === "completed") {
      console.log(`[run] ⤳ ${node.id} already completed — skipping`);
      const next = node.onSuccess ? findIndex(MAIN_NODES, node.onSuccess) : i + 1;
      // If onSuccess routes backward through already-completed nodes we still
      // skip them (resume of a finished pipeline). The interesting case —
      // re-running the post-debug validation segment — is handled below in
      // the live-success branch where we reset statuses before jumping.
      i = next;
      continue;
    }

    try {
      await executeNode(node, state);
      if (node.onSuccess) {
        const target = findIndex(MAIN_NODES, node.onSuccess);
        if (target < i && state.jumps < MAX_JUMPS) {
          // Backward success jump (e.g. storefront-debug → unit-test). Re-validate
          // by clearing the segment [target, i] so it actually re-runs.
          state.jumps++;
          for (let k = target; k < i; k++) {
            const out = state.outputs[MAIN_NODES[k].id];
            if (out && out.status === "completed") out.status = "pending";
          }
          saveState(state);
          console.log(`[run] ↻ success-jumping ${node.id} → ${node.onSuccess} (jump ${state.jumps}/${MAX_JUMPS}, re-validating ${i - target} node(s))`);
          i = target;
        } else if (target < i) {
          throw Object.assign(
            new Error(`Failure routing cap reached (${MAX_JUMPS} jumps) on success-jump from '${node.id}'.`),
            { nodeId: node.id },
          );
        } else {
          i = target;
        }
      } else {
        i = i + 1;
      }
    } catch (err) {
      const e = err as Error & { nodeId?: NodeId };
      if (node.onFailure && state.jumps < MAX_JUMPS) {
        state.jumps++;
        const target = findIndex(MAIN_NODES, node.onFailure);
        // Reset target plus any completed nodes between target and current
        // node so the recovery loop actually re-executes them.
        const lo = Math.min(target, i);
        const hi = Math.max(target, i);
        for (let k = lo; k <= hi; k++) {
          const out = state.outputs[MAIN_NODES[k].id];
          if (out && (out.status === "completed" || out.status === "failed")) {
            out.status = "pending";
          }
        }
        saveState(state);
        console.log(`[run] ↻ jumping ${node.id} → ${node.onFailure} (jump ${state.jumps}/${MAX_JUMPS})`);
        i = target;
        continue;
      }
      const reason = node.onFailure
        ? `Failure routing cap reached (${MAX_JUMPS} jumps) at node '${node.id}': ${e.message}`
        : `Node '${node.id}' failed and has no onFailure route: ${e.message}`;
      throw Object.assign(new Error(reason), { nodeId: node.id });
    }
  }
}

// ---------------------------------------------------------------------------
// Finalizer — always runs.
// ---------------------------------------------------------------------------

async function runFinalizer(state: RunState): Promise<void> {
  console.log(`\n[run] ▶ finalizer: ${FINALIZER.id} (terminalError=${state.terminalError ? "yes" : "no"})`);
  try {
    await executeNode(FINALIZER, state);
  } catch (err) {
    // Finalizer failures must not crash the run. Persist a recovery
    // body so the operator can finish the PR by hand.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[run] FINALIZER FAILED: ${msg}`);
    const recoveryPath = path.join(REPO_ROOT, "demo", ".runs", state.slug, "pr-body.md");
    fs.mkdirSync(path.dirname(recoveryPath), { recursive: true });
    fs.writeFileSync(recoveryPath, renderRecoveryBody(state));
    console.error(`[run] Wrote recovery PR body to ${recoveryPath}`);
  }
}

function renderRecoveryBody(state: RunState): string {
  const status = state.terminalError ? "FAILED" : "SUCCEEDED";
  const lines = [
    `# [demo] ${state.slug} (${status})`,
    "",
    `Branch: \`${state.featureBranch}\` → \`${state.baseBranch}\``,
    `Started: ${state.startedAt}`,
    `Jumps: ${state.jumps}/${MAX_JUMPS}`,
    "",
    "## Node history",
    "",
    ...state.history.map((h) =>
      `- **${h.nodeId}** attempt ${h.attempt.attempt}: ${h.attempt.status}` +
      (h.attempt.errorSummary ? ` — ${h.attempt.errorSummary}` : "")),
    "",
  ];
  if (state.terminalError) {
    lines.push("## Terminal error", "", "```", state.terminalError, "```", "");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2));
  const state = initState(args);
  ensureRunDirs(state.slug);
  saveState(state);

  if (!args.resume) {
    ensureFeatureBranch(state);
  }

  let exitCode = 0;
  try {
    await runMainLoop(state);
    console.log(`\n[run] ✓ main loop completed successfully`);
  } catch (err) {
    state.terminalError = err instanceof Error ? err.message : String(err);
    saveState(state);
    console.error(`\n[run] ✗ main loop terminated: ${state.terminalError}`);
    exitCode = 1;
  } finally {
    await runFinalizer(state);
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[run] fatal:", err);
  process.exit(2);
});
