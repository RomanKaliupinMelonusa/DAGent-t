#!/usr/bin/env node
/**
 * src/worker/main.ts — Worker process bootstrap.
 *
 * Spins up a Temporal Worker that polls the configured task queue and
 * executes registered workflow + activity bundles.
 *
 * Environment:
 *   TEMPORAL_ADDRESS        — Temporal frontend gRPC address (default localhost:7233)
 *   TEMPORAL_TASK_QUEUE     — Task queue (default dagent-pipeline)
 *   TEMPORAL_NAMESPACE      — Namespace (default default)
 *   APP_ROOT                — Absolute path to the app root that this worker
 *                             services (e.g. /workspaces/DAGent-t/apps/commerce-storefront).
 *                             Required for triage / baseline / copilot-agent
 *                             activities to operate in production mode; if
 *                             absent the worker still boots but those
 *                             activities run in degraded contract-only mode.
 *   WORKER_DISABLE_LLM      — Set to "1"/"true" to skip CopilotClient startup
 *                             (useful for CI activity-smoke tests against
 *                             local-exec / github-ci-poll only).
 *
 * Activity dependency injection (per-worker `ActivityDeps` registry)
 * ------------------------------------------------------------------
 * The worker constructs ONE `ActivityDeps` registry at boot, then
 * calls `createActivities(deps)` to bind every activity as a closure
 * over the registry. The bound namespace is passed to
 * `Worker.create({ activities })`. Tests follow the same pattern with
 * a test-built `ActivityDeps`.
 *
 *   - `triageLlm` + `baselineLoader` unlock the LLM classifier path
 *     in `triageActivity` and load `_BASELINE.json` for the noise
 *     filter pass. Without them the activity runs in contract-only
 *     mode (deterministic).
 *   - `copilotClient` + `copilotSessionRunner` unlock the SDK path in
 *     `copilotAgentActivity`. Without them the activity returns the
 *     deterministic BUG message (intentional safety net).
 *
 * Worker lifecycle owns the `CopilotClient` connection. We start it
 * once at boot and tear it down on SIGTERM/SIGINT — the SDK's stdio
 * channel survives the lifetime of the worker process.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve, isAbsolute } from "node:path";
import { NativeConnection, Worker } from "@temporalio/worker";
import type { CopilotClient } from "@github/copilot-sdk";
import { bootstrapOtel } from "../telemetry/otel.js";
import { setActivityLoggerFactory } from "../telemetry/logger-factory.js";
import { OtelPipelineLogger } from "../telemetry/otel-pipeline-logger.js";
import { createActivities, type ActivityDeps } from "../activities/index.js";
import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import { FileBaselineLoader } from "../adapters/file-baseline-loader.js";
import { FileInvocationFilesystem } from "../adapters/file-invocation-filesystem.js";
import { FileInvocationLogger } from "../adapters/file-invocation-logger.js";
import { FileTriageArtifactLoader } from "../adapters/file-triage-artifact-loader.js";
import { GitShellAdapter } from "../adapters/git-shell-adapter.js";
import { NodeShellAdapter } from "../adapters/node-shell-adapter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "dagent-pipeline";
const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
const appRoot = process.env.APP_ROOT;
const llmDisabled =
  process.env.WORKER_DISABLE_LLM === "1" ||
  process.env.WORKER_DISABLE_LLM === "true";

/**
 * Build the per-worker `ActivityDeps` registry. Always populates the
 * required infra ports (filesystem, shell, artifact bus, invocation
 * FS, triage artifact loader). Optionally populates the heavyweight
 * LLM-backed ports — guarded by `WORKER_DISABLE_LLM` and `APP_ROOT`
 * the same way the legacy setter wiring did. Returns the deps object
 * alongside the started `CopilotClient` so the caller can tear it
 * down on shutdown.
 */
