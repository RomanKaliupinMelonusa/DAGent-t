#!/usr/bin/env node
/**
 * src/client/admin.ts — Admin CLI as Temporal client.
 *
 * Replaces the legacy in-process [pipeline-state.ts](../../cli/pipeline-state.ts)
 * verbs that operate on a *running* pipeline. State-machine verbs that
 * required direct kernel access (`init`, `reset-scripts`, `recover-*`)
 * are NOT included — those map to admin signals deferred to Session 5
 * (see `session-5-cutover-and-harden.md` per D-S4-4).
 *
 * Verb surface:
 *   Signals (1):
 *     cancel    <slug> [--workflow <name>] [--reason <s>] — terminal halt
 *   Queries (4):
 *     status    <slug> [--workflow <name>]   — full StateSnapshot (JSON)
 *     progress  <slug> [--workflow <name>]   — counts + percent
 *     next      <slug> [--workflow <name>]   — ready batch
 *     summary   <slug> [--workflow <name>]   — terminal summary
 *   Updates (3):
 *     reset-scripts <slug> --category <c> [--max-cycles N]
 *     resume-after-elevated <slug> [--max-cycles N]
 *     recover-elevated <slug> --error <msg> [--max-fail-count N] [--max-dev-cycles N]
 *   Teardown (1):
 *     nuke      <slug> [--app <path>] [--delete-branch] [--confirm]
 *
 * Workflow ID convention: matches `run-feature.ts` —
 *   `dagent-<workflowName>-<slug>`. Default `--workflow=storefront`.
 *
 * Environment:
 *   TEMPORAL_ADDRESS    (default localhost:7233)
 *   TEMPORAL_NAMESPACE  (default default)
 *
 * Output: queries pretty-print to stdout as JSON (jq-pipeable). Signals
 * print a one-line confirmation. Errors exit 1; no stack traces unless
 * `DEBUG=1`.
 */

import { Client, Connection, WorkflowNotFoundError } from "@temporalio/client";
import path from "node:path";
import { parseAdminArgs } from "./admin-parse.js";
import {
  cancelPipelineSignal,
} from "../workflow/signals.js";
import {
  stateQuery,
  progressQuery,
  nextBatchQuery,
  summaryQuery,
} from "../workflow/queries.js";
import {
  resetScriptsUpdate,
  resumeAfterElevatedUpdate,
  recoverElevatedUpdate,
} from "../workflow/updates.js";
import { executeNuke, defaultNukeDeps } from "./nuke.js";

const VERB_HELP = `\
Usage: agent:admin:temporal <verb> <slug> [options]

Verbs:
  Signals:
    cancel    <slug> [--reason <s>]                 — terminal halt with reason

  Updates (admin mutate-and-return):
    reset-scripts <slug> --category <c> [--max-cycles N]
                                                    — reset script nodes for re-push (default max 10)
    resume-after-elevated <slug> [--max-cycles N]
                                                    — resume after elevated apply (default max 5)
    recover-elevated <slug> --error <msg> [--max-fail-count N] [--max-dev-cycles N]
                                                    — recover after elevated apply failure (defaults 10/5)

  Teardown:
    nuke      <slug> [--app <path>] [--delete-branch] [--confirm]
                                                    — terminate workflow, remove .dagent/<slug>/,
                                                      optionally delete feature/<slug> (local + remote).
                                                      Requires --confirm to execute; without it,
                                                      prints plan and exits 1.

  Queries:
    status    <slug>                                — full StateSnapshot (JSON)
    progress  <slug>                                — count summary + percent
    next      <slug>                                — ready-to-dispatch batch
    summary   <slug>                                — terminal summary snapshot

Common options:
  --workflow <name>      Workflow name (default: storefront)
  --reason <text>        Human reason (cancel only)
  --category <c>         Script-node category (reset-scripts only)
  --error <msg>          Elevated-apply error message (recover-elevated only)
  --max-cycles N         Cycle budget override (reset-scripts, resume-after-elevated)
  --max-fail-count N     Fail-count budget override (recover-elevated)
  --max-dev-cycles N     Dev-cycle budget override (recover-elevated)

Environment:
  TEMPORAL_ADDRESS    Temporal frontend gRPC address (default localhost:7233)
  TEMPORAL_NAMESPACE  Namespace (default default)

Exit codes:
  0  success
  1  invocation error or workflow not found
  2  update succeeded but reducer reports halted=true (cycle budget exhausted)
`;

function workflowId(slug: string, workflowName: string): string {
  return `dagent-${workflowName}-${slug}`;
}

function fail(msg: string): never {
  console.error(`agent:admin:temporal: ${msg}`);
  process.exit(1);
}

interface ParsedArgs {
  readonly verb: string;
  readonly slug: string;
  readonly workflowName: string;
  readonly gate?: string;
  readonly reason?: string;
  readonly category?: string;
  readonly error?: string;
  readonly maxCycles?: number;
  readonly maxFailCount?: number;
  readonly maxDevCycles?: number;
  readonly app?: string;
  readonly deleteBranch?: boolean;
  readonly confirm?: boolean;
}

