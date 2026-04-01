/**
 * preflight.ts — Pre-flight checks run once at pipeline startup.
 *
 * Each check logs warnings (non-fatal) or throws (fatal). The orchestrator
 * calls these sequentially before entering the main loop.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { ApmCompiledOutput } from "./apm-types.js";
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
 * Warn if any backend app.http() route lacks a matching APIM OpenAPI operation.
 * This catches the #1 cause of post-deploy live-ui 404 failures.
 * Skipped entirely when manifest has no preflight.apimRouteCheck config.
 */
export function checkApimRoutes(
  repoRoot: string,
  appRoot: string,
  apmContext: ApmCompiledOutput,
): void {
  if (!apmContext.config?.preflight?.apimRouteCheck) return;

  const { functionGlob, specGlob } = apmContext.config.preflight.apimRouteCheck;
  try {
    const fnFiles = execSync(
      `grep -rl 'app.http(' ${path.relative(repoRoot, path.join(appRoot, functionGlob))} 2>/dev/null || true`,
      { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
    ).trim();
    const specFiles = execSync(
      `cat ${path.relative(repoRoot, path.join(appRoot, specGlob))} 2>/dev/null || true`,
      { cwd: repoRoot, encoding: "utf-8", timeout: 10_000 },
    );
    if (fnFiles) {
      const routeRegex = /route:\s*["']([^"']+)["']/g;
      const registeredRoutes: string[] = [];
      for (const fnFile of fnFiles.split("\n").filter(Boolean)) {
        const fnContent = fs.readFileSync(path.join(repoRoot, fnFile), "utf-8");
        let match: RegExpExecArray | null;
        while ((match = routeRegex.exec(fnContent)) !== null) {
          registeredRoutes.push(match[1]);
        }
      }
      const missingRoutes = registeredRoutes.filter(
        (route) => !specFiles.includes(`/${route}`),
      );
      if (missingRoutes.length > 0) {
        console.warn(`\n  ⚠ WARNING: Backend routes missing APIM OpenAPI operations:`);
        missingRoutes.forEach((r) => console.warn(`      - /${r}`));
        console.warn(`    These will cause 404s in the live deployment. Add them to the API spec.\n`);
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
      const allowedPatterns = /(_SPEC\.md|_STATE\.json|_TRANS\.md|_SUMMARY\.md|_TERMINAL-LOG\.md|_CHANGES\.json|_PLAYWRIGHT-LOG\.md|_CI-FAILURE\.log|\.blocked-draft$|^README\.md$|^screenshots$|^infra-interfaces\.md$)/;
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
      "    Integration tests will be skipped or fail at the post-deploy phase.\n" +
      `    ${result?.stdout ? `Detail: ${result.stdout}\n` : ""}`,
    );
  }
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