async function buildActivityDeps(): Promise<{
  deps: ActivityDeps;
  client: CopilotClient | null;
}> {
  // Required infra ports — worker-singletons. Constructed unconditionally
  // because every activity (including the no-LLM ones) needs them.
  const resolvedAppRoot = appRoot ?? process.cwd();
  const filesystem = new LocalFilesystem();
  const shell = new NodeShellAdapter();
  const artifactBus = new FileArtifactBus(resolvedAppRoot, filesystem);
  const invocationFs = new FileInvocationFilesystem(resolvedAppRoot, filesystem, artifactBus);
  const triageArtifactLoader = new FileTriageArtifactLoader({ appRoot: resolvedAppRoot });

  // Per-invocation factory closures — supplied so callers under
  // `activities/support/**` can build per-invocation adapters without
  // importing the concrete adapter classes themselves (rule #3).
  const makeVcs: ActivityDeps["makeVcs"] = (repoRoot, logger) =>
    new GitShellAdapter(repoRoot, logger);
  const makeInvocationLogger: ActivityDeps["makeInvocationLogger"] = (logsDir) =>
    new FileInvocationLogger(logsDir);
  const makeStrictArtifactBus: ActivityDeps["makeStrictArtifactBus"] = (
    root,
    fs,
    logger,
  ) => new FileArtifactBus(root, fs, logger, { strict: true });

  const baseDeps = {
    filesystem,
    shell,
    artifactBus,
    invocationFs,
    triageArtifactLoader,
    makeVcs,
    makeInvocationLogger,
    makeStrictArtifactBus,
  };

  if (llmDisabled) {
    console.log(
      "[worker] WORKER_DISABLE_LLM set — skipping CopilotClient + LLM-backed DI",
    );
    return {
      client: null,
      deps: baseDeps,
    };
  }

  if (!appRoot) {
    console.warn(
      "[worker] APP_ROOT not set — triageActivity will run in contract-only mode and copilotAgentActivity will return the deterministic BUG message. Set APP_ROOT to the app directory to enable production DI.",
    );
    return {
      client: null,
      deps: baseDeps,
    };
  }
  if (!isAbsolute(appRoot)) {
    throw new Error(
      `APP_ROOT must be an absolute path; got '${appRoot}'.`,
    );
  }

  // Defer the Copilot SDK + Copilot-backed triage adapter imports to
  // runtime so the worker can boot in WORKER_DISABLE_LLM mode without
  // resolving the SDK's transitive `vscode-jsonrpc/node` graph (which
  // has known ESM resolution quirks under Node 22).
  const { CopilotClient } = await import("@github/copilot-sdk");
  const { CopilotTriageLlm } = await import("../adapters/copilot-triage-llm.js");
  const { NodeCopilotSessionRunner } = await import(
    "../adapters/copilot-session-runner.js"
  );

  const client = new CopilotClient();
  await client.start();

  const triageLlm = new CopilotTriageLlm(client);
  const baselineLoader = new FileBaselineLoader({ appRoot, bus: artifactBus });
  // `codeIndexer` is optional and requires a roam-code subprocess;
  // defer to a dedicated env-gated wiring (out of scope — see Group J
  // for indexer adoption).
  const copilotSessionRunner = new NodeCopilotSessionRunner();

  console.log(
    `[worker] DI wired: triageLlm + baselineLoader + copilotSessionRunner (appRoot=${appRoot})`,
  );
  return {
    client,
    deps: {
      ...baseDeps,
      triageLlm,
      baselineLoader,
      copilotClient: client,
      copilotSessionRunner,
    },
  };
}

async function stopClientQuiet(client: CopilotClient | null): Promise<void> {
  if (!client) return;
  try {
    await client.stop();
  } catch (err) {
    console.warn("[worker] CopilotClient.stop() failed:", err);
  }
}

async function main(): Promise<void> {
  const { deps, client } = await buildActivityDeps();
  const activities = createActivities(deps);

  // OpenTelemetry / Tempo bootstrap (Group F, decision D-S4-1).
  // No-op when OTLP_ENDPOINT is unset, so local dev keeps working.
  const otel = bootstrapOtel("dagent-worker");
  if (otel.plugin) {
    console.log(
      `[worker] otel enabled endpoint=${process.env.OTLP_ENDPOINT}`,
    );
    // Session 5 P5 — wire the OTel-emitting PipelineLogger so every
    // existing `ctx.logger.event(...)` call inside an activity becomes
    // a span event on the activity span the OpenTelemetryPlugin opens.
    // Factory returns a fresh logger per activity execution so the
    // per-itemKey attempt counter doesn't leak across executions.
    setActivityLoggerFactory(() => new OtelPipelineLogger("dagent-worker"));
  }

  const connection = await NativeConnection.connect({ address });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    // Workflows are bundled by the SDK's webpack pipeline at worker
    // start. Path resolves at runtime against the *compiled* layout
    // (dist/workflow/index.js); tsx-based execution is not
    // supported because tsx's global resolver hooks corrupt webpack's
    // resolution of node_modules. Always run from `npm run temporal:build`
    // output.
    workflowsPath: resolve(__dirname, "../workflow/index.js"),
    // js-sha256 (used by domain/error-signature.ts) contains a static
    // `require('crypto')` / `require('buffer')` inside its `nodeWrap`
    // helper. The helper is only invoked when `NODE_JS` is true, which
    // tests `typeof process === 'object'` — false inside Temporal's
    // workflow sandbox, so the requires never execute at runtime. But
    // webpack walks them statically and the SDK's determinism check
    // rejects them. Telling the bundler to ignore these built-ins is
    // the canonical escape hatch (see the SDK error message itself).
    bundlerOptions: { ignoreModules: ["crypto", "buffer"] },
    activities,
    ...(otel.plugin ? { plugins: [otel.plugin] } : {}),
  });

  console.log(
    `[worker] connected to ${address} ns=${namespace} taskQueue=${taskQueue}`,
  );

  // Cooperative shutdown — Temporal's `Worker.shutdown()` drains
  // in-flight activities; afterwards we tear down the SDK client and
  // flush OTel spans.
  const shutdown = async (sig: string): Promise<void> => {
    console.log(`[worker] received ${sig} — shutting down`);
    worker.shutdown();
    await stopClientQuiet(client);
    await otel.shutdown();
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  await worker.run();
  await stopClientQuiet(client);
  await otel.shutdown();
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
