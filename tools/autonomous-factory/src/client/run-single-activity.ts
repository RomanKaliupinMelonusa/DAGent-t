/**
 * src/client/run-single-activity.ts — Phase 6 of Session 3.
 *
 * Ad-hoc dispatcher for a single node activity. Useful for:
 *   - Debugging an activity end-to-end against a live cluster without
 *     standing up the full pipeline.
 *   - Smoke-testing worker / activity bundle changes in CI.
 *   - Triggering one-off recovery operations (e.g. re-run a single
 *     `local-exec` script after a worker crash).
 *
 * Inputs:
 *   --handler  local-exec | github-ci-poll | triage | copilot-agent
 *   --slug     feature slug (e.g. add-cart-banner)
 *   --item     item key (e.g. push, publish, dev-frontend)
 *   --app      absolute path to app root (contains `.dagent/`, `.apm/`)
 *   --repo     absolute path to repo root (defaults to --app's parent's parent)
 *   --base     base branch (default: main)
 *   --spec     absolute path to the feature spec markdown
 *   --apm      absolute path to compiled apm context.json (default: <app>/.apm/context.json)
 *   --workflow workflow name from apm (default: derived from .dagent/<slug>/_STATE.json when present)
 *
 * Optional:
 *   --exec-id  override executionId (default: timestamp-based)
 *   --task-queue / TEMPORAL_TASK_QUEUE
 *   --address  / TEMPORAL_ADDRESS
 *   --namespace/ TEMPORAL_NAMESPACE
 *
 * The CLI does NOT load the full pipeline state — `pipelineState` is
 * synthesised from a minimal items list inferred from the apm context.
 * For activities that need real upstream artifacts (triage,
 * copilot-agent), point `--app` at a workspace where prior pipeline
 * runs have already produced the artifacts on disk.
 */

import { Client, Connection } from "@temporalio/client";
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
// Type-only import — clients must NEVER value-import workflow code.
import type {
  singleActivityWorkflow,
  SingleActivityInput,
  SingleActivityHandlerKind,
} from "../workflow/single-activity.workflow.js";
import type { NodeActivityInput } from "../activities/types.js";
import type { PipelineState } from "../types.js";
import type { ApmCompiledOutput } from "../apm/index.js";
import { newInvocationId } from "../activities/support/invocation-id.js";

const VALID_HANDLERS: ReadonlySet<SingleActivityHandlerKind> = new Set([
  "local-exec",
  "github-ci-poll",
  "triage",
  "copilot-agent",
]);

interface CliArgs {
  handler: SingleActivityHandlerKind;
  slug: string;
  item: string;
  app: string;
  repo: string;
  base: string;
  spec: string;
  apm: string;
  workflow: string | undefined;
  execId: string;
  taskQueue: string;
  address: string;
  namespace: string;
}

function parseArgs(argv: ReadonlyArray<string>): CliArgs {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    flags.set(key, next);
    i += 1;
  }

  const need = (k: string): string => {
    const v = flags.get(k);
    if (!v) throw new Error(`Missing required flag --${k}`);
    return v;
  };

  const handler = need("handler") as SingleActivityHandlerKind;
  if (!VALID_HANDLERS.has(handler)) {
    throw new Error(
      `Invalid --handler: ${handler}. Must be one of: ${[...VALID_HANDLERS].join(", ")}`,
    );
  }

  const app = path.resolve(need("app"));
  // Default repo to app's grandparent (matches `apps/<name>/` convention).
  const repo = path.resolve(flags.get("repo") ?? path.resolve(app, "..", ".."));
  const apm = path.resolve(flags.get("apm") ?? path.join(app, ".apm", "context.json"));

  return {
    handler,
    slug: need("slug"),
    item: need("item"),
    app,
    repo,
    base: flags.get("base") ?? "main",
    spec: path.resolve(need("spec")),
    apm,
    workflow: flags.get("workflow"),
    execId: flags.get("exec-id") ?? newInvocationId(),
    taskQueue: flags.get("task-queue") ?? process.env.TEMPORAL_TASK_QUEUE ?? "dagent-pipeline",
    address: flags.get("address") ?? process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    namespace: flags.get("namespace") ?? process.env.TEMPORAL_NAMESPACE ?? "default",
  };
}

async function loadApmContext(p: string): Promise<ApmCompiledOutput> {
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw) as ApmCompiledOutput;
}

/**
 * Reconstruct a minimal `PipelineState` from the compiled apm context.
 * Real pipeline runs persist a richer `_STATE.json`; for ad-hoc
 * dispatch we synthesise just enough so the activity's `NodeContext`
 * (frozen state-reader) returns sensible answers when triage walks
 * the items array.
 */
