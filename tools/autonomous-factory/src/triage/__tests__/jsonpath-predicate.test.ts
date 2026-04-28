/**
 * triage/__tests__/jsonpath-predicate.test.ts — unit tests for the
 * minimal JSONPath subset evaluator used by the `json-path` arm of
 * `TriagePatternSchema` (🆁3).
 *
 * Scope: selector parsing ($ / dot-field / [N] / [*]), the five ops
 * (exists, nonEmpty, eq, regex, contains), capture-map rendering, and
 * fail-safe behaviour on malformed selectors / invalid regex values.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  selectByPath,
  evaluateJsonPathPredicate,
  type JsonPathPredicate,
} from "../jsonpath-predicate.js";

const SAMPLE = {
  kind: "playwright-json",
  uncaughtErrors: [
    { message: "TypeError: x is undefined", inTest: "shows modal" },
    { message: "RangeError: bad index", inTest: "shows cart" },
  ],
  failedTests: [
    { title: "renders cart", error: "Timeout 5000ms exceeded" },
  ],
  empty: [],
  emptyStr: "",
  nullish: null,
  flag: true,
  count: 3,
  nested: { a: { b: { c: "leaf" } } },
};

// ---------------------------------------------------------------------------
// selectByPath — selector semantics
// ---------------------------------------------------------------------------

describe("selectByPath — selector subset", () => {
  it("returns the root document for `$`", () => {
    assert.deepEqual(selectByPath(SAMPLE, "$"), [SAMPLE]);
  });

  it("navigates simple dot-fields", () => {
    assert.deepEqual(selectByPath(SAMPLE, "$.kind"), ["playwright-json"]);
    assert.deepEqual(selectByPath(SAMPLE, "$.count"), [3]);
    assert.deepEqual(selectByPath(SAMPLE, "$.flag"), [true]);
  });

  it("navigates nested dot-fields", () => {
    assert.deepEqual(selectByPath(SAMPLE, "$.nested.a.b.c"), ["leaf"]);
  });

  it("resolves numeric indices", () => {
    assert.deepEqual(selectByPath(SAMPLE, "$.failedTests[0].title"), ["renders cart"]);
    assert.deepEqual(selectByPath(SAMPLE, "$.uncaughtErrors[1].inTest"), ["shows cart"]);
  });

  it("flattens wildcard on arrays", () => {
    assert.deepEqual(
      selectByPath(SAMPLE, "$.uncaughtErrors[*].message"),
      ["TypeError: x is undefined", "RangeError: bad index"],
    );
  });

  it("returns [] for missing fields and out-of-range indices", () => {
    assert.deepEqual(selectByPath(SAMPLE, "$.nope"), []);
    assert.deepEqual(selectByPath(SAMPLE, "$.uncaughtErrors[9].message"), []);
    assert.deepEqual(selectByPath(SAMPLE, "$.nested.a.missing.c"), []);
  });

  it("returns [] for null traversal without throwing", () => {
    assert.deepEqual(selectByPath(SAMPLE, "$.nullish.anything"), []);
  });

  it("returns [] for malformed paths (no `$` root, weird tokens)", () => {
    assert.deepEqual(selectByPath(SAMPLE, "kind"), []);
    assert.deepEqual(selectByPath(SAMPLE, "$..kind"), []);
    assert.deepEqual(selectByPath(SAMPLE, "$.a[b]"), []);
    assert.deepEqual(selectByPath(SAMPLE, ""), []);
  });

  it("wildcard on an empty array yields []", () => {
    assert.deepEqual(selectByPath(SAMPLE, "$.empty[*]"), []);
  });
});

// ---------------------------------------------------------------------------
// evaluateJsonPathPredicate — op dispatch
// ---------------------------------------------------------------------------

function pred(partial: Partial<JsonPathPredicate>): JsonPathPredicate {
  return {
    match_kind: "json-path",
    format: "playwright-json",
    path: "$",
    op: "exists",
    domain: "d",
    ...partial,
  };
}

describe("evaluateJsonPathPredicate — ops", () => {
  it("`exists` matches when path has ≥1 result (undefined filtered)", () => {
    assert.ok(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.kind", op: "exists" }))!.matched);
    assert.ok(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.uncaughtErrors[*]", op: "exists" }))!.matched);
    assert.equal(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.nope", op: "exists" })), null);
  });

  it("`nonEmpty` distinguishes empty arrays / strings / null from real values", () => {
    assert.ok(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.uncaughtErrors", op: "nonEmpty" }))!.matched);
    assert.ok(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.kind", op: "nonEmpty" }))!.matched);
    assert.equal(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.empty", op: "nonEmpty" })), null);
    assert.equal(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.emptyStr", op: "nonEmpty" })), null);
    assert.equal(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.nullish", op: "nonEmpty" })), null);
  });

  it("`eq` compares strings, numbers, booleans", () => {
    assert.ok(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.kind", op: "eq", value: "playwright-json" }))!.matched);
    assert.ok(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.count", op: "eq", value: 3 }))!.matched);
    assert.ok(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.flag", op: "eq", value: true }))!.matched);
    assert.equal(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.kind", op: "eq", value: "other" })), null);
    // `eq` with no `value` never matches rather than throwing.
    assert.equal(evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.kind", op: "eq" })), null);
  });

  it("`regex` matches stringified selected values; invalid patterns = no match", () => {
    assert.ok(evaluateJsonPathPredicate(
      SAMPLE,
      pred({ path: "$.uncaughtErrors[*].message", op: "regex", value: "TypeError" }),
    )!.matched);
    assert.equal(
      evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.kind", op: "regex", value: "^xxx$" })),
      null,
    );
    assert.equal(
      evaluateJsonPathPredicate(SAMPLE, pred({ path: "$.kind", op: "regex", value: "(" })),
      null,
    );
  });

  it("`contains` does substring on strings, membership on arrays", () => {
    assert.ok(evaluateJsonPathPredicate(
      SAMPLE,
      pred({ path: "$.kind", op: "contains", value: "play" }),
    )!.matched);
    assert.ok(evaluateJsonPathPredicate(
      SAMPLE,
      pred({ path: "$.uncaughtErrors[*].message", op: "contains", value: "undefined" }),
    )!.matched);
    assert.equal(
      evaluateJsonPathPredicate(
        SAMPLE,
        pred({ path: "$.uncaughtErrors[*].message", op: "contains", value: "nope" }),
      ),
      null,
    );
  });
});

// ---------------------------------------------------------------------------
// capture map
// ---------------------------------------------------------------------------

describe("evaluateJsonPathPredicate — capture map", () => {
  it("populates captures from additional selectors", () => {
    const r = evaluateJsonPathPredicate(
      SAMPLE,
      pred({
        path: "$.uncaughtErrors[*]",
        op: "exists",
        capture: {
          firstMsg: "$.uncaughtErrors[0].message",
          firstTest: "$.uncaughtErrors[0].inTest",
        },
      }),
    );
    assert.ok(r?.matched);
    assert.equal(r!.captures.firstMsg, "TypeError: x is undefined");
    assert.equal(r!.captures.firstTest, "shows modal");
  });

  it("JSON-stringifies non-string captured values", () => {
    const r = evaluateJsonPathPredicate(
      SAMPLE,
      pred({
        path: "$.kind",
        op: "exists",
        capture: { count: "$.count", flag: "$.flag", obj: "$.nested.a" },
      }),
    );
    assert.ok(r?.matched);
    assert.equal(r!.captures.count, "3");
    assert.equal(r!.captures.flag, "true");
    // Object captures round-trip through JSON.stringify.
    assert.equal(r!.captures.obj, JSON.stringify(SAMPLE.nested.a));
  });

  it("missing capture selectors render as empty string", () => {
    const r = evaluateJsonPathPredicate(
      SAMPLE,
      pred({
        path: "$.kind",
        op: "exists",
        capture: { missing: "$.does.not.exist" },
      }),
    );
    assert.ok(r?.matched);
    assert.equal(r!.captures.missing, "");
  });
});
