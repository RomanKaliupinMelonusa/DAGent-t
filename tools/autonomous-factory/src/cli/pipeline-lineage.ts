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
 * Consumes the same flat `apps/<app>/.dagent/<slug>_STATE.json`
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
  console.error("Usage: pipeline-lineage <slug> [--json] [--tree] [--trace <invocationId>] [--kind <artifact-kind>]");
  process.exit(2);
}

function parseArgs(argv: string[]): { slug: string; json: boolean; tree: boolean; kind?: ArtifactKind; trace?: string } {
  if (argv.length === 0) usage();
  let slug: string | undefined;
  let json = false;
  let tree = false;
  let kind: ArtifactKind | undefined;
  let trace: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") { json = true; continue; }
    if (a === "--tree") { tree = true; continue; }
    if (a === "--trace") {
      const v = argv[++i];
      if (!v) usage();
      trace = v;
      continue;
    }
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
  return { slug, json, tree, kind, ...(trace ? { trace } : {}) };
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
    if (rec.triggeredBy) {
      console.log(
        `    triggeredBy: ${rec.triggeredBy.nodeKey}/${rec.triggeredBy.invocationId} (${rec.triggeredBy.reason})`,
      );
    }
    if (rec.routedTo) {
      console.log(
        `    routedTo: ${rec.routedTo.nodeKey}/${rec.routedTo.invocationId}`,
      );
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
    // Phase D — prefer the richer `triggeredBy` causality stamp over
    // the legacy `parentInvocationId` (which only triage-staging set).
    // Fall back to `parentInvocationId` for backward compatibility.
    const parent = r.triggeredBy?.invocationId ?? r.parentInvocationId;
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
    const routedBadge = rec.routedTo
      ? ` → ${rec.routedTo.nodeKey}/${rec.routedTo.invocationId.slice(0, 16)}…`
      : "";
    console.log(
      `${prefix}${branch}${rec.nodeKey}#${rec.cycleIndex} [${outcome}] ${rec.trigger} (${invShort}…)${outBadge}${routedBadge}`,
    );
    const kids = children.get(rec.invocationId) ?? [];
    const nextPrefix = isRoot ? "" : prefix + (isLast ? "    " : "│   ");
    kids.forEach((k, i) => renderNode(k, nextPrefix, i === kids.length - 1, false));
  }

  roots.forEach((r, i) => renderNode(r, "", i === roots.length - 1, true));
}

/**
 * Walk the chain backward from a target invocation via `triggeredBy` /
 * `parentInvocationId` to a root, then forward via `routedTo`. Renders
 * the full causal trace as a single linear chain — useful for debugging
 * "what node called this triage and what did the triage decide".
 */
function printTrace(slug: string, records: readonly InvocationRecord[], target: string): void {
  const byId = new Map<string, InvocationRecord>();
  for (const r of records) byId.set(r.invocationId, r);
  const focus = byId.get(target);
  if (!focus) {
    console.error(`Invocation '${target}' not found in ledger for slug '${slug}'.`);
    process.exit(1);
  }
  const ancestors: InvocationRecord[] = [];
  const seen = new Set<string>();
  let cur: InvocationRecord | undefined = focus;
  while (cur) {
    if (seen.has(cur.invocationId)) break;
    seen.add(cur.invocationId);
    ancestors.unshift(cur);
    const parentId: string | undefined = cur.triggeredBy?.invocationId ?? cur.parentInvocationId;
    cur = parentId ? byId.get(parentId) : undefined;
  }
  const descendants: InvocationRecord[] = [];
  let cursor: InvocationRecord | undefined = focus;
  seen.clear();
  seen.add(focus.invocationId);
  while (cursor?.routedTo) {
    const next = byId.get(cursor.routedTo.invocationId);
    if (!next || seen.has(next.invocationId)) break;
    seen.add(next.invocationId);
    descendants.push(next);
    cursor = next;
  }
  const chain = [...ancestors, ...descendants];
  console.log(`Causal trace — feature '${slug}', focus '${target}'`);
  console.log("─".repeat(72));
  for (let i = 0; i < chain.length; i++) {
    const rec = chain[i];
    const isFocus = rec.invocationId === target;
    const marker = isFocus ? "►" : " ";
    const arrow = i < chain.length - 1 ? "  │" : "";
    console.log(
      `${marker} ${rec.nodeKey}#${rec.cycleIndex} [${rec.outcome ?? "pending"}] ${rec.trigger}`,
    );
    console.log(`    ${rec.invocationId}`);
    if (rec.triggeredBy) {
      console.log(`    triggeredBy: ${rec.triggeredBy.nodeKey}/${rec.triggeredBy.invocationId} (${rec.triggeredBy.reason})`);
    }
    if (rec.routedTo) {
      console.log(`    routedTo:    ${rec.routedTo.nodeKey}/${rec.routedTo.invocationId}`);
    }
    const inputs = rec.inputs ?? [];
    if (inputs.length > 0) {
      console.log(`    inputs:  ${inputs.map((x) => x.kind).join(", ")}`);
    }
    const outputs = rec.outputs ?? [];
    if (outputs.length > 0) {
      console.log(`    outputs: ${outputs.map((x) => x.kind).join(", ")}`);
    }
    if (arrow) console.log(arrow);
  }
}

async function main(): Promise<void> {
  const { slug, json, tree, kind, trace } = parseArgs(process.argv.slice(2));
  const records = filterByKind(readLedger(slug), kind);
  if (json) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  if (trace) {
    printTrace(slug, records, trace);
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
