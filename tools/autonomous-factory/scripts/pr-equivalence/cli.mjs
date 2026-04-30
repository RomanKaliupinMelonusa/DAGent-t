#!/usr/bin/env node
/**
 * tools/autonomous-factory/scripts/pr-equivalence/cli.mjs
 *
 * CLI entry point for the PR-byte-equivalence harness. Takes two diff
 * file paths (legacy + Temporal), normalizes both via `./normalize.mjs`,
 * and exits 0 on byte-equality / 1 with a unified-diff dump otherwise.
 *
 * Usage:
 *   node scripts/pr-equivalence/cli.mjs <legacy.diff> <temporal.diff>
 *
 * The same harness is invoked from `npm run test:pr-equivalence` (via
 * a Vitest test that exercises the committed fixture pair) and from the
 * future soak-window job that will run it against actual legacy- vs
 * Temporal-produced PRs (see Session 5 P7 status note).
 */
import { readFileSync } from "node:fs";
import { argv, exit, stdout, stderr } from "node:process";
import { compareDiffs } from "./normalize.mjs";

const args = argv.slice(2);
if (args.length !== 2) {
  stderr.write("usage: cli.mjs <legacy.diff> <temporal.diff>\n");
  exit(2);
}
const [aPath, bPath] = args;
const a = readFileSync(aPath, "utf-8");
const b = readFileSync(bPath, "utf-8");
const { equal, normalized } = compareDiffs(a, b);

if (equal) {
  stdout.write(`PR-equivalence OK — ${aPath} ≡ ${bPath} (byte-equal after normalization)\n`);
  exit(0);
}

stderr.write(`PR-equivalence FAIL — normalized diffs differ.\n`);
stderr.write(`--- normalized(${aPath})\n${normalized.a}`);
stderr.write(`+++ normalized(${bPath})\n${normalized.b}`);
exit(1);
