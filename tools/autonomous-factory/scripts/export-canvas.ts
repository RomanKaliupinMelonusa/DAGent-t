#!/usr/bin/env -S node --import tsx
/**
 * scripts/export-canvas.ts — Export the APM compiled output as a flat canvas JSON.
 *
 * Usage:
 *   npm run apm:canvas -- apps/sample-app
 *   npm run apm:canvas -- apps/sample-app --out canvas.json
 *   npm run apm:canvas -- apps/sample-app --pretty
 */

import fs from "node:fs";
import path from "node:path";

import { compileApm } from "../src/apm/compiler.js";
import { toCanvas } from "../src/apm/canvas.js";

interface Args {
  readonly appRoot: string;
  readonly out?: string;
  readonly pretty: boolean;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  let out: string | undefined;
  let pretty = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out = argv[++i];
    else if (a === "--pretty") pretty = true;
    else if (!a.startsWith("--")) positional.push(a);
  }
  if (positional.length === 0) {
    throw new Error("usage: apm:canvas <app-root> [--out <file>] [--pretty]");
  }
  return { appRoot: path.resolve(process.cwd(), positional[0]), out, pretty };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const compiled = compileApm(args.appRoot);
  const appName = path.basename(args.appRoot);
  const canvas = toCanvas(appName, compiled);
  const json = args.pretty
    ? JSON.stringify(canvas, null, 2)
    : JSON.stringify(canvas);
  if (args.out) {
    const outPath = path.resolve(process.cwd(), args.out);
    fs.writeFileSync(outPath, json + "\n", "utf8");
    console.error(`Wrote ${outPath}`);
  } else {
    process.stdout.write(json);
    if (args.pretty) process.stdout.write("\n");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
