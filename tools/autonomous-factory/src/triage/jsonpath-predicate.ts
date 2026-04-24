/**
 * triage/jsonpath-predicate.ts — minimal JSONPath subset evaluator used
 * by the `json-path` arm of `TriagePatternSchema` (🆁3).
 *
 * Scope is intentionally narrow: triage predicates need to pick values
 * out of structured Playwright-report-shaped payloads, not query
 * arbitrary JSON. A hand-written evaluator avoids a dependency and
 * keeps the predicate grammar small and auditable.
 *
 * Supported selector grammar:
 *   path  := "$" ( step )*
 *   step  := "." <field> | "[" <index> "]" | "[*]"
 *   field := [A-Za-z_][A-Za-z0-9_-]*
 *   index := integer ≥ 0
 *
 * Everything else — filters, recursive descent, unions, slice
 * notation — is out of scope. Malformed paths and null-traversal
 * return `[]` (never throw) so predicates remain fail-safe.
 *
 * Ops: exists, nonEmpty, eq, regex, contains. See inline comments on
 * `applyOp` for exact semantics.
 */

import type { TriagePattern } from "../apm/types.js";

/** `json-path`-arm pattern, narrowed from the union for this module. */
export type JsonPathPredicate = Extract<TriagePattern, { match_kind: "json-path" }>;

export interface PredicateMatch {
  readonly matched: true;
  /** Flat map of capture name → first selected value (JSON-stringified
   *  if the selected value is not a string). Missing selectors render
   *  as the empty string so templates never produce `${undefined}`. */
  readonly captures: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

type Step = { kind: "field"; name: string } | { kind: "index"; idx: number } | { kind: "wildcard" };

const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Parse a selector into a list of steps. Returns `null` if the path
 *  is malformed (missing `$` root, unclosed bracket, non-numeric
 *  index, empty field after `.`). */
function parsePath(path: string): Step[] | null {
  if (!path || path[0] !== "$") return null;
  const steps: Step[] = [];
  let i = 1;
  while (i < path.length) {
    const ch = path[i];
    if (ch === ".") {
      const start = i + 1;
      let j = start;
      while (j < path.length && path[j] !== "." && path[j] !== "[") j++;
      const name = path.slice(start, j);
      if (!FIELD_RE.test(name)) return null;
      steps.push({ kind: "field", name });
      i = j;
    } else if (ch === "[") {
      const end = path.indexOf("]", i + 1);
      if (end === -1) return null;
      const body = path.slice(i + 1, end);
      if (body === "*") {
        steps.push({ kind: "wildcard" });
      } else if (/^\d+$/.test(body)) {
        steps.push({ kind: "index", idx: Number(body) });
      } else {
        return null;
      }
      i = end + 1;
    } else {
      return null;
    }
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

/** Apply a parsed step list to a root, returning every matching value.
 *  Wildcards flatten; null/undefined mid-traversal is dropped silently. */
function walk(root: unknown, steps: Step[]): unknown[] {
  let frontier: unknown[] = [root];
  for (const step of steps) {
    const next: unknown[] = [];
    for (const node of frontier) {
      if (node === null || node === undefined) continue;
      if (step.kind === "field") {
        if (typeof node === "object" && !Array.isArray(node) && step.name in (node as Record<string, unknown>)) {
          next.push((node as Record<string, unknown>)[step.name]);
        }
      } else if (step.kind === "index") {
        if (Array.isArray(node) && step.idx >= 0 && step.idx < node.length) {
          next.push(node[step.idx]);
        }
      } else {
        // wildcard: flatten arrays. Object wildcard is out of scope.
        if (Array.isArray(node)) {
          for (const el of node) next.push(el);
        }
      }
    }
    frontier = next;
  }
  // Drop undefined to keep `exists` semantics honest.
  return frontier.filter((v) => v !== undefined);
}

/** Public selector — parse-and-walk with fail-safe on malformed paths. */
export function selectByPath(root: unknown, path: string): unknown[] {
  const steps = parsePath(path);
  if (!steps) return [];
  return walk(root, steps);
}

// ---------------------------------------------------------------------------
// Op dispatch
// ---------------------------------------------------------------------------

function isNonEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  // numbers/booleans/objects are "non-empty" — only falsy sentinels drop.
  return true;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function applyOp(
  results: unknown[],
  op: JsonPathPredicate["op"],
  value: JsonPathPredicate["value"],
): boolean {
  switch (op) {
    case "exists":
      return results.length > 0;
    case "nonEmpty":
      return results.some(isNonEmpty);
    case "eq":
      if (value === undefined) return false;
      return results.some((r) => r === value);
    case "regex": {
      if (typeof value !== "string") return false;
      let re: RegExp;
      try {
        re = new RegExp(value);
      } catch {
        return false;
      }
      return results.some((r) => re.test(asString(r)));
    }
    case "contains": {
      if (value === undefined) return false;
      return results.some((r) => {
        if (typeof r === "string" && typeof value === "string") return r.includes(value);
        if (Array.isArray(r)) return r.includes(value);
        return false;
      });
    }
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Capture rendering
// ---------------------------------------------------------------------------

function renderCaptures(
  root: unknown,
  capture: Record<string, string> | undefined,
): Record<string, string> {
  if (!capture) return {};
  const out: Record<string, string> = {};
  for (const [name, path] of Object.entries(capture)) {
    const results = selectByPath(root, path);
    out[name] = results.length === 0 ? "" : asString(results[0]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Evaluate a `json-path` predicate against a structured payload.
 *  Returns `{ matched: true, captures }` on match, or `null` otherwise.
 *  Never throws — malformed selectors and invalid regex values produce
 *  a miss, matching the fail-safe behaviour of the `raw-regex` arm. */
export function evaluateJsonPathPredicate(
  payload: unknown,
  pat: JsonPathPredicate,
): PredicateMatch | null {
  const results = selectByPath(payload, pat.path);
  if (!applyOp(results, pat.op, pat.value)) return null;
  return { matched: true, captures: renderCaptures(payload, pat.capture) };
}
