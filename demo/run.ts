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
 *   --spec-folder <path>     (required on first run — spec-kit feature folder)
 *   --base-branch <branch>   (default: main)
 *   --resume                 (reload state.json and skip completed nodes)
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, spawn as nodeSpawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

import { runAgentNode } from "./agent.ts";
import { runScriptNode } from "./script.ts";
import { MAIN_NODES, FINALIZER } from "./nodes.ts";
import {
  ensureRunDirs,
  initOutput,
  loadState,
  logsDir,
  resolveDagentDir,
  saveState,
  snapshotNode,
} from "./state.ts";
import { buildFailureContext } from "./briefing.ts";
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
  specFolder?: string;
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
      case "--spec-folder":   args.specFolder = next(); break;
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
    "[--spec-folder <path>] [--base-branch <branch>] [--resume]",
  );
}

// ---------------------------------------------------------------------------
// State init / resume
// ---------------------------------------------------------------------------

function initState(args: CliArgs): RunState {
  // On resume, try to load existing state from the app's .dagent/<slug>/ dir.
  if (args.resume && args.app) {
    const dagentDir = resolveDagentDir(REPO_ROOT, args.app, args.slug);
    const existing = loadState(dagentDir);
    if (existing) {
      console.log(`[run] resuming '${args.slug}' from ${Object.keys(existing.outputs).length} completed nodes`);
      return existing;
    }
  }
  if (!args.app) {
    throw new Error("Missing --app (no prior state.json found to resume from).");
  }
  if (!args.specFolder) {
    throw new Error("First run requires --spec-folder (path to a spec-kit feature folder).");
  }
  const specFolderPath = path.resolve(REPO_ROOT, args.specFolder);
  if (!fs.existsSync(specFolderPath) || !fs.statSync(specFolderPath).isDirectory()) {
    throw new Error(`Spec folder not found or not a directory: ${specFolderPath}`);
  }
  for (const required of ["spec.md", "plan.md"]) {
    if (!fs.existsSync(path.join(specFolderPath, required))) {
      throw new Error(`Spec folder missing required file '${required}': ${specFolderPath}`);
    }
  }
  // Read the current branch — speckit owns branch creation, the pipeline
  // works on whatever branch is already checked out.
  const featureBranch = execSync("git branch --show-current", {
    cwd: REPO_ROOT, encoding: "utf-8",
  }).trim();
  if (!featureBranch) {
    throw new Error("Detached HEAD — the pipeline requires a named branch (created by speckit).");
  }
  const appRoot = path.resolve(REPO_ROOT, args.app);
  const dagentDir = resolveDagentDir(REPO_ROOT, args.app, args.slug);
  const kickoffDir = path.join(dagentDir, "_kickoff");
  return {
    slug: args.slug,
    app: args.app,
    baseBranch: args.baseBranch,
    featureBranch,
    specFolderPath,
    kickoffDir,
    dagentDir,
    startedAt: new Date().toISOString(),
    jumps: 0,
    outputs: {},
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Spec staging
// ---------------------------------------------------------------------------

/**
 * Materialize the spec-kit folder into the per-feature `_kickoff/` dir
 * by shelling out to `tools/autonomous-factory/hooks/stage-spec.sh`.
 * Idempotent — re-running on resume is safe (cp -f).
 */
function stageSpec(state: RunState): void {
  const script = path.join(REPO_ROOT, "tools", "autonomous-factory", "hooks", "stage-spec.sh");
  if (!fs.existsSync(script)) {
    throw new Error(`stage-spec script not found: ${script}`);
  }
  console.log(`[run] staging spec-kit folder → ${path.relative(REPO_ROOT, state.kickoffDir)}`);
  execSync(`bash ${script}`, {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      REPO_ROOT,
      SPEC_FOLDER: state.specFolderPath,
      KICKOFF_DIR: state.kickoffDir,
      APP_ROOT: path.resolve(REPO_ROOT, state.app),
      SLUG: state.slug,
    },
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

  // Offset attempt numbering by prior attempts so log files and attempt
  // records have globally unique sequence numbers across jump-routed
  // re-executions of the same node.
  const attemptOffset = out.attempts.length;

  // If a prior node failed and routed here, build a short failure
  // context string that lists the relevant log paths. The agent can
  // then file_read those logs itself — no domain-specific parsing.
  const failedSource = (state as any)._failureSource as string | undefined;
  delete (state as any)._failureSource;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const globalAttempt = attemptOffset + attempt;
    ensureRunDirs(state.dagentDir);
    const logPath = path.join(logsDir(state.dagentDir), `${node.id}.${globalAttempt}.log`);
    const startedAt = new Date().toISOString();
    console.log(`\n[run] ▶ ${node.id} (attempt ${globalAttempt}/${attemptOffset + maxAttempts}) — log: ${logPath}`);

    // Build failure context: on first attempt use the failed source node,
    // on retries use our own node (so the agent sees its own prior logs).
    const failureContext = failedSource
      ? buildFailureContext(state, failedSource as NodeId)
      : attempt > 1
        ? buildFailureContext(state, node.id)
        : undefined;

    const res = node.kind === "agent"
      ? await runAgentNode(node, state, globalAttempt, REPO_ROOT, logPath, failureContext)
      : await runScriptNode(node, state, globalAttempt, REPO_ROOT, logPath);

    const attemptRecord: NodeAttempt = {
      attempt: globalAttempt,
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

    console.log(`[run] ✗ ${node.id} attempt ${globalAttempt} failed: ${res.errorMessage}`);

    // Fault-domain routing: when an agent reports a fault_domain that
    // matches an onFailureRoutes entry, skip remaining in-place retries
    // (they're provably futile — the node lacks write access to fix the
    // identified problem domain) and immediately throw to trigger the
    // domain-specific route in the main loop.
    const faultDomain = "faultDomain" in res ? (res as any).faultDomain as string | undefined : undefined;
    if (faultDomain && node.onFailureRoutes?.[faultDomain]) {
      out.status = "failed";
      out.result = res.result;
      saveState(state);
      snapshotNode(state, node.id);
      console.log(`[run] ⚡ ${node.id} reported fault_domain='${faultDomain}' — skipping remaining retries, routing via onFailureRoutes`);
      throw Object.assign(
        new Error(`Node ${node.id} failed with fault_domain '${faultDomain}' (attempt ${globalAttempt}).`),
        { nodeId: node.id, faultDomain },
      );
    }
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

async function runMainLoop(
  state: RunState,
  ensureDevServerHealthy: () => Promise<void>,
): Promise<void> {
  let i = 0;
  while (i < MAIN_NODES.length) {
    const node = MAIN_NODES[i];

    // Health-check the dev server before every node execution.
    await ensureDevServerHealthy();

    if (state.outputs[node.id]?.status === "completed") {
      console.log(`[run] ⤳ ${node.id} already completed — skipping`);
      // The skip path always advances linearly. Honoring `onSuccess` here
      // would route backward through already-completed nodes (e.g.
      // e.g. recovery → prior-node) and loop forever — backward jumps
      // are only valid on a *live* successful execution, which is
      // handled below where we reset intermediate statuses.
      i = i + 1;
      continue;
    }

    // Recovery-only nodes are skipped on linear
    // advance. They only execute when reached via failure routing, which
    // sets _failureSource. Peek — don't consume — executeNode handles that.
    if (node.recoveryOnly && !(state as any)._failureSource) {
      console.log(`[run] ⤳ ${node.id} is recovery-only and no failure routed here — skipping`);
      i = i + 1;
      continue;
    }

    try {
      await executeNode(node, state);

      // Materialize baseline output to kickoff dir so downstream nodes
      // (e2e-author, e2e-debug) can inline it under a dedicated heading
      // rather than relying on the generic prior-outputs JSON blob.
      if (node.id === "baseline" && state.outputs["baseline"]?.result) {
        const baselinePath = path.join(state.kickoffDir, "baseline.json");
        fs.writeFileSync(baselinePath, JSON.stringify(state.outputs["baseline"].result, null, 2));
        console.log(`[run] materialized baseline.json → ${path.relative(REPO_ROOT, baselinePath)}`);
      }

      if (node.onSuccess) {
        const target = findIndex(MAIN_NODES, node.onSuccess);
        if (target < i && state.jumps < MAX_JUMPS) {
          // Backward success jump (e.g. recovery → validation). Re-validate
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
      const e = err as Error & { nodeId?: NodeId; faultDomain?: string };

      // Resolve the routing target: fault-domain routes take priority
      // over the static onFailure fallback.
      const domainTarget = e.faultDomain && node.onFailureRoutes?.[e.faultDomain];
      const routeTarget = domainTarget ?? node.onFailure;

      if (routeTarget && state.jumps < MAX_JUMPS) {
        state.jumps++;
        const target = findIndex(MAIN_NODES, routeTarget);
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

        // Stash the failed node's id so executeNode can build a
        // failure context pointing at its logs.
        (state as any)._failureSource = node.id;

        saveState(state);
        const routeKind = domainTarget ? `fault_domain='${e.faultDomain}'` : "onFailure";
        console.log(`[run] ↻ jumping ${node.id} → ${routeTarget} (${routeKind}, jump ${state.jumps}/${MAX_JUMPS})`);
        i = target;
        continue;
      }
      const reason = routeTarget
        ? `Failure routing cap reached (${MAX_JUMPS} jumps) at node '${node.id}': ${e.message}`
        : `Node '${node.id}' failed and has no onFailure route: ${e.message}`;
      throw Object.assign(new Error(reason), { nodeId: node.id });
    }
  }
}

// ---------------------------------------------------------------------------
// Finalizer — always runs.
// ---------------------------------------------------------------------------

export async function runFinalizer(state: RunState): Promise<void> {
  console.log(`\n[run] ▶ finalizer: ${FINALIZER.id} (terminalError=${state.terminalError ? "yes" : "no"})`);
  try {
    await executeNode(FINALIZER, state);
  } catch (err) {
    // Finalizer failures must not crash the run. Persist a recovery
    // body so the operator can finish the PR by hand.
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[run] FINALIZER FAILED: ${msg}`);
    const recoveryPath = path.join(state.dagentDir, "pr-body.md");
    fs.mkdirSync(path.dirname(recoveryPath), { recursive: true });
    fs.writeFileSync(recoveryPath, renderRecoveryBody(state));
    console.error(`[run] Wrote recovery PR body to ${recoveryPath}`);
  }
}

export function renderRecoveryBody(state: RunState): string {
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

/**
 * Final commit + push of any .dagent/ artifacts left uncommitted after
 * the pr-creation agent's session ended (e.g. state.json, snapshots
 * written by executeNode after the agent already committed and pushed).
 * Best-effort — failures here are logged but do not crash the run.
 */
export function finalCommitAndPush(state: RunState): void {
  try {
    // Save final state snapshot so the on-disk state.json reflects the
    // completed pr-creation node (executeNode already called saveState,
    // but the finalizer catch-path may have written a recovery body).
    saveState(state);

    const commitScript = path.join(REPO_ROOT, "demo", "scripts", "agent-commit.sh");
    execSync(
      `bash ${commitScript} pipeline "chore(pipeline): final state snapshot"`,
      {
        cwd: REPO_ROOT,
        env: { ...process.env, APP_ROOT: path.resolve(REPO_ROOT, state.app) },
        stdio: "pipe",
      },
    );

    execSync(`git push -u origin ${state.featureBranch} --force-with-lease`, {
      cwd: REPO_ROOT,
      stdio: "pipe",
    });
    console.log(`[run] ✓ final commit+push completed`);
  } catch (err) {
    // Non-fatal: the PR is already open; these are just trailing artifacts.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[run] WARN: final commit+push failed (non-fatal): ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Dev-server lifecycle — start before baseline, tear down in finally.
// ---------------------------------------------------------------------------

const DEV_SERVER_POLL_INTERVAL_MS = 2_000;
const DEV_SERVER_POLL_TIMEOUT_MS = 60_000;

/** Resolve the configured storefront port (env > default 3000). */
function resolvePort(): number {
  const envPort = process.env.STOREFRONT_PORT;
  if (envPort) {
    const n = Number(envPort);
    if (Number.isFinite(n) && n > 0 && n < 65536) return n;
  }
  return 3000;
}

/** Kill any process LISTENING on the target port so the baseline starts clean. */
function killPortOccupant(port: number): void {
  try {
    // -sTCP:LISTEN restricts to listeners only — avoids killing VS Code's
    // port-forwarding or other clients connected to the port.
    const pids = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: "utf-8" }).trim();
    if (pids) {
      console.log(`[run] killing listener(s) on port ${port}: ${pids.replace(/\n/g, ", ")}`);
      execSync(`lsof -ti tcp:${port} -sTCP:LISTEN | xargs kill -9`, { stdio: "ignore" });
    }
  } catch {
    // lsof exits non-zero when no process found — that's fine.
  }
}

/** TCP-level readiness probe: resolves true when the port accepts a connection. */
function tcpProbe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ host: "127.0.0.1", port }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => {
      sock.destroy();
      resolve(false);
    });
    sock.setTimeout(1_000, () => {
      sock.destroy();
      resolve(false);
    });
  });
}

/**
 * Start the PWA Kit dev server in the background and wait for it to
 * accept TCP connections. Returns the child process handle for cleanup.
 */
async function startDevServer(
  appRoot: string,
  port: number,
): Promise<ChildProcess> {
  killPortOccupant(port);

  console.log(`[run] starting dev server on port ${port} (cwd: ${appRoot})`);
  const child = nodeSpawn("npm", ["start"], {
    cwd: appRoot,
    env: { ...process.env, PORT: String(port), STOREFRONT_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  // Unref so the child does not keep the parent event loop alive and
  // does not get killed when the parent exits (detached + unref).
  child.unref();

  // Pipe server output to the console for visibility, but unref the
  // streams so they don't block parent exit.
  child.stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(`[dev-server] ${chunk}`);
  });
  (child.stdout as any)?.unref?.();
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[dev-server] ${chunk}`);
  });
  (child.stderr as any)?.unref?.();

  // Poll until the port is reachable.
  const deadline = Date.now() + DEV_SERVER_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await tcpProbe(port)) {
      console.log(`[run] dev server ready on port ${port}`);
      return child;
    }
    await new Promise((r) => setTimeout(r, DEV_SERVER_POLL_INTERVAL_MS));
  }

  // Timed out — kill the child and throw.
  child.kill("SIGKILL");
  throw new Error(
    `Dev server failed to accept connections on port ${port} within ${DEV_SERVER_POLL_TIMEOUT_MS / 1000}s.`,
  );
}

/** Gracefully shut down the dev server child process. */
async function stopDevServer(child: ChildProcess, port: number): Promise<void> {
  if (child.exitCode !== null) {
    // Process handle is dead but the detached tree may still be alive.
    killPortOccupant(port);
    return;
  }
  console.log("[run] stopping dev server…");
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      // Belt-and-suspenders: also kill by port in case the child
      // spawned sub-processes that didn't get the signal.
      killPortOccupant(port);
      resolve();
    }, 5_000);
    child.on("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Verify the dev server is still alive; if not, restart it.
 * Also cleans up orphaned browser processes from prior MCP sessions
 * to prevent memory pressure from causing container instability.
 * Called before every node in the main loop.
 */
async function ensureDevServer(
  current: ChildProcess,
  appRoot: string,
  port: number,
): Promise<ChildProcess> {
  // Kill any orphaned Chromium/Playwright/roam MCP processes left by
  // prior agent sessions. session.disconnect() should handle this,
  // but if the session crashed, browsers may linger and accumulate
  // memory, eventually triggering the OOM killer which can take
  // down VS Code's remote server and cause a window reload.
  try {
    execSync(
      `pkill -f '@playwright/mcp' 2>/dev/null; pkill -f 'chromium' 2>/dev/null; pkill -f 'roam mcp' 2>/dev/null`,
      { stdio: "ignore" },
    );
  } catch {
    // pkill exits non-zero when no process matches — that's fine.
  }

  // Proactive memory check — if available memory is low, log a warning.
  try {
    const memInfo = fs.readFileSync("/proc/meminfo", "utf-8");
    const availableKb = parseInt(memInfo.match(/MemAvailable:\s+(\d+)/)?.[1] ?? "0", 10);
    if (availableKb > 0 && availableKb < 512_000) {
      console.warn(`[run] WARN: low memory (${Math.round(availableKb / 1024)}MB available) — aggressive cleanup`);
      execSync(
        `pkill -f 'chromium' 2>/dev/null; pkill -f '@playwright/mcp' 2>/dev/null; pkill -f 'roam mcp' 2>/dev/null`,
        { stdio: "ignore" },
      );
    }
  } catch { /* /proc/meminfo not available or pkill no-match — non-fatal */ }

  if (await tcpProbe(port)) return current;
  console.warn(`[run] WARN: dev server on port ${port} is not responding — restarting`);
  try { current.kill("SIGKILL"); } catch { /* already dead */ }
  return startDevServer(appRoot, port);
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseCli(process.argv.slice(2));
  const state = initState(args);
  ensureRunDirs(state.dagentDir);
  saveState(state);

  // Signal handlers — catch SIGTERM/SIGINT for graceful shutdown.
  // SIGKILL (OOM killer) cannot be caught — the wrapper script handles that.
  let shuttingDown = false;
  const signalHandler = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`\n[run] received ${signal} — running finalizer before exit`);
    state.terminalError = `Process terminated by ${signal}`;
    saveState(state);
    try {
      await runFinalizer(state);
      finalCommitAndPush(state);
    } catch (err) {
      console.error(`[run] finalizer failed during ${signal} handler:`, err);
    }
    process.exit(1);
  };
  process.on('SIGTERM', () => signalHandler('SIGTERM'));
  process.on('SIGINT', () => signalHandler('SIGINT'));

  if (!args.resume) {
    stageSpec(state);
  } else {
    // Re-stage on resume too — cheap, idempotent, and protects against
    // edits to the spec-kit folder between runs.
    stageSpec(state);
  }

  // Start the dev server before the main loop so the baseline node
  // (and all subsequent nodes using Playwright) have a live storefront.
  const port = resolvePort();
  const appRoot = path.resolve(REPO_ROOT, state.app);
  let devServer = await startDevServer(appRoot, port);
  state.devServerPort = port;
  saveState(state);

  let exitCode = 0;
  try {
    // Ensure roam index is fresh before any agent node reads it.
    // Exclude pipeline infrastructure — agents must only see app code.
    try {
      const roamBin = path.join(process.env.HOME ?? "/home/node", ".roam-venv", "bin", "roam");
      for (const pat of ["demo/**", "tools/**"]) {
        execSync(`${roamBin} config --exclude "${pat}"`, { cwd: REPO_ROOT, timeout: 5_000, stdio: "ignore" });
      }
      console.log("[run] roam: rebuilding index…");
      execSync(`${roamBin} index -q`, { cwd: REPO_ROOT, timeout: 30_000, stdio: "ignore" });
      console.log("[run] roam: index ready");
    } catch {
      console.warn("[run] roam: index rebuild failed (non-fatal)");
    }

    await runMainLoop(state, async () => {
      devServer = await ensureDevServer(devServer, appRoot, port);
    });
    console.log(`\n[run] ✓ main loop completed successfully`);
  } catch (err) {
    state.terminalError = err instanceof Error ? err.message : String(err);
    saveState(state);
    console.error(`\n[run] ✗ main loop terminated: ${state.terminalError}`);
    exitCode = 1;
  } finally {
    await runFinalizer(state);

    // The finalizer agent commits and pushes, but executeNode writes
    // state.json + snapshots *after* the agent session ends. Do a final
    // commit+push so no .dagent/ artifacts are left uncommitted.
    finalCommitAndPush(state);

    await stopDevServer(devServer, port);
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[run] fatal:", err);
  process.exit(2);
});
