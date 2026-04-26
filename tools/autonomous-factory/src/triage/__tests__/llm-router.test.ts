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
    assert.match(prompt, /cannot justify ANY domain/);
    assert.match(prompt, /prefer `test-code`/);
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

describe("buildTriagePrompt — priorDebugRecommendation block", () => {
  const REC = {
    domain: "test-code",
    note: "The consent dialog timing intercepts pointer events.",
    cycleIndex: 2,
  };

  it("renders the recommendation block when supplied", () => {
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, null, [], REC);
    assert.match(
      prompt,
      /A prior debug specialist \(cycle 2\) recommended classifying the next failure as `test-code` because: The consent dialog timing intercepts pointer events\./,
    );
    assert.match(prompt, /Prefer this classification unless the new trace contains direct evidence contradicting it\./);
  });

  it("omits the block when priorDebugRecommendation is undefined", () => {
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, null, []);
    assert.doesNotMatch(prompt, /A prior debug specialist/);
  });

  it("places the block AFTER the baseline section and BEFORE the prior-attempts section", () => {
    const baseline: BaselineProfile = {
      feature: "x",
      console_errors: [
        { pattern: "Warning: The result of getServerSnapshot should be cached" },
      ],
    };
    const priors: PriorAttempt[] = [{
      cycle: 1,
      timestamp: "t1",
      resetReason: "[domain:frontend] hydration mismatch",
      resultingSignature: null,
      failingItemKey: null,
      errorPreview: "",
    }];
    const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, baseline, priors, REC);
    const baselineIdx = prompt.indexOf("Pre-existing baseline noise");
    const recIdx = prompt.indexOf("A prior debug specialist");
    const priorsIdx = prompt.indexOf("Prior debug-cycle classifications");
    assert.ok(baselineIdx >= 0, "baseline section must be present");
    assert.ok(recIdx >= 0, "recommendation block must be present");
    assert.ok(priorsIdx >= 0, "prior-attempts section must be present");
    assert.ok(baselineIdx < recIdx, "recommendation must follow baseline");
    assert.ok(recIdx < priorsIdx, "recommendation must precede prior-attempts");
  });
});

describe("buildTriagePrompt — end-to-end loader → prompt subtraction (regression)", () => {
  it(
    "renders the baseline-noise section when the baseline is resolved via the artifact catalog "
    + "(pins the catalog-first wiring that fixed the product-quick-view-plp misclassification)",
    async () => {
      const fs = await import("node:fs");
      const os = await import("node:os");
      const path = await import("node:path");
      const { FileArtifactBus } = await import("../../adapters/file-artifact-bus.js");
      const { FileBaselineLoader } = await import("../../adapters/file-baseline-loader.js");
      const { LocalFilesystem } = await import("../../adapters/local-filesystem.js");

      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "triage-loader-"));
      try {
        const slug = "regression-feature";
        const inv = "inv_01HTRIAGEREGR0000000000A";
        const outputsDir = path.join(tmpRoot, ".dagent", slug, "baseline-analyzer", inv, "outputs");
        fs.mkdirSync(outputsDir, { recursive: true });
        const baselinePath = path.join(outputsDir, "baseline.json");
        fs.writeFileSync(
          baselinePath,
          JSON.stringify({
            feature: slug,
            console_errors: [
              { pattern: "Warning: The result of getServerSnapshot should be cached" },
            ],
          }),
        );
        const ledgerPath = path.join(tmpRoot, ".dagent", slug, "_invocations.jsonl");
        fs.writeFileSync(
          ledgerPath,
          JSON.stringify({
            invocationId: inv,
            nodeKey: "baseline-analyzer",
            outcome: "completed",
            finishedAt: "2026-04-25T20:07:50.345Z",
            sealed: true,
            outputs: [
              { kind: "baseline", path: baselinePath, nodeKey: "baseline-analyzer", invocationId: inv },
            ],
          }) + "\n",
        );

        const fsAdapter = new LocalFilesystem();
        const bus = new FileArtifactBus(tmpRoot, fsAdapter);
        const loader = new FileBaselineLoader({ appRoot: tmpRoot, bus });
        const baseline = loader.loadBaseline(slug);
        assert.ok(baseline, "loader must resolve catalog baseline");

        const prompt = buildTriagePrompt(TRACE, DOMAINS, [], ROUTING, baseline, []);
        assert.match(prompt, /Pre-existing baseline noise/);
        assert.match(prompt, /\[console\] Warning: The result of getServerSnapshot/);
        assert.match(prompt, /cannot justify ANY domain/);
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    },
  );
});

// ─────────────────────────────────────────────────────────────────────────
// Baseline-only enforcement — `tryClassifyOnce` must reject any verdict
// whose `evidence_line` substring-matches a baseline pattern, even when
// the model picked an allowed domain. This is the deterministic guard
// that fixes the cycle-2 product-quick-view-plp misclassification.
// ─────────────────────────────────────────────────────────────────────────

