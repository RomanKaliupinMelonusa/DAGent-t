/**
 * lint-slug-literals.test.ts — Verifies the agent-prompt lint that flags
 * `{{featureSlug}}_*.<ext>` literals in both fenced blocks and prose.
 *
 * Documented negative examples (lines containing "do NOT", "never", or
 * "no longer scanned") are allow-listed.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lintAgentPromptForSlugLiterals } from "../compiler.js";

describe("lintAgentPromptForSlugLiterals", () => {
  it("returns [] for a clean prompt", () => {
    const prompt = "# Agent\n\nUse the Declared I/O block.\n";
    assert.deepEqual(lintAgentPromptForSlugLiterals(prompt), []);
  });

  it("ignores boilerplate banner that uses `<KIND>.<EXT>` placeholder", () => {
    const prompt = [
      "> Any reference below to `{{appRoot}}/in-progress/{{featureSlug}}_<KIND>.<EXT>` is a **legacy path name**.",
      "> Translate `_SPEC.md` → `spec`, `_CHANGES.json` → `change-manifest`.",
    ].join("\n");
    assert.deepEqual(lintAgentPromptForSlugLiterals(prompt), []);
  });

  it("flags a `{{featureSlug}}_*` literal inside a fenced shell block", () => {
    const prompt = [
      "Run the test:",
      "```bash",
      "npx playwright test > {{appRoot}}/in-progress/{{featureSlug}}_PLAYWRIGHT-LOG.md",
      "```",
    ].join("\n");
    const hits = lintAgentPromptForSlugLiterals(prompt);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.line, 3);
    assert.match(hits[0]!.text, /featureSlug.*PLAYWRIGHT-LOG/);
  });

  it("flags multiple offenders across separate fenced blocks", () => {
    const prompt = [
      "```bash",
      "cat {{appRoot}}/in-progress/{{featureSlug}}_CI-FAILURE.log",
      "```",
      "And later:",
      "```bash",
      "echo done >> {{appRoot}}/in-progress/{{featureSlug}}_PLAYWRIGHT-LOG.md",
      "```",
    ].join("\n");
    const hits = lintAgentPromptForSlugLiterals(prompt);
    assert.equal(hits.length, 2);
    assert.equal(hits[0]!.line, 2);
    assert.equal(hits[1]!.line, 6);
  });

  it("does not flag featureSlug WITHOUT the `_` suffix", () => {
    const prompt = [
      "```bash",
      "echo {{featureSlug}}",
      "echo {{appRoot}}/e2e/{{featureSlug}}.spec.ts",
      "```",
      "Prose: see {{appRoot}}/e2e/{{featureSlug}}.spec.ts",
    ].join("\n");
    assert.deepEqual(lintAgentPromptForSlugLiterals(prompt), []);
  });

  it("flags prose reads of legacy flat-path kernel files", () => {
    const prompt = "2. Read `{{appRoot}}/in-progress/{{featureSlug}}_TRANS.md` for history.";
    const hits = lintAgentPromptForSlugLiterals(prompt);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.line, 1);
    assert.match(hits[0]!.text, /TRANS/);
  });

  it("flags prose reads of legacy flat-path change manifest", () => {
    const prompt = "1. Read the manifest: `{{appRoot}}/in-progress/{{featureSlug}}_CHANGES.json`.";
    const hits = lintAgentPromptForSlugLiterals(prompt);
    assert.equal(hits.length, 1);
  });

  it("allow-lists lines with negative-example markers (do NOT)", () => {
    const prompt = "do NOT construct `{{appRoot}}/in-progress/{{featureSlug}}_QA-REPORT.json` yourself.";
    assert.deepEqual(lintAgentPromptForSlugLiterals(prompt), []);
  });

  it("allow-lists lines with 'never' marker", () => {
    const prompt = "Never write to `{{appRoot}}/in-progress/{{featureSlug}}_SUMMARY.md` directly.";
    assert.deepEqual(lintAgentPromptForSlugLiterals(prompt), []);
  });

  it("allow-lists lines with 'no longer scanned' marker", () => {
    const prompt = "Writing to `{{appRoot}}/in-progress/{{featureSlug}}_CI-FAILURE.log` is no longer scanned.";
    assert.deepEqual(lintAgentPromptForSlugLiterals(prompt), []);
  });
});

