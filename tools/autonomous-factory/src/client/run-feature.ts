#!/usr/bin/env node
/**
 * src/client/run-feature.ts — Temporal-mode pipeline entry.
 *
 * Mirrors the legacy `entry/watchdog.ts` happy path but dispatches the
 * compiled DAG to a long-running Temporal worker instead of executing
 * the kernel in-process:
 *
 *   1. parseCli            — same shape as `agent:run`
 *   2. bootstrap           — preflight + APM compile + state seeding
 *   3. project APM nodes   — translate `ApmWorkflowNode` → `PipelineNodeSpec`
 *   4. signalWithStart     — start `pipelineWorkflow` (or attach to the
 *                            existing run via the deterministic workflowId)
 *   5. await result        — print final status; non-zero on halt/blocked
 *
 * The Copilot SDK is NEVER imported here — that lives entirely on the
 * worker side. This entry is a pure client: it speaks gRPC to Temporal
 * and disk-reads the compiled APM context.
 *
 * Usage:
 *   npm run agent:run:temporal -- --app apps/commerce-storefront \
 *       --workflow storefront --spec-file /path/to/spec.md <slug>
 *
 * Environment:
 *   TEMPORAL_ADDRESS    (default localhost:7233)
 *   TEMPORAL_TASK_QUEUE (default dagent-hello — match the worker)
 *   TEMPORAL_NAMESPACE  (default default)
 *
 * Idempotency: the workflowId is deterministic from `<slug>:<workflowName>`.
 * Re-running the entry while a previous execution is still active attaches
 * to the existing handle; reruns after a terminal state will fail at the
 * server (`WorkflowExecutionAlreadyStartedError`) — operators must clear
 * state via the admin CLI before restarting.
 */

import path from "node:path";
import { Client, Connection } from "@temporalio/client";
import { bootstrapOtel } from "../telemetry/otel.js";
import type { pipelineWorkflow, PipelineInput, PipelineNodeSpec, PipelineResult } from "../workflow/index.js";
import { parseCli } from "../entry/cli.js";
import { bootstrap } from "../entry/bootstrap.js";
import type { ApmWorkflowNode } from "../apm/types.js";

const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
const taskQueue = process.env.TEMPORAL_TASK_QUEUE ?? "dagent-hello";
const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";

/**
 * Project the compiled APM workflow into the workflow input shape. The
 * worker's `pipelineWorkflow` only consults the structural / dispatch
 * fields — `agent`, `type`, `script_type`, `handler`, `depends_on`,
 * `triage`, `on_failure`. We forward exactly those (plus a few flags
 * the workflow body inspects). Heavy fields like instruction strings
 * stay in the on-disk `context.json` and are loaded by the activity
 * via `apmContextPath`.
 */
function projectNodes(
  nodes: Readonly<Record<string, ApmWorkflowNode>>,
): Readonly<Record<string, PipelineNodeSpec>> {
  const out: Record<string, PipelineNodeSpec> = {};
  for (const [key, n] of Object.entries(nodes)) {
    const spec: PipelineNodeSpec = {
      ...(typeof n.agent === "string" ? { agent: n.agent } : {}),
      ...(typeof n.type === "string" ? { type: n.type } : {}),
      ...(typeof n.category === "string" ? { category: n.category } : {}),
      ...(typeof n.handler === "string" ? { handler: n.handler } : {}),
      ...(typeof n.script_type === "string" ? { script_type: n.script_type } : {}),
      depends_on: Array.isArray(n.depends_on) ? [...n.depends_on] : [],
      ...(typeof n.activation === "string" ? { activation: n.activation } : {}),
      ...(typeof n.salvage_survivor === "boolean" ? { salvage_survivor: n.salvage_survivor } : {}),
      ...(typeof n.salvage_immune === "boolean" ? { salvage_immune: n.salvage_immune } : {}),
      ...(Array.isArray(n.triggers) ? { triggers: [...n.triggers] } : {}),
      ...(Array.isArray(n.consumes_artifacts)
        ? { consumes_artifacts: n.consumes_artifacts.map((a) => ({ ...a })) }
        : {}),
      // Failure-routing fields consumed by `resolveTriageDispatch` in
      // the workflow-scope cascade. Preserve the on_failure shape
      // verbatim (string OR { triage, routes }).
      ...(n.on_failure !== undefined ? { on_failure: n.on_failure } : {}),
      ...(typeof n.triage === "string" ? { triage: n.triage } : {}),
      ...(typeof n.triage_profile === "string" ? { triage_profile: n.triage_profile } : {}),
    };
    out[key] = spec;
  }
  return out;
}

function deterministicWorkflowId(slug: string, workflowName: string): string {
  // One active execution per (slug, workflow). Avoids accidental dupes.
  return `dagent-${workflowName}-${slug}`;
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(import.meta.dirname, "../../../../..");
  const cli = parseCli(process.argv.slice(2), repoRoot);
  const { config } = await bootstrap(cli);

  const { slug, appRoot, baseBranch, workflowName, specFile, apmContext } = config;
  const apmContextPath = path.join(appRoot, ".apm", ".compiled", "context.json");
  const wf = apmContext.workflows[workflowName];
  if (!wf) {
    const available = Object.keys(apmContext.workflows).join(", ") || "<none>";
    throw new Error(
      `Workflow '${workflowName}' not found in compiled APM context. Available: ${available}`,
    );
  }
  const nodes = projectNodes(wf.nodes as unknown as Readonly<Record<string, ApmWorkflowNode>>);

  const input: PipelineInput = {
    slug,
    workflowName,
    appRoot,
    repoRoot: config.repoRoot,
    baseBranch,
    specFile,
    apmContextPath,
    environment: { ...(apmContext.config?.environment ?? {}) },
    nodes,
    ...(typeof wf.default_triage === "string" ? { default_triage: wf.default_triage } : {}),
    ...(wf.default_routes ? { default_routes: { ...wf.default_routes } } : {}),
    startedMs: Date.now(),
  };

  const otel = bootstrapOtel("dagent-client");
  const connection = await Connection.connect({ address });
  const tClient = new Client({
    connection,
    namespace,
    ...(otel.plugin ? { plugins: [otel.plugin] } : {}),
  });

  const workflowId = deterministicWorkflowId(slug, workflowName);
  console.log(
    `[agent:run:temporal] starting pipelineWorkflow workflowId=${workflowId} taskQueue=${taskQueue}`,
  );

  const handle = await tClient.workflow.start<typeof pipelineWorkflow>(
    "pipelineWorkflow",
    {
      args: [input],
      taskQueue,
      workflowId,
      // Idempotency: surface the conflict to the operator rather than
      // silently spawning a parallel run.
      workflowIdReusePolicy: "ALLOW_DUPLICATE_FAILED_ONLY",
    },
  );

  console.log(`[agent:run:temporal] handle.workflowId=${handle.workflowId}`);
  const result: PipelineResult = await handle.result();
  console.log(
    `[agent:run:temporal] result: status=${result.status} reason=${result.reason} batches=${result.batchNumber}`,
  );

  await connection.close();
  await otel.shutdown();

  if (result.status === "halted" || result.status === "blocked" || result.status === "approval-rejected") {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[agent:run:temporal] fatal:", err);
  process.exit(1);
});
