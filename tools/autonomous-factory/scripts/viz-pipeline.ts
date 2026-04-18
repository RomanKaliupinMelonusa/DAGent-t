#!/usr/bin/env -S node --import tsx
/**
 * scripts/viz-pipeline.ts — Phase 5 Mermaid / DOT DAG visualization CLI.
 *
 * Thin wrapper: parses argv, compiles the app's APM configuration, delegates
 * to the pure renderers in `src/viz/render.ts`, and writes to stdout.
 *
 * Usage:
 *   npm run pipeline:viz -- apps/sample-app
 *   npm run pipeline:viz -- apps/sample-app --format dot
 *   npm run pipeline:viz -- apps/sample-app --workflow backend
 */

import path from "node:path";
import { compileApm } from "../src/apm/compiler.js";
import { renderMermaid, renderDot } from "../src/viz/render.js";

interface Args {
  readonly appRoot: string;
  readonly format: "mermaid" | "dot";
  readonly workflowFilter?: string;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let format: "mermaid" | "dot" = "mermaid";
  let workflowFilter: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--format") format = argv[++i] as "mermaid" | "dot";
    else if (a === "--workflow") workflowFilter = argv[++i];
    else if (!a.startsWith("--")) positional.push(a);
  }
  if (positional.length === 0) {
    throw new Error("usage: pipeline:viz <app-root> [--format mermaid|dot] [--workflow <name>]");
  }
  return { appRoot: path.resolve(process.cwd(), positional[0]), format, workflowFilter };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const compiled = compileApm(args.appRoot);
  if (args.workflowFilter && !compiled.workflows[args.workflowFilter]) {
    console.error(`Unknown workflow: ${args.workflowFilter}`);
    console.error(`Available: ${Object.keys(compiled.workflows).join(", ")}`);
    process.exit(1);
  }
  const workflows = args.workflowFilter
    ? { [args.workflowFilter]: compiled.workflows[args.workflowFilter] }
    : compiled.workflows;
  const out = args.format === "dot" ? renderDot(workflows) : renderMermaid(workflows);
  process.stdout.write(out);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
