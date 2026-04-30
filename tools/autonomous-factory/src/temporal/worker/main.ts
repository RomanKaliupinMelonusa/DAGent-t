/**
 * src/temporal/worker/main.ts — Worker process bootstrap.
 *
 * Spins up a Temporal Worker that polls the configured task queue and
 * executes registered workflow + activity bundles.
 *
 * Environment:
 *   TEMPORAL_ADDRESS    — Temporal frontend gRPC address (default localhost:7233)
 *   TEMPORAL_TASK_QUEUE — Task queue (default dagent-hello)
 *   TEMPORAL_NAMESPACE  — Namespace (default default)
 *
 * Activity dependency injection
 * -----------------------------
 * The triage and copilot-agent activities use module-scoped DI for
 * heavyweight ports (LLM clients, baseline loader, Copilot SDK client,
 * session runner). Production wiring is deferred to a follow-up
 * commit — until then the worker boots WITHOUT injecting these,
 * which means:
 *   - `localExecActivity` and `githubCiPollActivity` work end-to-end
 *     (no DI needed).
 *   - `triageActivity` works in contract-only / fallback mode (LLM
 *     path skipped — handler degrades gracefully).
 *   - `copilotAgentActivity` returns the deterministic BUG message
 *     ("ctx.client is undefined") — the activity registers and runs,
 *     but the handler short-circuits before reaching the SDK. This
 *     is intentional: production deployment must explicitly inject
 *     the Copilot client and runner via `setCopilotAgentDependencies`
 *     before the worker accepts copilot-agent tasks.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as activities from "../activities/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "dagent-hello";
const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";

async function main(): Promise<void> {
  const connection = await NativeConnection.connect({ address });

  const worker = await Worker.create({
    connection,
    namespace,
    taskQueue,
    // Workflows are bundled by the SDK's webpack pipeline at worker
    // start. Path resolves at runtime against the *compiled* layout
    // (dist/temporal/workflow/index.js); tsx-based execution is not
    // supported because tsx's global resolver hooks corrupt webpack's
    // resolution of node_modules. Always run from `npm run temporal:build`
    // output.
    workflowsPath: resolve(__dirname, "../workflow/index.js"),
    activities,
  });

  console.log(
    `[worker] connected to ${address} ns=${namespace} taskQueue=${taskQueue}`,
  );
  await worker.run();
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
