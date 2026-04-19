/**
 * preflight.ts — Pre-flight checks run once at pipeline startup.
 *
 * Each check logs warnings (non-fatal) or throws (fatal). The orchestrator
 * calls these sequentially before entering the main loop.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { ApmCompiledOutput } from "../apm/types.js";
import type { PipelineState } from "../types.js";
import { StateError } from "../errors.js";
import { executeHook, buildHookEnv } from "./hooks.js";

/**
 * Warn about unexpected untracked files in the repo root.
 * Agents sometimes generate temp scripts via malformed shell commands.
 */
export function checkJunkFiles(repoRoot: string): void {
  try {
    const untracked = execSync("git ls-files --others --exclude-standard", {
      cwd: repoRoot, encoding: "utf-8", timeout: 10_000,
    }).trim();
    if (untracked) {
      const junkFiles = untracked.split("\n").filter((f) => !f.includes("/"));
      if (junkFiles.length > 0) {
        console.warn(`\n  ⚠ WARNING: Found unexpected untracked files in repo root:`);
        junkFiles.forEach((f) => console.warn(`      - ${f}`));
        console.warn(`    These may be artifacts from malformed CLI commands. Please delete them.\n`);
      }
    }
  } catch { /* non-fatal */ }
}

/**
 * Scan in-progress/ for non-standard files (temp scripts, etc.).
 */
export function checkInProgressArtifacts(repoRoot: string, appRoot: string): void {
  try {
    const inProgressFiles = execSync(`ls ${path.relative(repoRoot, path.join(appRoot, "in-progress/"))} 2>/dev/null || true`, {
      cwd: repoRoot, encoding: "utf-8", timeout: 5_000,
    }).trim();
    if (inProgressFiles) {
      const allowedPatterns = /(_SPEC\.md|_STATE\.json|_TRANS\.md|_SUMMARY\.md|_SUMMARY-DATA\.json|_TERMINAL-LOG\.md|_CHANGES\.json|_PLAYWRIGHT-LOG\.md|_EVENTS\.jsonl|_BLOBS\.jsonl|_NOVEL_TRIAGE\.jsonl|_FLIGHT_DATA\.json|_CI-FAILURE\.log|\.blocked-draft$|^README\.md$|^screenshots$)/;
      const junkInProgress = inProgressFiles.split("\n").filter(
        (f) => f && !allowedPatterns.test(f),
      );
      if (junkInProgress.length > 0) {
        console.warn(`\n  ⚠ WARNING: Non-standard files in in-progress/:`);
        junkInProgress.forEach((f) => console.warn(`      - ${f}`));
        console.warn(`    These may be temp scripts from agent workarounds. Consider deleting them.\n`);
      }
    }
  } catch { /* non-fatal */ }
}

/**
 * Validate that the GitHub CLI (`gh`) is logged in.
 * Non-fatal — logs ✔ or ✖ and returns the result.
 */