import type { TriageLlm, TriageLlmRequest } from "../../ports/triage-llm.js";
import { askLlmRouter } from "../llm-router.js";

const { tryClassifyOnce } = __test;

function singleShotLlm(response: string): TriageLlm {
  return {
    async classify(_req: TriageLlmRequest): Promise<string> {
      return response;
    },
  };
}

describe("tryClassifyOnce — baseline-only rejection", () => {
  const STOREFRONT_DOMAINS = ["test-code", "code-defect"];

  it("rejects a verdict whose evidence_line matches a baseline pattern", async () => {
    const baseline: BaselineProfile = {
      feature: "product-quick-view-plp",
      console_errors: [
        { pattern: "Warning: The result of getServerSnapshot should be cached" },
      ],
    };
    const llm = singleShotLlm(JSON.stringify({
      fault_domain: "code-defect",
      reason: "React hook bug — getServerSnapshot loop",
      evidence_line:
        "Warning: The result of getServerSnapshot should be cached to avoid an infinite loop",
    }));
    const result = await tryClassifyOnce(llm, "sys", "prompt", STOREFRONT_DOMAINS, 1000, baseline);
    assert.equal(result.ok, false);
    if (result.ok) return; // narrowing
    assert.equal(result.kind, "baseline-only");
    assert.match(result.detail, /matches baseline pattern/);
  });

  it("accepts a verdict whose evidence_line does NOT match the baseline", async () => {
    const baseline: BaselineProfile = {
      feature: "product-quick-view-plp",
      console_errors: [
        { pattern: "Warning: The result of getServerSnapshot should be cached" },
      ],
    };
    const llm = singleShotLlm(JSON.stringify({
      fault_domain: "test-code",
      reason: "spec timeout",
      evidence_line: "TimeoutError: locator.waitFor: Timeout 10000ms exceeded",
    }));
    const result = await tryClassifyOnce(llm, "sys", "prompt", STOREFRONT_DOMAINS, 1000, baseline);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.fault_domain, "test-code");
  });

  it("missing evidence_line is lenient-accepted (back-compat with older fixtures)", async () => {
    const baseline: BaselineProfile = {
      feature: "x",
      console_errors: [{ pattern: "anything" }],
    };
    const llm = singleShotLlm(JSON.stringify({
      fault_domain: "test-code",
      reason: "no evidence supplied",
    }));
    const result = await tryClassifyOnce(llm, "sys", "prompt", STOREFRONT_DOMAINS, 1000, baseline);
    assert.equal(result.ok, true);
  });
});

describe("askLlmRouter — cycle-2 product-quick-view-plp regression replay", () => {
  it(
    "does not classify the saved errorExcerpt as code-defect when the LLM cites getServerSnapshot",
    async () => {
      const fs = await import("node:fs");
      const os = await import("node:os");
      const path = await import("node:path");

      const STOREFRONT_DOMAINS = ["test-code", "code-defect"];
      const STOREFRONT_ROUTING = {
        "test-code": { description: "Playwright spec defect" },
        "code-defect": { description: "Storefront app code defect" },
      };

      // The exact baseline pattern captured by `baseline-analyzer` for
      // the product-quick-view-plp run, and the verbatim warning the
      // cycle-2 LLM cited as `evidence_line`.
      const baseline: BaselineProfile = {
        feature: "product-quick-view-plp",
        console_errors: [
          { pattern: "Warning: The result of getServerSnapshot should be cached to avoid an infinite loop" },
        ],
      };

      // Simulate the cycle-2 misclassification: model picks `code-defect`
      // and (hypothetically, under the new contract) cites the baseline
      // warning as its evidence. Both attempts return the same shape so
      // primary + retry both reject as `baseline-only`.
      const verdictJson = JSON.stringify({
        fault_domain: "code-defect",
        reason: "React getServerSnapshot loop preventing modal render",
        evidence_line:
          "Warning: The result of getServerSnapshot should be cached to avoid an infinite loop",
      });
      const llm: TriageLlm = {
        async classify(_req: TriageLlmRequest): Promise<string> {
          return verdictJson;
        },
      };

      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "router-replay-"));
      try {
        fs.mkdirSync(path.join(tmp, ".dagent", "regression"), { recursive: true });
        const errorExcerpt =
          "TimeoutError: locator.waitFor: Timeout 10000ms exceeded.\n" +
          "[error] Warning: The result of getServerSnapshot should be cached to avoid an infinite loop";
        const result = await askLlmRouter(
          llm,
          errorExcerpt,
          STOREFRONT_DOMAINS,
          [],
          "regression",
          tmp,
          STOREFRONT_ROUTING,
          baseline,
          [],
          "e2e-runner",
        );
        // Neither retry nor inheritance is available, so the verdict
        // must fall through to `blocked` rather than the original
        // `code-defect`. Critical assertion: it is NOT code-defect.
        assert.notEqual(result.fault_domain, "code-defect");
        assert.equal(result.fault_domain, "blocked");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    },
  );
});

