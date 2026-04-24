#!/usr/bin/env node
/**
 * src/cli/pipeline-lineage.ts — Artifact-bus lineage explorer.
 *
 * Renders the invocation ledger (`state.artifacts`) for a slug as a
 * human-readable flat listing, a parent-chain tree, or a raw JSON dump.
 * Phase 6 of the Artifact Bus roadmap + Phase F `--tree` mode. Read-only
 * — this CLI never mutates state.
 *
 * Usage:
 *   pipeline:lineage <slug>              # flat pretty-print of every invocation
 *   pipeline:lineage <slug> --tree       # ancestry tree (root → leaves)
 *   pipeline:lineage <slug> --json       # raw JSON
 *   pipeline:lineage <slug> --kind spec  # filter producers by kind
 *
 * Consumes the same flat `apps/<app>/in-progress/<slug>_STATE.json`
 * layout the orchestrator writes — pick the right `APP_ROOT` before
 * invoking (defaults to `apps/sample-app` for parity with existing
 * CLIs).
 */

import path from "node:path";
import fs from "node:fs";
import type { PipelineState, InvocationRecord } from "../types.js";
import { isArtifactKind, type ArtifactKind } from "../apm/artifact-catalog.js";
import { featurePath } from "../adapters/feature-paths.js";

const APP_ROOT = process.env.APP_ROOT
  ? path.resolve(process.env.APP_ROOT)
  : path.resolve("apps/sample-app");

function usage(): never {
  console.error("Usage: pipeline-lineage <slug> [--json] [--tree] [--kind <artifact-kind>]");
  process.exit(2);
}

function parseArgs(argv: string[]): { slug: string; json: boolean; tree: boolean; kind?: ArtifactKind } {
  if (argv.length === 0) usage();
  let slug: string | undefined;
  let json = false;
  let tree = false;
  let kind: ArtifactKind | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") { json = true; continue; }
    if (a === "--tree") { tree = true; continue; }
    if (a === "--kind") {
      const v = argv[++i];
      if (!v) usage();
      if (!isArtifactKind(v)) {
        console.error(`Unknown artifact kind: '${v}'`);
        process.exit(2);
      }
      kind = v;
      continue;
    }
    if (!slug) { slug = a; continue; }
    usage();
  }
  if (!slug) usage();
  return { slug, json, tree, kind };
}

function readLedger(slug: string): readonly InvocationRecord[] {
  const p = featurePath(APP_ROOT, slug, "state");
  if (!fs.existsSync(p)) {
    console.error(`No state file found for slug '${slug}' at ${p}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(p, "utf8");
  let parsed: PipelineState;
  try { parsed = JSON.parse(raw) as PipelineState; }
  catch (e) {
    console.error(`Failed to parse state file: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  const ledger = parsed.artifacts ?? {};
  const records = Object.values(ledger);
  records.sort((a, b) => (a.startedAt ?? "").localeCompare(b.startedAt ?? ""));
  return records;
}

function filterByKind(records: readonly InvocationRecord[], kind?: ArtifactKind): readonly InvocationRecord[] {
  if (!kind) return records;
  return records.filter((r) => (r.outputs ?? []).some((o) => o.kind === kind));
}

function printPretty(slug: string, records: readonly InvocationRecord[]): void {
  console.log(`Artifact lineage — feature '${slug}' (${records.length} invocation${records.length === 1 ? "" : "s"})`);
  console.log("─".repeat(72));
  if (records.length === 0) {
    console.log("  (no invocations recorded — ledger is empty or slug is pre-Phase-2)");
    return;
  }
  for (const rec of records) {
    const outcome = rec.outcome ?? "pending";
    const finished = rec.finishedAt ? ` → ${rec.finishedAt}` : "";
    console.log(`\n  ${rec.invocationId}  [${rec.nodeKey}#${rec.cycleIndex}]  ${rec.trigger} · ${outcome}`);
    console.log(`    started: ${rec.startedAt}${finished}`);
    if (rec.parentInvocationId) {
      console.log(`    parent:  ${rec.parentInvocationId}${rec.producedBy ? ` (${rec.producedBy})` : ""}`);
    }
    const inputs = rec.inputs ?? [];
    if (inputs.length > 0) {
      console.log(`    inputs:  ${inputs.length}`);
      for (const ref of inputs) {
        console.log(`      · ${ref.kind} [${ref.scope}] ${ref.path}`);
      }
    }
    const outputs = rec.outputs ?? [];
    if (outputs.length > 0) {
      console.log(`    outputs: ${outputs.length}`);
      for (const ref of outputs) {
        console.log(`      · ${ref.kind} [${ref.scope}] ${ref.path}`);
      }
    }
    if (rec.sealed) console.log(`    sealed:  true`);
  }
}

/**
 * Render the ledger as an ancestry forest keyed by `parentInvocationId`.
 * Roots are invocations without a parent (or whose parent id is absent
 * from the ledger). Children are ordered by `startedAt` ascending so the
 * tree reads top-to-bottom chronologically within each branch.
 */
function printTree(slug: string, records: readonly InvocationRecord[]): void {
  console.log(`Artifact lineage tree — feature '${slug}' (${records.length} invocation${records.length === 1 ? "" : "s"})`);
  console.log("─".repeat(72));
  if (records.length === 0) {
    console.log("  (no invocations recorded — ledger is empty or slug is pre-Phase-2)");
    return;
  }

  const byId = new Map<string, InvocationRecord>();
  for (const r of records) byId.set(r.invocationId, r);

  const children = new Map<string, InvocationRecord[]>();
  const roots: InvocationRecord[] = [];
  for (const r of records) {
    const parent = r.parentInvocationId;
    if (parent && byId.has(parent)) {
      const bucket = children.get(parent) ?? [];
      bucket.push(r);
      children.set(parent, bucket);
    } else {
      roots.push(r);
    }
  }
  const sortByStart = (a: InvocationRecord, b: InvocationRecord): number =>
    (a.startedAt ?? "").localeCompare(b.startedAt ?? "");
  roots.sort(sortByStart);
  for (const bucket of children.values()) bucket.sort(sortByStart);

  function renderNode(rec: InvocationRecord, prefix: string, isLast: boolean, isRoot: boolean): void {
    const branch = isRoot ? "" : isLast ? "└── " : "├── ";
    const outcome = rec.outcome ?? "pending";
    const invShort = rec.invocationId.slice(0, 16);
    const outCount = (rec.outputs ?? []).length;
    const outBadge = outCount > 0 ? ` · ${outCount} output${outCount === 1 ? "" : "s"}` : "";
    console.log(
      `${prefix}${branch}${rec.nodeKey}#${rec.cycleIndex} [${outcome}] ${rec.trigger} (${invShort}…)${outBadge}`,
    );
    const kids = children.get(rec.invocationId) ?? [];
    const nextPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
    kids.forEach((k, i) => renderNode(k, nextPrefix, i === kids.length - 1, false));
  }

  roots.forEach((r, i) => renderNode(r, "", i === roots.length - 1, true));
}

async function main(): Promise<void> {
  const { slug, json, tree, kind } = parseArgs(process.argv.slice(2));
  const records = filterByKind(readLedger(slug), kind);
  if (json) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  if (tree) {
    printTree(slug, records);
    return;
  }
  printPretty(slug, records);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : String(e));
  process.exit(1);
});
