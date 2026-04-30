/**
 * src/client/run-hello.ts — One-shot client for hello workflow.
 *
 * Connects to the Temporal frontend, starts a `helloWorkflow` execution,
 * awaits the result, prints it, and exits.
 *
 * Assumes a worker is already running on the same task queue. See
 * `src/worker/main.ts`.
 */

import { Client, Connection } from "@temporalio/client";
// Type-only import — the client must NEVER value-import workflow code.
// Workflow modules transitively pull in @temporalio/workflow runtime
// APIs (proxyActivities, condition, sleep, …) that are only valid
// inside the worker sandbox. Real workflows in Session 4 will set
// signal/query handlers at module scope and will throw if loaded in a
// plain Node process. We pass the workflow name as a string and type
// the call site via `typeof helloWorkflow`.
import type { helloWorkflow } from "../workflow/hello.workflow.js";

const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "dagent-hello";
const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
const name = process.argv[2] ?? "world";

async function main(): Promise<void> {
  const connection = await Connection.connect({ address });
  const client = new Client({ connection, namespace });

  const handle = await client.workflow.start<typeof helloWorkflow>(
    "helloWorkflow",
    {
      args: [name],
      taskQueue,
      workflowId: `hello-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  );

  console.log(`[client] started workflowId=${handle.workflowId}`);
  const result = await handle.result();
  console.log(`[client] result: ${result}`);

  await connection.close();
}

main().catch((err) => {
  console.error("[client] fatal:", err);
  process.exit(1);
});
