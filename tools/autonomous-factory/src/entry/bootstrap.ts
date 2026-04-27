/**
 * bootstrap.ts — Preflight orchestration and config assembly.
 *
 * Runs all startup checks (auth, junk files, APM compilation, env resolution,
 * roam index) and returns a fully-assembled `PipelineRunConfig`. All fatal
 * errors throw typed `FatalPipelineError` subtypes — no `process.exit()`.
 */

import path from "node:path";
import type { CliArgs } from "./cli.js";
import type { PipelineRunConfig } from "../app-types.js";
import type { ApmCompiledOutput } from "../apm/types.js";
import { ApmCompileError, ApmBudgetExceededError } from "../apm/types.js";
import { BootstrapError } from "../errors.js";
import { loadApmContext } from "../apm/context-loader.js";
import { loadAppPlugins } from "../apm/plugin-loader.js";
import { registerMiddlewares } from "../handlers/middlewares/registry.js";
import { runResolveEnvironment } from "../lifecycle/hooks.js";
// Bootstrap runs at the composition root level — it legitimately owns the
// entry-time read of persisted state. Importing the file-state I/O helpers
// directly keeps the dependency explicit without threading the StateStore
// port through preflight checks.
import type { PipelineState } from "../types.js";
import { readStateOrThrow, readStateOrNull } from "../adapters/file-state/io.js";
import {
  checkJunkFiles,
  checkInProgressArtifacts,
  checkPort3000Free,
  checkPreflightAuth,
  checkGitHubLogin,
  checkStateContextDrift,
  checkToolLimitsHygiene,
  buildRoamIndex,
  runPreflightBaseline,
} from "../lifecycle/preflight.js";
import { checkPinnedDependencies, computeApiDrift } from "../lifecycle/dependency-pinning.js";
import { loadPreviousSummary, setModelPricing } from "../reporting/index.js";
import type { PreviousSummaryTotals } from "../reporting/index.js";
import { createPipelineLogger } from "../telemetry/index.js";

// ---------------------------------------------------------------------------
// Bootstrap result (extends PipelineRunConfig with boot-time extras)
// ---------------------------------------------------------------------------