function parse(argv: readonly string[]): ParsedArgs {
  const result = parseAdminArgs(argv, fail);
  if (result === null) {
    console.log(VERB_HELP);
    process.exit(0);
  }
  return result;
}

async function withClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
  const connection = await Connection.connect({ address });
  try {
    const client = new Client({
      connection,
      namespace,
    });
    return await fn(client);
  } finally {
    await connection.close();
  }
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  const wfId = workflowId(args.slug, args.workflowName);

  await withClient(async (client) => {
    const handle = client.workflow.getHandle(wfId);

    try {
      switch (args.verb) {
        // ─── Signals ──────────────────────────────────────────────
        case "cancel": {
          const reason = args.reason ?? "operator-cancelled";
          await handle.signal(cancelPipelineSignal, reason);
          console.log(`✓ cancel sent to ${wfId} reason="${reason}"`);
          break;
        }
        // ─── Queries ──────────────────────────────────────────────
        case "status":
          printJson(await handle.query(stateQuery));
          break;
        case "progress":
          printJson(await handle.query(progressQuery));
          break;
        case "next":
          printJson(await handle.query(nextBatchQuery));
          break;
        case "summary":
          printJson(await handle.query(summaryQuery));
          break;        // ─── Updates (admin mutate-and-return) ─────────────────────
        // Each prints `{halted, cycleCount, ...}` JSON to stdout. Exit
        // code 2 when `halted=true` so operators can pipe into
        // shell-style error handling without parsing JSON.
        case "reset-scripts": {
          if (!args.category) fail("reset-scripts requires --category <c>");
          const result = await handle.executeUpdate(resetScriptsUpdate, {
            args: [
              {
                category: args.category as string,
                ...(args.maxCycles !== undefined ? { maxCycles: args.maxCycles } : {}),
              },
            ],
          });
          printJson(result);
          if (result.halted) process.exit(2);
          break;
        }
        case "resume-after-elevated": {
          const result = await handle.executeUpdate(resumeAfterElevatedUpdate, {
            args: [
              args.maxCycles !== undefined ? { maxCycles: args.maxCycles } : {},
            ],
          });
          printJson(result);
          if (result.halted) process.exit(2);
          break;
        }
        case "recover-elevated": {
          if (!args.error) fail("recover-elevated requires --error <msg>");
          const result = await handle.executeUpdate(recoverElevatedUpdate, {
            args: [
              {
                errorMessage: args.error as string,
                ...(args.maxFailCount !== undefined ? { maxFailCount: args.maxFailCount } : {}),
                ...(args.maxDevCycles !== undefined ? { maxDevCycles: args.maxDevCycles } : {}),
              },
            ],
          });
          printJson(result);
          if (result.halted) process.exit(2);
          break;
        }
        // ─── Nuke (P6 — destructive teardown) ─────────────────────
        // Single-shot tear-down: terminate Temporal workflow, remove
        // `.dagent/<slug>/`, optionally delete the feature branch
        // (local + remote). Requires `--confirm` to actually run;
        // without it, the plan is printed for review.
        case "nuke": {
          // dirname for the compiled file:
          //   <repo>/tools/autonomous-factory/dist/client/admin.js
          // 4 levels up == repo root.
          const reposRoot = path.resolve(import.meta.dirname, "../../../..");
          const result = await executeNuke(
            {
              slug: args.slug,
              workflowName: args.workflowName,
              ...(args.app ? { app: args.app } : {}),
              ...(args.deleteBranch ? { deleteBranch: true } : {}),
              ...(args.confirm ? { confirm: true } : {}),
              reposRoot,
            },
            {
              ...defaultNukeDeps(),
              async terminateWorkflow(workflowId: string, reason: string) {
                const h = client.workflow.getHandle(workflowId);
                try {
                  await h.terminate(reason);
                } catch (err) {
                  if (err instanceof WorkflowNotFoundError) return;
                  throw err;
                }
              },
            },
          );
          if (!args.confirm) {
            // Plan-only mode — exit non-zero so callers don't mistake
            // the dry-run for a successful destructive op.
            process.exit(1);
          }
          // When confirm was set, success-emit the JSON result for
          // jq-pipeable scripting.
          printJson({
            terminated: result.terminated,
            removedDir: result.removedDir,
            deletedBranch: result.deletedBranch,
            workflowId: result.plan.workflowId,
            dagentDir: result.plan.dagentDir,
          });
          break;
        }
        default:
          fail(`unknown verb '${args.verb}'. Run with --help for usage.`);
      }
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        fail(
          `workflow '${wfId}' not running. Start it with \`npm run agent:run:temporal\` first.`,
        );
      }
      throw err;
    }
  });
}

main().catch((err) => {
  if (process.env.DEBUG) console.error(err);
  console.error(
    `agent:admin:temporal: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
