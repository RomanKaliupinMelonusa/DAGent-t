/**
 * src/temporal/client/run-skeleton.ts — One-shot client for the
 * Session 2 skeleton pipeline workflow.
 *
 * Connects to the Temporal frontend, starts a `skeletonPipelineWorkflow`
 * execution with a tiny in-memory DAG fixture (A → B/C → D), awaits the
 * result, prints the dispatch order, and exits.
 *
 * Assumes a worker is already running on the same task queue. See
 * `src/temporal/worker/main.ts`.
 */

import { Client, Connection } from "@temporalio/client";
// Type-only import — clients must NEVER value-import workflow code.
import type { skeletonPipelineWorkflow, SkeletonPipelineInput } from "../workflow/skeleton-pipeline.workflow.js";

const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "dagent-hello";
const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";

const FIXTURE: SkeletonPipelineInput = {
  init: {
    feature: "skeleton-smoke",
    workflowName: "skeleton",
    started: "2026-04-29T00:00:00.000Z",
    nodes: {
      A: { agent: "dev", type: "agent", category: "dev", depends_on: [] },
      B: { agent: "dev", type: "agent", category: "dev", depends_on: ["A"] },
      C: { agent: "test", type: "agent", category: "test", depends_on: ["A"] },
      D: { agent: null, type: "script", category: "deploy", depends_on: ["B", "C"] },
    },
  },
};

async function main(): Promise<void> {
  const connection = await Connection.connect({ address });
  const client = new Client({ connection, namespace });

  const handle = await client.workflow.start<typeof skeletonPipelineWorkflow>(
    "skeletonPipelineWorkflow",
    {
      args: [FIXTURE],
      taskQueue,
      workflowId: `skeleton-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  );

  console.log(`[client] started workflowId=${handle.workflowId}`);
  const result = await handle.result();
  console.log(`[client] result: ${JSON.stringify(result)}`);

  await connection.close();
}

main().catch((err) => {
  console.error("[client] fatal:", err);
  process.exit(1);
});
