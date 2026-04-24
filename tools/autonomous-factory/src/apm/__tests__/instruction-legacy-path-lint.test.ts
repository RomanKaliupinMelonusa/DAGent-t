/**
 * apm/__tests__/instruction-legacy-path-lint.test.ts — Phase 7.
 *
 * Validates the schema gate that rejects rendered instruction prompts
 * containing legacy `<slug>_*` filename patterns or unbacked
 * `${SLUG}_*` envvars. The new Unified Node I/O Contract puts every
 * per-feature file under `in-progress/<slug>/<nodeKey>/<inv>/(inputs|outputs)/`,
 * so any prompt still telling the agent to read `<slug>_FOO.md` is dead
 * code waiting to silently fail at runtime.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  lintAssembledInstructions,
  formatViolations,
} from "../instruction-lint.js";

describe("lintAssembledInstructions", () => {
  it("returns no violations for clean prompts", () => {
    const text = [
      "## Coding Rules",
      "",
      "Read the spec from `inputs/spec.md` and write to `outputs/summary.md`.",
      "Honor the per-invocation directory tree at `in-progress/<slug>/<nodeKey>/<inv>/`.",
    ].join("\n");
    assert.deepEqual(lintAssembledInstructions(text), []);
  });

  it("flags `<slug>_FOO.md` references in prose", () => {
    const text = "Always create the spec at <slug>_SPEC.md before coding.";
    const v = lintAssembledInstructions(text);
    assert.equal(v.length, 1);
    assert.equal(v[0]!.pattern, "legacy-slug-path");
    assert.equal(v[0]!.line, 1);
    assert.match(v[0]!.snippet, /<slug>_SPEC\.md/);
  });

  it("flags `${SLUG}_FOO` shell-style references", () => {
    const text = "Run: jq . ${SLUG}_acceptance.yaml";
    const v = lintAssembledInstructions(text);
    assert.equal(v.length, 1);
    assert.equal(v[0]!.pattern, "legacy-slug-envvar");
  });

  it("flags `{{featureSlug}}_FOO` Handlebars-style references", () => {
    const text = "Read {{featureSlug}}_PLAN.md from in-progress/.";
    const v = lintAssembledInstructions(text);
    assert.equal(v.length, 1);
    assert.equal(v[0]!.pattern, "legacy-feature-slug-path");
  });

  it("ignores legacy patterns inside fenced code blocks (migration notes)", () => {
    const text = [
      "Migration note — the old shape was:",
      "",
      "```",
      "in-progress/<slug>_SPEC.md",
      "in-progress/${SLUG}_acceptance.yaml",
      "```",
      "",
      "The new shape is `inputs/spec.md`.",
    ].join("\n");
    assert.deepEqual(lintAssembledInstructions(text), []);
  });

  it("ignores legacy patterns inside inline backticks", () => {
    const text =
      "Do NOT write to `<slug>_SPEC.md` (legacy); use `outputs/spec.md` instead.";
    assert.deepEqual(lintAssembledInstructions(text), []);
  });

  it("preserves line numbers across redacted code blocks", () => {
    const text = [
      "Line 1",
      "```",
      "code line — <slug>_X.md is allowed here",
      "```",
      "Line 5 has a real violation: <slug>_Y.md",
    ].join("\n");
    const v = lintAssembledInstructions(text);
    assert.equal(v.length, 1);
    assert.equal(v[0]!.line, 5);
  });

  it("flags the bare `$SLUG_FOO` form (no braces)", () => {
    const text = "echo $SLUG_FOO";
    const v = lintAssembledInstructions(text);
    assert.equal(v.length, 1);
    assert.equal(v[0]!.pattern, "legacy-slug-envvar");
  });

  it("does not flag the standard env vars exported by the new contract", () => {
    const text = [
      "Use $INPUTS_DIR and $OUTPUTS_DIR for I/O.",
      "Logs land under $LOGS_DIR.",
      "Cwd is $INVOCATION_DIR.",
    ].join("\n");
    assert.deepEqual(lintAssembledInstructions(text), []);
  });

  it("does not flag the bare token `<slug>` (no underscore suffix)", () => {
    const text = "Replace <slug> with the feature name.";
    assert.deepEqual(lintAssembledInstructions(text), []);
  });

  it("collects multiple violations across distinct lines", () => {
    const text = [
      "Step 1: read <slug>_SPEC.md",
      "Step 2: read <slug>_PLAN.md",
      "Step 3: write to ${SLUG}_DONE.txt",
    ].join("\n");
    const v = lintAssembledInstructions(text);
    assert.equal(v.length, 3);
    assert.deepEqual(
      v.map((x) => x.line),
      [1, 2, 3],
    );
  });

  // -------------------------------------------------------------------------
  // Phase 3 — bare upstreamArtifacts access
  // -------------------------------------------------------------------------

  it("flags `{{upstreamArtifacts.foo}}` bare access (Phase 3)", () => {
    const text = "The plan is {{upstreamArtifacts.planner}} — use it.";
    const v = lintAssembledInstructions(text);
    assert.equal(v.length, 1);
    assert.equal(v[0]!.pattern, "bare-upstream-artifacts-access");
  });

  it("flags nested bare access like `{{upstreamArtifacts.planner.step}}`", () => {
    const text = "Start with {{upstreamArtifacts.planner.step}}.";
    const v = lintAssembledInstructions(text);
    assert.equal(v.length, 1);
    assert.equal(v[0]!.pattern, "bare-upstream-artifacts-access");
  });

  it("does NOT flag the typed `{{artifact \"x\" \"y\"}}` helper", () => {
    const text = "The plan is {{artifact \"planner\" \"params\"}} — use it.";
    assert.deepEqual(lintAssembledInstructions(text), []);
  });

  it("does NOT flag bare access inside fenced code blocks (migration examples)", () => {
    const text = [
      "Before:",
      "```",
      "Old templates used {{upstreamArtifacts.planner}} directly.",
      "```",
      "After: use the typed {{artifact \"planner\" \"params\"}} helper.",
    ].join("\n");
    assert.deepEqual(lintAssembledInstructions(text), []);
  });
});

describe("formatViolations", () => {
  it("includes the agent key, app, count, and per-violation snippets", () => {
    const msg = formatViolations("backend-dev", "sample-app", [
      { pattern: "legacy-slug-path", line: 7, snippet: "Read <slug>_SPEC.md" },
      { pattern: "legacy-slug-envvar", line: 12, snippet: "echo ${SLUG}_X" },
    ]);
    assert.match(msg, /backend-dev/);
    assert.match(msg, /sample-app/);
    assert.match(msg, /2 forbidden legacy pattern/);
    assert.match(msg, /\[legacy-slug-path\] line 7/);
    assert.match(msg, /\[legacy-slug-envvar\] line 12/);
  });
});
