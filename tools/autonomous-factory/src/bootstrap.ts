/**
 * bootstrap.ts — Preflight orchestration and config assembly.
 *
 * Runs all startup checks (auth, junk files, APM compilation, env resolution,
 * roam index) and returns a fully-assembled `PipelineRunConfig`. All fatal
 * errors throw typed `FatalPipelineError` subtypes — no `process.exit()`.
 */

import path from "node:path";
import type { CliArgs } from "./cli.js";
import type { PipelineRunConfig } from "./kernel-types.js";
import type { ApmCompiledOutput } from "./apm/types.js";
import { ApmCompileError, ApmBudgetExceededError } from "./apm/types.js";
import { BootstrapError } from "./errors.js";
import { createFeatureBranch } from "./git-ops.js";
import { loadApmContext } from "./apm/context-loader.js";
import { runResolveEnvironment } from "./lifecycle/hooks.js";
// Bootstrap runs at the composition root level — it legitimately owns the
// entry-time read of persisted state. Importing the CLI module directly
// avoids a thin facade (previously `./state.js`) and keeps the dependency
// explicit.
import type { PipelineState } from "./types.js";
import * as pipelineState from "../pipeline-state.mjs";
// `readStateOrThrow` throws on missing file (catch-able); `readState`
// calls process.exit, which we don't want at the composition root.
const readStateOrThrow = pipelineState.readStateOrThrow as (slug: string) => PipelineState;
import {
  checkJunkFiles,
  checkInProgressArtifacts,
  checkPreflightAuth,
  checkGitHubLogin,
  checkStateContextDrift,
  buildRoamIndex,
} from "./lifecycle/preflight.js";
import { loadPreviousSummary, setModelPricing } from "./reporting.js";
import type { PreviousSummaryTotals } from "./reporting.js";
import { createPipelineLogger } from "./logger.js";

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
 * Phase order:
 *   1. Create feature branch
 *   2. CLI auth checks (GitHub, cloud)
 *   3. APM context compilation + validation
 *   4. Environment resolution from infrastructure outputs
 *   5. In-progress artifact scan
 *   6. State-context drift check
 *   7. Roam semantic graph build
 *   8. Logger instantiation
 *
 * @throws {BootstrapError} on any fatal preflight failure
 */
export async function bootstrap(cli: CliArgs): Promise<BootstrapResult> {
  const { slug, appRoot, repoRoot, baseBranch } = cli;

  // --- 1. Create feature branch ---
  console.log(`\n  🌿 Creating feature branch feature/${slug} from ${baseBranch}...`);
  createFeatureBranch(repoRoot, slug, baseBranch);
  console.log(`  ✔ Working on branch feature/${slug}\n`);

  // --- 2. CLI auth ---
  console.log("\n  🔐 CLI Authentication Status:");
  checkGitHubLogin();
  console.log("");

  checkJunkFiles(repoRoot);

  // --- 3. APM context ---
  let apmContext: ApmCompiledOutput;
  try {
    apmContext = loadApmContext(appRoot);
    console.log("  ✔ APM context loaded — all agent budgets within limits\n");

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

  // --- 6. State-context drift (throws StateError on mismatch) ---
  await checkStateContextDrift(slug, apmContext, async (s) => readStateOrThrow(s));

  // --- 7. Cloud CLI auth ---
  checkPreflightAuth(repoRoot, appRoot, apmContext);

  // --- 8. Roam index ---
  const roamAvailable = buildRoamIndex(repoRoot);

  // --- 9. Logger ---
  const logger = createPipelineLogger(appRoot, slug);

  // --- 10. Read workflow name from persisted state ---
  let initialState: PipelineState;
  try {
    initialState = readStateOrThrow(slug);
  } catch {
    throw new BootstrapError(
      `Pipeline state not found for slug "${slug}". Run \`npm run pipeline:init ${slug} <workflow>\` first.`,
    );
  }
  const workflowName = initialState.workflowName;

  // --- Boot-time telemetry ---
  const baseTelemetry = loadPreviousSummary(appRoot, slug);
  if (baseTelemetry) {
    console.log(
      `  📊 Prior session detected: ${baseTelemetry.steps} steps, ` +
      `${baseTelemetry.tokens.toLocaleString()} tokens, $${baseTelemetry.costUsd.toFixed(4)} cost — will merge into totals.`,
    );
  }

  // Propagate appRoot so pipeline-state.mjs resolves in-progress/ correctly
  process.env.APP_ROOT = appRoot;
  // Allow deploy-manager's poll-ci.sh to poll for up to ~30 min
  process.env.POLL_MAX_RETRIES = "60";

  return {
    config: {
      slug,
      workflowName,
      appRoot,
      repoRoot,
      baseBranch,
      apmContext,
      roamAvailable,
      logger,
    },
    baseTelemetry,
  };
}
