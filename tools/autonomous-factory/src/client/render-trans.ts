/**
 * src/client/render-trans.ts — `_TRANS.md` renderer CLI.
 *
 * Per locked decision **D-S4-2**, `_TRANS.md` is no longer a
 * write-along-the-way ledger but a *projection* rendered on demand
 * from the running workflow's `stateQuery`. This CLI is the projection
 * driver:
 *
 *   1. Connect to Temporal, attach to `dagent-<workflow>-<slug>`.
 *   2. Pull `stateQuery` and `summaryQuery` (the latter is best-effort
 *      — if the workflow predates a redeploy that registered the
 *      handler we fall back to state-only rendering).
 *   3. Hand both to [render-trans.ts](../reporting/render-trans.ts).
 *   4. Either write `<appRoot>/.dagent/<slug>/_TRANS.md` or stream to
 *      stdout (`--stdout`).
 *
 * Usage:
 *   npm run agent:trans:temporal -- --app apps/commerce-storefront <slug>
 *   npm run agent:trans:temporal -- --app apps/commerce-storefront <slug> --stdout
 *
 * Options:
 *   --app <relativePath>   App root (used to locate `.dagent/<slug>/`)
 *   --workflow <name>      Workflow name (default: storefront)
 *   --stdout               Write to stdout instead of `_TRANS.md`
 *
 * Environment:
 *   TEMPORAL_ADDRESS    (default localhost:7233)
 *   TEMPORAL_NAMESPACE  (default default)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { Client, Connection, WorkflowNotFoundError } from "@temporalio/client";
import { bootstrapOtel } from "../telemetry/otel.js";
import { stateQuery, summaryQuery } from "../workflow/queries.js";
import type { SummarySnapshot } from "../workflow/queries.js";
import { renderTransMd } from "../reporting/render-trans.js";

interface ParsedArgs {
  readonly slug: string;
  readonly app: string;
  readonly workflowName: string;
  readonly toStdout: boolean;
}

function fail(msg: string): never {
  console.error(`agent:trans:temporal: ${msg}`);
  process.exit(1);
}

function parse(argv: readonly string[]): ParsedArgs {
  const { values, positionals } = parseArgs({
    args: argv as string[],
    options: {
      app: { type: "string" },
      workflow: { type: "string", default: "storefront" },
      stdout: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
  });
  const slug = positionals[0];
  if (!slug) fail("missing <slug> positional argument");
  if (!values.app) fail("missing --app <relativePath>");
  return {
    slug,
    app: values.app as string,
    workflowName: values.workflow as string,
    toStdout: Boolean(values.stdout),
  };
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const namespace = process.env.TEMPORAL_NAMESPACE ?? "default";
  const workflowId = `dagent-${args.workflowName}-${args.slug}`;

  const otel = bootstrapOtel("dagent-trans");
  const connection = await Connection.connect({ address });
  try {
    const client = new Client({
      connection,
      namespace,
      ...(otel.plugin ? { plugins: [otel.plugin] } : {}),
    });
    const handle = client.workflow.getHandle(workflowId);

    let state, summary: SummarySnapshot | undefined;
    try {
      state = await handle.query(stateQuery);
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        fail(`workflow '${workflowId}' not running. Start it with \`agent:run:temporal\` first.`);
      }
      throw err;
    }
    try {
      summary = await handle.query(summaryQuery);
    } catch {
      // Best-effort — summary handler may not be registered on older runs.
    }

    const md = renderTransMd(state, summary ? { summary } : {});

    if (args.toStdout) {
      process.stdout.write(md);
      if (!md.endsWith("\n")) process.stdout.write("\n");
    } else {
      const repoRoot = resolve(import.meta.dirname, "../../../../..");
      const featureDir = join(repoRoot, args.app, ".dagent", args.slug);
      mkdirSync(featureDir, { recursive: true });
      const outPath = join(featureDir, "_TRANS.md");
      writeFileSync(outPath, `${md}\n`, "utf8");
      console.log(`✓ wrote ${outPath}`);
    }
  } finally {
    await connection.close();
    await otel.shutdown();
  }
}

main().catch((err) => {
  if (process.env.DEBUG) console.error(err);
  console.error(
    `agent:trans:temporal: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