export interface BootstrapResult {
  /** Immutable pipeline run config. */
  config: PipelineRunConfig;
  /** Telemetry from a prior session (parsed once, merged into totals). */
  baseTelemetry: PreviousSummaryTotals | null;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

/**
 * Run all preflight checks and assemble the pipeline run config.
 *
 * Pipeline-specific side-effects (feature-branch creation, spec staging,
 * `_STATE.json` seeding) have been extracted out of bootstrap:
 *   - Branch creation & spec staging are now DAG nodes (`create-branch`,
 *     `stage-spec`) declared in each app's `.apm/workflows.yml`.
 *   - Fresh `_STATE.json` seeding is performed by [watchdog.ts](./watchdog.ts)
 *     immediately before kernel start, using `--workflow` from the CLI.
 *
 * Phase order:
 *   1. CLI auth checks (GitHub, cloud)
 *   2. APM context compilation + validation
 *   3. Environment resolution from infrastructure outputs
 *   4. In-progress artifact scan
 *   5. State-context drift check (auto-heals fresh state)
 *   6. Roam semantic graph build
 *   7. Logger instantiation
 *
 * @throws {BootstrapError} on any fatal preflight failure
 */
export async function bootstrap(cli: CliArgs): Promise<BootstrapResult> {
  const { slug, appRoot, repoRoot, baseBranch, workflowName, specFile } = cli;

  // Propagate appRoot to env IMMEDIATELY so every downstream module
  // (file-state I/O, hooks, plugin loader, agent subprocesses) resolves
  // `.dagent/` and `.apm/` against the chosen app — not the repo root.
  // This must run before any preflight or state-touching code: the
  // file-state adapter reads `process.env.APP_ROOT` lazily on each call,
  // and child processes inherit env at spawn time.
  process.env.APP_ROOT = appRoot;
  // Allow deploy-manager's poll-ci.sh to poll for up to ~30 min.
  process.env.POLL_MAX_RETRIES = "60";

  // --- 1. CLI auth ---
  console.log("\n  🔐 CLI Authentication Status:");
  checkGitHubLogin();
  console.log("");

  checkJunkFiles(repoRoot);

  // --- 2. Port 3000 free (fatal) ---
  // A stranded webpack worker from a prior storefront-dev crash will
  // OOM-kill the devcontainer if a second `npm start` is layered on top.
  // Run before APM compile so the abort happens in well under 2 seconds.
  checkPort3000Free();

  // --- 3. APM context ---
  let apmContext: ApmCompiledOutput;
  try {
    apmContext = loadApmContext(appRoot);
    console.log("  ✔ APM context loaded — all agent budgets within limits\n");

    checkToolLimitsHygiene(apmContext);

    if (apmContext.config?.model_pricing) {
      setModelPricing(apmContext.config.model_pricing);
    }
  } catch (err) {
    if (err instanceof ApmBudgetExceededError) {
      throw new BootstrapError(
        `${err.message}\n→ Refactor instruction files in .apm/instructions/ to reduce size.`,
      );
    }
    if (err instanceof ApmCompileError) {
      throw new BootstrapError(`APM compilation failed: ${err.message}`);
    }
    throw err;
  }

  // --- 3b. App-local plugin auto-discovery ---
  try {
    const plugins = await loadAppPlugins(appRoot, repoRoot);
    if (plugins.middlewares.length > 0) {
      registerMiddlewares(plugins.middlewares);
      console.log(
        `  ✔ Registered ${plugins.middlewares.length} app-local middleware(s): ` +
          plugins.middlewares.map((m) => m.name).join(", ") +
          "\n",
      );
    }
  } catch (err) {
    throw new BootstrapError(
      `App-local plugin load failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // --- 4. Environment resolution ---
  try {
    const resolved = runResolveEnvironment(apmContext.config, appRoot, repoRoot);
    if (resolved > 0) {
      console.log(`  ✔ Resolved ${resolved} environment variable(s) from infrastructure outputs\n`);
    }
  } catch (err) {
    throw new BootstrapError(
      `${err instanceof Error ? err.message : String(err)}\n→ Check .apm/hooks/resolve-env.sh and verify Terraform state is accessible.`,
    );
  }

  // --- 5. Artifact scan ---
  checkInProgressArtifacts(repoRoot, appRoot);

  // --- 5b. Pinned dependency check (fatal on out-of-range drift) ---
  // Runs after env resolution so any hook-authored lockfile is already in
  // place, and before state-context drift so an out-of-range package fails
  // the run with a single, unambiguous BootstrapError — not a cascade of
  // downstream agent confusion.
  const pinReport = checkPinnedDependencies(appRoot, apmContext.config);
  if (pinReport && pinReport.checked.length > 0) {
    const summary = pinReport.checked
      .map((p) => `${p.pkg}@${p.installed} ✓ ${p.range}`)
      .join(", ");
    console.log(`  ✔ Pinned dependencies within declared ranges: ${summary}\n`);
  }

  // --- 5c. API-surface drift (advisory) ---
  // Non-fatal: a drift inside the pinned range is something agents should
  // know about but not refuse to ship over. The report is stashed on the
  // run config so per-agent prompt rendering can inject it.
  const pwaKitDriftReport = computeApiDrift(appRoot, apmContext.config) ?? undefined;
  if (pwaKitDriftReport) {
    console.log(
      "  ⚠ Pinned package API-surface drift detected against vendored snapshot — ",
    );
    console.log("    will inject advisory into storefront-dev / storefront-debug / e2e-author prompts.\n");
  }

  // --- 6. State-context drift (auto-heals when no items are done; fatal otherwise) ---
  const { JsonFileStateStore } = await import("../adapters/json-file-state-store.js");
  const bootstrapStore = new JsonFileStateStore();
  await checkStateContextDrift(
    slug,
    apmContext,
    async (s) => readStateOrThrow(s),
    async (s, workflowName) => {
      await bootstrapStore.initState(s, workflowName);
    },
  );

  // --- 7. Cloud CLI auth ---
  checkPreflightAuth(repoRoot, appRoot, apmContext);

  // --- 7b. Pre-flight baseline validation (A2) ---
  // Captures pre-existing route failures on BASE so validateApp can ignore
  // them later. Non-fatal when the hook is absent or produces no map.
  runPreflightBaseline(slug, baseBranch, repoRoot, appRoot, apmContext);

  // --- 8. Roam index ---
  const roamAvailable = buildRoamIndex(repoRoot);

  // --- 9. Logger ---
  const logger = createPipelineLogger(appRoot, slug);

  // --- 10. Seed state if absent; validate workflow matches on resume ---
  // State seeding is the one genesis step the kernel cannot run without —
  // it cannot dispatch a DAG it hasn't yet materialized. We fold it into
  // the single `agent:run` entry point (no separate `pipeline:init`
  // required on the happy path) by seeding here when no state file exists.
  const existingState: PipelineState | null = readStateOrNull(slug);
  if (!existingState) {
    console.log(`\n  🌱 Seeding fresh pipeline state for "${slug}" (workflow: ${workflowName})...`);
    await bootstrapStore.initState(slug, workflowName);
    readStateOrThrow(slug); // post-condition: state file exists
    console.log(`  ✔ Pipeline state initialized\n`);
  } else if (existingState.workflowName !== workflowName) {
    throw new BootstrapError(
      `Workflow mismatch for "${slug}": persisted state uses "${existingState.workflowName}", ` +
      `but --workflow was "${workflowName}". ` +
      `Either pass --workflow ${existingState.workflowName} to resume, or re-init with ` +
      `\`npm run pipeline:init ${slug} ${workflowName}\` to start a new pipeline.`,
    );
  }

  // --- Boot-time telemetry ---
  const baseTelemetry = loadPreviousSummary(appRoot, slug);
  if (baseTelemetry) {
    console.log(
      `  📊 Prior session detected: ${baseTelemetry.steps} steps, ` +
      `${baseTelemetry.tokens.toLocaleString()} tokens, $${baseTelemetry.costUsd.toFixed(4)} cost — will merge into totals.`,
    );
  }

  // Propagation of `appRoot` and `POLL_MAX_RETRIES` to `process.env` was
  // performed at the top of `bootstrap()` so every preflight step and
  // every dynamically-imported adapter sees the chosen app from the
  // first call onwards.

  return {
    config: {
      slug,
      workflowName,
      appRoot,
      repoRoot,
      baseBranch,
      specFile,
      apmContext,
      roamAvailable,
      logger,
      ...(pwaKitDriftReport ? { pwaKitDriftReport } : {}),
    },
    baseTelemetry,
  };
}
