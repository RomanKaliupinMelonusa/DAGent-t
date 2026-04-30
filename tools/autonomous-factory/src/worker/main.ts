#!/usr/bin/env node
/**
 * src/worker/main.ts — Worker process bootstrap.
 *
 * Spins up a Temporal Worker that polls the configured task queue and
 * executes registered workflow + activity bundles.
 *
 * Environment:
 *   TEMPORAL_ADDRESS        — Temporal frontend gRPC address (default localhost:7233)
 *   TEMPORAL_TASK_QUEUE     — Task queue (default dagent-hello)
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
 * Activity dependency injection (Group D — Session 4)
 * ----------------------------------------------------
 * Module-scoped DI is the documented escape hatch for plumbing
 * heavyweight ports into Temporal activities — `Worker.create({ activities })`
 * takes already-bound function references with no per-call options
 * channel. Setters are called ONCE at boot, before `worker.run()`.
 *
 *   - `setTriageDependencies({ triageLlm, baselineLoader })`
 *       → unlocks the LLM classifier path in `triageActivity` and
 *         loads `_BASELINE.json` for the noise-filter pass.
 *   - `setCopilotAgentDependencies({ client, copilotSessionRunner, codeIndexer })`
 *       → unlocks the SDK path in `copilotAgentActivity`. Without it
 *         the activity returns the deterministic BUG message
 *         (intentional safety net — see the activity's docstring).
 *
 * Worker lifecycle owns the `CopilotClient` connection. We start it
 * once at boot and tear it down on SIGTERM/SIGINT — the SDK's stdio
 * channel survives the lifetime of the worker process.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve, isAbsolute } from "node:path";
import { NativeConnection, Worker } from "@temporalio/worker";
import type { CopilotClient } from "@github/copilot-sdk";
import * as activities from "../activities/index.js";
import { bootstrapOtel } from "../telemetry/otel.js";
import { setActivityLoggerFactory } from "../telemetry/logger-factory.js";
import { OtelPipelineLogger } from "../telemetry/otel-pipeline-logger.js";
import {
  setTriageDependencies,
  setCopilotAgentDependencies,
} from "../activities/index.js";
import { LocalFilesystem } from "../adapters/local-filesystem.js";
import { FileArtifactBus } from "../adapters/file-artifact-bus.js";
import { FileBaselineLoader } from "../adapters/file-baseline-loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "dagent-hello";
const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
const appRoot = process.env.APP_ROOT;
const llmDisabled =
  process.env.WORKER_DISABLE_LLM === "1" ||
  process.env.WORKER_DISABLE_LLM === "true";

/**
 * Wire production adapters into the activity DI slots. Returns the
 * started `CopilotClient` (when LLM mode is enabled) so the caller can
 * tear it down on shutdown.
 */
async function wireActivityDependencies(): Promise<CopilotClient | null> {
  if (llmDisabled) {
    console.log(
      "[worker] WORKER_DISABLE_LLM set — skipping CopilotClient + LLM-backed DI",
    );
    return null;
  }

  // Validate APP_ROOT *before* paying the CopilotClient startup cost
  // (which can take seconds and spawns a child process).
  if (!appRoot) {
    console.warn(
      "[worker] APP_ROOT not set — triageActivity will run in contract-only mode and copilotAgentActivity will return the deterministic BUG message. Set APP_ROOT to the app directory to enable production DI.",
    );
    return null;
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

  // Triage: LLM classifier + baseline noise loader. The artifact bus
  // is constructed without a logger (worker scope is process-wide; per-
  // feature loggers attach inside the activity via `buildNodeContext`).
  const filesystem = new LocalFilesystem();
  const artifactBus = new FileArtifactBus(appRoot, filesystem);
  const triageLlm = new CopilotTriageLlm(client);
  const baselineLoader = new FileBaselineLoader({ appRoot, bus: artifactBus });
  setTriageDependencies({ triageLlm, baselineLoader });

  // Copilot-agent: production runner. `codeIndexer` is optional and
  // requires a roam-code subprocess; defer to a dedicated env-gated
  // wiring (out of Group D scope — see Group J for indexer adoption).
  const copilotSessionRunner = new NodeCopilotSessionRunner();
  setCopilotAgentDependencies({ client, copilotSessionRunner });

  console.log(
    `[worker] DI wired: triageLlm + baselineLoader + copilotSessionRunner (appRoot=${appRoot})`,
  );
  return client;
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
  const client = await wireActivityDependencies();

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