export function checkGitHubLogin(): boolean {
  try {
    execSync("gh auth status", {
      encoding: "utf-8",
      timeout: 15_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    console.log("  ✔ GitHub CLI authenticated");
    return true;
  } catch {
    console.log("  ✖ GitHub CLI not authenticated — run 'gh auth login' to authenticate");
    return false;
  }
}

/**
 * Run the pre-flight auth check hook to verify cloud CLI authentication.
 * Warns early so the user can fix it before the pipeline reaches post-deploy.
 *
 * Delegates to the `hooks.preflightAuth` command from apm.yml config.
 * If no hook is configured, the check is silently skipped.
 */
export function checkPreflightAuth(repoRoot: string, appRoot: string, apmContext: ApmCompiledOutput): void {
  const hookCmd = apmContext.config?.hooks?.preflightAuth;
  if (!hookCmd) {
    console.log("  ⊘ No preflight auth hook configured — skipping\n");
    return;
  }

  const env = buildHookEnv(apmContext.config, {
    APP_ROOT: appRoot,
    REPO_ROOT: repoRoot,
  });

  const result = executeHook(hookCmd, env, appRoot, 10_000);
  if (result && result.exitCode === 0) {
    console.log(`  ✔ Cloud CLI authenticated${result.stdout ? ` (${result.stdout})` : ""}\n`);
  } else {
    console.warn(
      "  ⚠ Cloud CLI not authenticated.\n" +
      "    Integration tests will be skipped or fail at the post-deploy step.\n" +
      `    ${result?.stdout ? `Detail: ${result.stdout}\n` : ""}`,
    );
  }
}

/**
 * Run the pre-flight baseline validation hook (A2).
 *
 * Runs once at bootstrap to capture which app routes were already failing
 * on the BASE branch BEFORE this feature branch's changes. The downstream
 * `validateApp` hook reads the captured map via the `BASELINE_VALIDATION`
 * env var and skips routes that were already broken, so pre-existing
 * environment failures don't block feature PRs.
 *
 * The hook must print a single JSON object to stdout mapping route
 * identifiers to `"pass"` or `"fail"`. Any other output is treated as
 * "no baseline captured" (non-fatal — the orchestrator continues).
 *
 * Results are persisted to `<appRoot>/in-progress/<slug>_FLIGHT_DATA.json`
 * under the `baselineValidation` key, merging with any existing flight data.
 */
export function runPreflightBaseline(
  slug: string,
  baseBranch: string | undefined,
  repoRoot: string,
  appRoot: string,
  apmContext: ApmCompiledOutput,
): Record<string, "pass" | "fail"> | null {
  const hookCmd = apmContext.config?.hooks?.preflightBaseline;
  if (!hookCmd) return null;
  if (!baseBranch) {
    console.log("  ⊘ No BASE_BRANCH set — skipping baseline validation\n");
    return null;
  }

  const env = buildHookEnv(apmContext.config, {
    APP_ROOT: appRoot,
    REPO_ROOT: repoRoot,
    BASE_BRANCH: baseBranch,
    PREFLIGHT_BASELINE: "1",
  });

  const result = executeHook(hookCmd, env, appRoot, 60_000);
  if (!result || result.exitCode !== 0) {
    console.warn(
      `  ⚠ Baseline validation hook failed (exit ${result?.exitCode ?? "n/a"}) — ` +
      `continuing without a baseline map.\n` +
      `    ${result?.stdout ? `Detail: ${result.stdout}\n` : ""}`,
    );
    return null;
  }

  let parsed: Record<string, "pass" | "fail"> | null = null;
  try {
    const maybe = JSON.parse(result.stdout);
    if (maybe && typeof maybe === "object" && !Array.isArray(maybe)) {
      const entries = Object.entries(maybe).filter(
        ([, v]) => v === "pass" || v === "fail",
      ) as Array<[string, "pass" | "fail"]>;
      if (entries.length > 0) {
        parsed = Object.fromEntries(entries);
      }
    }
  } catch { /* not valid JSON — fall through */ }

  if (!parsed) {
    console.log("  ⊘ Baseline hook produced no usable JSON map — skipping\n");
    return null;
  }

  // Persist to _FLIGHT_DATA.json — merge with any existing content.
  const flightPath = path.join(appRoot, "in-progress", `${slug}_FLIGHT_DATA.json`);
  try {
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(flightPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(flightPath, "utf-8")) as Record<string, unknown>;
      } catch { existing = {}; }
    }
    existing["baselineValidation"] = parsed;
    fs.mkdirSync(path.dirname(flightPath), { recursive: true });
    fs.writeFileSync(flightPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
  } catch (err) {
    console.warn(`  ⚠ Could not persist baseline map: ${err instanceof Error ? err.message : err}`);
  }

  const failures = Object.entries(parsed).filter(([, v]) => v === "fail").map(([k]) => k);
  if (failures.length > 0) {
    console.log(
      `  ⚠ Baseline: ${failures.length} pre-existing route failure(s) — ` +
      `will be ignored by validateApp: ${failures.join(", ")}\n`,
    );
  } else {
    console.log(`  ✔ Baseline clean (${Object.keys(parsed).length} routes)\n`);
  }
  return parsed;
}

/**
 * Check if roam-code is available, and if so, build the semantic graph index.
 * Returns whether roam is available (for use in later re-indexing calls).
 */
export function buildRoamIndex(repoRoot: string): boolean {
  const roamAvailable = (() => {
    try {
      execSync("roam --version", { cwd: repoRoot, timeout: 5_000, stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  })();

  if (roamAvailable) {
    console.log("  🧠 Phase 0: Building semantic graph with roam index...");
    try {
      execSync("roam index", {
        cwd: repoRoot,
        stdio: "inherit",
        timeout: 120_000,
      });
      console.log("  ✔ Semantic graph ready (.roam/index.db)\n");
    } catch (err) {
      console.error(`  ✖ roam index failed: ${err instanceof Error ? err.message : err}`);
      console.warn("  ⚠ Continuing without semantic graph — agents will use standard tools\n");
    }
  } else {
    console.warn(
      "  ⚠ roam-code not available — agents will use standard tools.\n" +
      "    Run 'bash tools/autonomous-factory/setup-roam.sh' to install roam-code.\n",
    );
  }

  return roamAvailable;
}

/**
 * Validate that the pipeline state file's nodes match the compiled context's
 * workflow nodes. Detects state-context drift caused by APM config changes
 * (e.g. removing/renaming agents or DAG nodes) without re-initializing state.
 *
 * Auto-heal behaviour (safe drift): if no item has reached `done`, the state
 * is regenerated from the current compiled context via `onAutoHeal`. This
 * handles the common case where the user edits `.apm/apm.yml` between runs
 * before any agent has made commits.
 *
 * FATAL drift: if any item is already `done`, drift is considered unsafe
 * (existing work would be silently discarded). Throws StateError asking the
 * user to re-run `pipeline:init` manually.
 */
export async function checkStateContextDrift(
  slug: string,
  apmContext: ApmCompiledOutput,
  readStateFn: (slug: string) => Promise<PipelineState>,
  onAutoHeal?: (slug: string, workflowName: string) => Promise<void>,
): Promise<void> {
  let state: PipelineState;
  try {
    state = await readStateFn(slug);
  } catch {
    // No state file — first run, will be initialized later or by the user.
    return;
  }

  const workflowName = state.workflowName;
  const contextNodes = new Set(
    Object.keys(apmContext.workflows?.[workflowName]?.nodes ?? {}),
  );
  const stateNodes = new Set(state.items.map((i) => i.key));

  const inStateOnly = [...stateNodes].filter((k) => !contextNodes.has(k));
  const inContextOnly = [...contextNodes].filter((k) => !stateNodes.has(k));

  if (inStateOnly.length === 0 && inContextOnly.length === 0) return;

  // Auto-heal: safe when no item has reached "done" (nothing to discard).
  const hasProgress = state.items.some((i) => i.status === "done");
  if (!hasProgress && onAutoHeal) {
    console.log(`\n  🔄 State-context drift detected for "${slug}" — auto-regenerating state (no items done yet):`);
    if (inStateOnly.length > 0) {
      console.log(`      removed from config: ${inStateOnly.join(", ")}`);
    }
    if (inContextOnly.length > 0) {
      console.log(`      added to config:    ${inContextOnly.join(", ")}`);
    }
    await onAutoHeal(slug, workflowName);
    console.log(`  ✔ State regenerated from current APM context\n`);
    return;
  }

  const lines: string[] = [
    `State-context drift detected for "${slug}":`,
  ];
  if (inStateOnly.length > 0) {
    lines.push(`  Nodes in _STATE.json but NOT in compiled context: ${inStateOnly.join(", ")}`);
  }
  if (inContextOnly.length > 0) {
    lines.push(`  Nodes in compiled context but NOT in _STATE.json: ${inContextOnly.join(", ")}`);
  }
  lines.push(
    `  The APM config (apm.yml / workflows.yml) was modified after pipeline:init,`,
    `  and at least one item has already reached "done" — auto-heal refuses to discard progress.`,
    `  Fix: re-run pipeline:init to regenerate state from the current config:`,
    `    APP_ROOT=<app-path> npm run pipeline:init -- ${slug} <workflowName>`,
  );

  throw new StateError(lines.join("\n"));
}
