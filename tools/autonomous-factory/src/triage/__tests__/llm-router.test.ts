/**
 * triage/__tests__/llm-router.test.ts — Prompt assembly tests for the
 * LLM fault-domain classifier router.
 *
 * Locks in two anti-misclassification features added after the
 * `product-quick-view-plp` run, where the storefront classifier
 * misrouted an e2e-runner failure as `frontend` because the trace
 * carried baseline `getServerSnapshot` console noise:
 *
 *   1. Baseline-noise section — patterns from the loaded
 *      `_BASELINE.json` are rendered into the prompt with an explicit
 *      "do not classify as frontend on these alone" rule.
 *   2. Prior-attempt section — recent `[domain:X]`-tagged reroute
 *      cycles are surfaced so the LLM biases toward the prior
 *      classification unless new evidence contradicts it.
 *
 * Both sections are rendered via `__test.buildTriagePrompt` to keep
 * these tests pure (no LLM stub, no temp filesystem).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { __test } from "../llm-router.js";
import type { BaselineProfile } from "../../ports/baseline-loader.js";
import type { PriorAttempt } from "../historian.js";

const { buildTriagePrompt } = __test;

const DOMAINS = ["frontend", "backend", "test-code", "infra"];
const ROUTING = {
  frontend: { description: "UI / hydration / DOM errors" },
  backend: { description: "Server / API errors" },
  "test-code": { description: "Bugs in the spec or fixtures" },
  infra: { description: "Transient infra glitches" },
};

const TRACE = "TimeoutError: locator.waitFor timed out\nWarning: The result of getServerSnapshot should be cached…";

describe("buildTriagePrompt — baseline noise section", () => {
  it("includes the getServerSnapshot pattern when baseline is supplied", () => {
    const baseline: BaselineProfile = {
      feature: "product-quick-view-plp",
      console_errors: [
        { pattern: "Warning: The result of getServerSnapshot should be cached" },
      ],
    };
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, baseline, []);
    assert.match(prompt, /Pre-existing baseline noise/);
    assert.match(prompt, /\[console\] Warning: The result of getServerSnapshot/);
    assert.match(prompt, /must NOT by themselves justify a frontend/);
  });

  it("omits the section entirely when baseline is null", () => {
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, null, []);
    assert.doesNotMatch(prompt, /Pre-existing baseline noise/);
    // No spurious blank line between rules block and trace.
    assert.doesNotMatch(prompt, /\n\n\n\nError trace:/);
  });

  it("omits the section when baseline has empty channels", () => {
    const baseline: BaselineProfile = {
      feature: "x",
      console_errors: [],
      network_failures: [],
      uncaught_exceptions: [],
    };
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, baseline, []);
    assert.doesNotMatch(prompt, /Pre-existing baseline noise/);
  });

  it("caps total bullets at 30 across console → network → uncaught", () => {
    const mk = (n: number, label: string) =>
      Array.from({ length: n }, (_, i) => ({ pattern: `${label}-${i}` }));
    const baseline: BaselineProfile = {
      feature: "x",
      console_errors: mk(31, "C"),
      network_failures: mk(5, "N"),
      uncaught_exceptions: mk(5, "U"),
    };
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, baseline, []);
    const bulletCount = (prompt.match(/^- \[(console|network|uncaught)\] /gm) ?? []).length;
    assert.equal(bulletCount, 30, "exactly 30 typed bullets must be rendered");
    assert.match(prompt, /\(11 more patterns omitted\)/);
    // Network/uncaught are dropped entirely once the cap is reached on the console list.
    assert.doesNotMatch(prompt, /\[network\] N-/);
    assert.doesNotMatch(prompt, /\[uncaught\] U-/);
  });

  it("truncates per-pattern strings longer than 160 chars", () => {
    const huge = "x".repeat(500);
    const baseline: BaselineProfile = {
      feature: "x",
      console_errors: [{ pattern: huge }],
    };
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, baseline, []);
    assert.match(prompt, /\[console\] x{159}…/);
    assert.doesNotMatch(prompt, /x{161}/);
  });
});

describe("buildTriagePrompt — prior-attempt section", () => {
  const mkAttempt = (cycle: number, ts: string, reason: string): PriorAttempt => ({
    cycle,
    timestamp: ts,
    resetReason: reason,
    resultingSignature: null,
    failingItemKey: null,
    errorPreview: "",
  });

  it("renders cycles with parsed [domain:X] tags", () => {
    const priors: PriorAttempt[] = [
      mkAttempt(1, "2026-04-25T03:00:00Z", "[domain:frontend] hydration mismatch"),
    ];
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, null, priors);
    assert.match(prompt, /Prior debug-cycle classifications/);
    assert.match(prompt, /Cycle 1 \(2026-04-25T03:00:00Z\): domain=frontend/);
    assert.match(prompt, /prefer that classification unless the new trace/);
  });

  it("omits the section when priors are empty", () => {
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, null, []);
    assert.doesNotMatch(prompt, /Prior debug-cycle classifications/);
  });

  it("renders the most recent 3 attempts when more than 3 are supplied", () => {
    const priors: PriorAttempt[] = [
      mkAttempt(1, "t1", "[domain:frontend] a"),
      mkAttempt(2, "t2", "[domain:backend] b"),
      mkAttempt(3, "t3", "[domain:test-code] c"),
      mkAttempt(4, "t4", "[domain:infra] d"),
    ];
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, null, priors);
    const cycleLines = prompt.match(/^- Cycle \d+ /gm) ?? [];
    assert.equal(cycleLines.length, 3);
    assert.doesNotMatch(prompt, /Cycle 1 \(t1\)/);
    assert.match(prompt, /Cycle 2 \(t2\)/);
    assert.match(prompt, /Cycle 4 \(t4\)/);
  });

  it("falls back to domain=unknown when no [domain:X] tag present", () => {
    const priors: PriorAttempt[] = [mkAttempt(1, "t1", "manual reset")];
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, null, priors);
    assert.match(prompt, /Cycle 1 \(t1\): domain=unknown/);
  });
});

describe("buildTriagePrompt — both-empty path", () => {
  it("produces no extra blank lines when neither baseline nor priors are supplied", () => {
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, null, []);
    assert.doesNotMatch(prompt, /Pre-existing baseline noise/);
    assert.doesNotMatch(prompt, /Prior debug-cycle classifications/);
    // Exactly one blank line separates the "Do not output…" rule from the
    // "Error trace:" header (i.e. \n\n\n is too many).
    assert.match(prompt, /Do not output any other text\.\n\n\nError trace:/);
    assert.doesNotMatch(prompt, /Do not output any other text\.\n\n\n\nError trace:/);
  });
});
