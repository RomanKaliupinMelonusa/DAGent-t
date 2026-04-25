/**
 * reporting/trans-tree.ts — Invocation-lineage tree renderer for `_TRANS.md`.
 *
 * Walks the authoritative `state.artifacts` ledger (keyed by invocationId),
 * groups by nodeKey, then nests each invocation under its `parentInvocationId`
 * so triage-driven reroute loops appear as visible subtrees.
 *
 * Pure function — takes a plain `Record<string, InvocationRecord>` and returns
 * an array of markdown lines. No I/O, no side effects.
 */

import type { InvocationRecord } from "../types.js";

const STATUS_BADGE: Record<string, string> = {
  completed: "✓",
  failed: "✗",
  error: "⚠",
};

export interface RenderInvocationTreeOptions {
  /**
   * When true, append a nested bullet for every artifact produced by
   * each invocation (`kind — path`). Defaults to false to keep the
   * `_TRANS.md` baseline rendering unchanged.
   */
  readonly includeArtifacts?: boolean;
}

/**
 * Render the invocation lineage as a nested bullet list.
 *
 * Output shape:
 *
 *   ### <nodeKey>
 *   - ✓ #1 `inv_01HZ…` (kickoff) [completed @ 2026-04-23T10:00:00Z]
 *     - ✗ #2 `inv_01HZ…` (triage-reroute ← inv_01HZ…) [failed]
 *       - ✓ #3 `inv_01HZ…` (triage-reroute ← inv_01HZ…) [completed]
 *
 * With `includeArtifacts: true`, each invocation is followed by its
 * outputs as further-indented bullets:
 *
 *   - ✓ #1 `inv_01HZ…` (kickoff) [completed]
 *     · spec — in-progress/feat/spec-compiler/inv_…/outputs/spec.md
 *     · acceptance — in-progress/feat/spec-compiler/inv_…/outputs/acceptance.yml
 *
 * Returns `[]` when the ledger is empty (legacy / fresh state).
 */
export function renderInvocationTree(
  artifacts: Record<string, InvocationRecord>,
  options: RenderInvocationTreeOptions = {},
): string[] {
  const records = Object.values(artifacts);
  if (records.length === 0) return [];

  // Group by nodeKey, then sort within each group by cycleIndex so
  // traversal order mirrors the sequence the scheduler dispatched.
  const byNode = new Map<string, InvocationRecord[]>();
  for (const rec of records) {
    const bucket = byNode.get(rec.nodeKey);
    if (bucket) bucket.push(rec);
    else byNode.set(rec.nodeKey, [rec]);
  }
  for (const bucket of byNode.values()) {
    bucket.sort((a, b) => a.cycleIndex - b.cycleIndex);
  }

  const nodeKeys = [...byNode.keys()].sort();
  const lines: string[] = [];
  for (const nodeKey of nodeKeys) {
    lines.push(`### ${nodeKey}`);
    const bucket = byNode.get(nodeKey)!;
    // Index the whole group's children by parentInvocationId so we can
    // nest triage-reroute chains under their originator.
    const childrenByParent = new Map<string, InvocationRecord[]>();
    const roots: InvocationRecord[] = [];
    for (const rec of bucket) {
      const parentId = rec.parentInvocationId;
      if (parentId && bucket.some((r) => r.invocationId === parentId)) {
        const kids = childrenByParent.get(parentId);
        if (kids) kids.push(rec);
        else childrenByParent.set(parentId, [rec]);
      } else {
        roots.push(rec);
      }
    }
    for (const root of roots) {
      renderInvocationLine(root, childrenByParent, 0, lines, options);
    }
    lines.push("");
  }
  // Trailing blank pushed inside the loop — drop the final one for clean output.
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function renderInvocationLine(
  rec: InvocationRecord,
  childrenByParent: Map<string, InvocationRecord[]>,
  depth: number,
  out: string[],
  options: RenderInvocationTreeOptions,
): void {
  const indent = "  ".repeat(depth);
  const badge = rec.outcome ? (STATUS_BADGE[rec.outcome] ?? "·") : "…";
  // Lineage suffixes (Phase G): backward via `parentInvocationId` (legacy
  // triage staging) or `triggeredBy` (Phase C), forward via `routedTo`
  // (Phase D, triage rerouting). When both `parentInvocationId` and
  // `triggeredBy` are present they describe the same edge — prefer the
  // richer triggeredBy stamp. Forward edges show as `→`.
  let lineageSuffix = "";
  if (rec.parentInvocationId) {
    lineageSuffix += ` ← ${rec.parentInvocationId}`;
  } else if (rec.triggeredBy) {
    lineageSuffix += ` ← ${rec.triggeredBy.nodeKey}/${rec.triggeredBy.invocationId} (${rec.triggeredBy.reason})`;
  }
  if (rec.routedTo) {
    lineageSuffix += ` → ${rec.routedTo.nodeKey}/${rec.routedTo.invocationId}`;
  }
  const statusSuffix = rec.outcome
    ? ` [${rec.outcome}${rec.finishedAt ? ` @ ${rec.finishedAt}` : ""}]`
    : ` [pending${rec.startedAt ? ` @ ${rec.startedAt}` : ""}]`;
  out.push(
    `${indent}- ${badge} #${rec.cycleIndex} \`${rec.invocationId}\` (${rec.trigger}${lineageSuffix})${statusSuffix}`,
  );
  if (options.includeArtifacts) {
    const artifactIndent = "  ".repeat(depth + 1);
    const outputs = rec.outputs ?? [];
    if (outputs.length === 0) {
      out.push(`${artifactIndent}· (no outputs)`);
    } else {
      for (const ref of outputs) {
        out.push(`${artifactIndent}· ${ref.kind} — \`${ref.path}\``);
      }
    }
  }
  const kids = childrenByParent.get(rec.invocationId);
  if (!kids) return;
  kids.sort((a, b) => a.cycleIndex - b.cycleIndex);
  for (const kid of kids) {
    renderInvocationLine(kid, childrenByParent, depth + 1, out, options);
  }
}