function synthesisePipelineState(
  apm: ApmCompiledOutput,
  workflowName: string,
  slug: string,
  itemKey: string,
): PipelineState {
  const wfNodes = apm.workflows?.[workflowName]?.nodes ?? {};
  const items = Object.keys(wfNodes).map(
    (key) => ({
      key,
      label: key,
      agent: (wfNodes[key] as { agent?: string | null }).agent ?? null,
      status: key === itemKey ? "pending" : "done",
    }) as PipelineState["items"][number],
  );
  const dependencies: Record<string, string[]> = {};
  const nodeTypes: Record<string, string> = {};
  const nodeCategories: Record<string, string> = {};
  for (const [k, n] of Object.entries(wfNodes)) {
    const node = n as {
      depends_on?: string[];
      type?: string;
      category?: string;
    };
    dependencies[k] = node.depends_on ?? [];
    nodeTypes[k] = node.type ?? "agent";
    nodeCategories[k] = node.category ?? "dev";
  }
  return {
    feature: slug,
    workflowName,
    started: new Date().toISOString(),
    deployedUrl: null,
    implementationNotes: null,
    items,
    errorLog: [],
    dependencies,
    nodeTypes,
    nodeCategories,
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
  };
}

async function resolveWorkflowName(
  apm: ApmCompiledOutput,
  override: string | undefined,
  app: string,
  slug: string,
): Promise<string> {
  if (override) return override;

  // Prefer the persisted state when available.
  const statePath = path.join(app, ".dagent", slug, "_STATE.json");
  if (existsSync(statePath)) {
    try {
      const raw = await fs.readFile(statePath, "utf8");
      const persisted = JSON.parse(raw) as { workflowName?: string };
      if (persisted.workflowName) return persisted.workflowName;
    } catch {
      // fall through to apm-only resolution
    }
  }

  const names = Object.keys(apm.workflows ?? {});
  if (names.length === 1) return names[0]!;
  throw new Error(
    `Cannot infer workflow name — apm has ${names.length} workflows: ${names.join(
      ", ",
    )}. Pass --workflow.`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apm = await loadApmContext(args.apm);
  const workflowName = await resolveWorkflowName(apm, args.workflow, args.app, args.slug);

  // Per-execution outputs directory must exist before the activity
  // runs — `FileArtifactBus` validates the invocation path on first
  // write, and the activity's `buildNodeContext` creates the logs/
  // dir but not outputs/.
  const outputsDir = path.join(
    args.app,
    ".dagent",
    args.slug,
    args.item,
    args.execId,
    "outputs",
  );
  await fs.mkdir(outputsDir, { recursive: true });

  const pipelineState = synthesisePipelineState(apm, workflowName, args.slug, args.item);

  const activityInput: NodeActivityInput = {
    itemKey: args.item,
    executionId: args.execId,
    slug: args.slug,
    appRoot: args.app,
    repoRoot: args.repo,
    baseBranch: args.base,
    specFile: args.spec,
    attempt: 1,
    effectiveAttempts: 1,
    environment: {},
    apmContextPath: args.apm,
    workflowName,
    pipelineState,
    pipelineSummaries: [],
    preStepRefs: {},
    handlerData: {},
  };

  const workflowInput: SingleActivityInput = {
    handlerKind: args.handler,
    input: activityInput,
  };

  const connection = await Connection.connect({ address: args.address });
  const client = new Client({ connection, namespace: args.namespace });

  // workflowId encodes handler+slug+item+execId so concurrent dispatches
  // for the same item can't collide. Random suffix is unnecessary —
  // executionId is already an invocation-scoped UUID.
  const workflowId = `single-${args.handler}-${args.slug}-${args.item}-${args.execId}`;

  console.log(
    `[dispatch] starting handler=${args.handler} slug=${args.slug} item=${args.item} execId=${args.execId}`,
  );
  const handle = await client.workflow.start<typeof singleActivityWorkflow>(
    "singleActivityWorkflow",
    {
      args: [workflowInput],
      taskQueue: args.taskQueue,
      workflowId,
    },
  );

  console.log(`[dispatch] workflowId=${handle.workflowId}`);
  const result = await handle.result();
  console.log(`[dispatch] result: ${JSON.stringify(result)}`);

  await connection.close();

  // Exit code mirrors the activity's outcome so shell wrappers / CI
  // workflows can pipe it directly.
  if (result.outcome === "failed" || result.outcome === "error") {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[dispatch] fatal:", err);
  process.exit(2);
});
