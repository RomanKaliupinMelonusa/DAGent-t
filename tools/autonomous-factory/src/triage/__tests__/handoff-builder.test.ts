/**
 * triage/__tests__/handoff-builder.test.ts — Phase A/B coverage for
 * the pure handoff assembler and the domain-tag helpers.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildTriageHandoff,
  buildConsecutiveDomainAdvisory,
  formatDomainTag,
  parseDomainTag,
  truncateError,
} from "../handoff-builder.js";
import type { ItemSummary } from "../../types.js";
import { RESET_OPS } from "../../types.js";

// ---------------------------------------------------------------------------
// formatDomainTag / parseDomainTag
// ---------------------------------------------------------------------------

describe("formatDomainTag / parseDomainTag (Phase B)", () => {
  it("formats a domain as `[domain:X]`", () => {
    assert.equal(formatDomainTag("frontend"), "[domain:frontend]");
  });

  it("round-trips a formatted tag through parseDomainTag", () => {
    const tag = formatDomainTag("ssr-hydration");
    const reason = `${tag} [source:llm] something went wrong`;
    assert.equal(parseDomainTag(reason), "ssr-hydration");
  });

  it("returns null when no tag is present", () => {
    assert.equal(parseDomainTag("free-form reason without tag"), null);
  });
});

// ---------------------------------------------------------------------------
// truncateError
// ---------------------------------------------------------------------------

describe("truncateError", () => {
  it("returns the input trimmed when at or below the line limit", () => {
    const input = "line1\nline2\nline3";
    assert.equal(truncateError(input, 40), "line1\nline2\nline3");
  });

  it("truncates and appends a '… (N more lines)' suffix when over limit", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `l${i}`).join("\n");
    const out = truncateError(lines, 40);
    assert.match(out, /^l0\n/);
    assert.match(out, /… \(10 more lines\)$/);
  });
});

// ---------------------------------------------------------------------------
// buildConsecutiveDomainAdvisory
// ---------------------------------------------------------------------------

describe("buildConsecutiveDomainAdvisory", () => {
  function resetEntry(tag: string, ts: string) {
    return {
      timestamp: ts,
      itemKey: RESET_OPS.RESET_FOR_REROUTE,
      message: `${tag} [source:llm] something`,
    };
  }
  function failEntry(ts: string) {
    return { timestamp: ts, itemKey: "dev", message: "previous failure" };
  }

  it("fires when the last two reroutes and current domain all match", () => {
    const log = [
      failEntry("2026-04-20T00:00:00Z"),
      resetEntry("[domain:frontend]", "2026-04-20T00:01:00Z"),
      failEntry("2026-04-20T00:02:00Z"),
      resetEntry("[domain:frontend]", "2026-04-20T00:03:00Z"),
    ];
    const advisory = buildConsecutiveDomainAdvisory(log, "frontend");
    assert.ok(advisory);
    assert.match(advisory!, /third/);
    assert.match(advisory!, /agent-branch\.sh revert/);
  });

  it("returns undefined when prior domains differ", () => {
    const log = [
      failEntry("2026-04-20T00:00:00Z"),
      resetEntry("[domain:backend]", "2026-04-20T00:01:00Z"),
      failEntry("2026-04-20T00:02:00Z"),
      resetEntry("[domain:frontend]", "2026-04-20T00:03:00Z"),
    ];
    assert.equal(buildConsecutiveDomainAdvisory(log, "frontend"), undefined);
  });

  it("returns undefined when there are fewer than 2 prior attempts", () => {
    const log = [
      failEntry("2026-04-20T00:00:00Z"),
      resetEntry("[domain:frontend]", "2026-04-20T00:01:00Z"),
    ];
    assert.equal(buildConsecutiveDomainAdvisory(log, "frontend"), undefined);
  });
});

// ---------------------------------------------------------------------------
// buildTriageHandoff — top-level assembly
// ---------------------------------------------------------------------------

describe("buildTriageHandoff (Phase A)", () => {
  const baseArgs = {
    failingNodeKey: "e2e-runner",
    rawError: "TimeoutError: locator.waitFor — getByTestId('widget-modal')",
    triageRecord: { error_signature: "abc12345" },
    triageResult: { domain: "frontend", reason: "contract locator missing" },
    priorAttemptCount: 2,
    pipelineSummaries: [
      {
        key: "e2e-runner",
        label: "E2E",
        agent: "e2e-runner",
        status: "failed",
        filesChanged: ["apps/app/e2e/widget.spec.ts"],
      } as unknown as ItemSummary,
    ],
    errorLog: [],
    structuredFailure: null,
  };

  it("assembles all required fields and defaults touchedFiles from the summary", () => {
    const h = buildTriageHandoff(baseArgs);
    assert.equal(h.failingItem, "e2e-runner");
    assert.equal(h.errorSignature, "abc12345");
    assert.equal(h.triageDomain, "frontend");
    assert.equal(h.triageReason, "contract locator missing");
    assert.equal(h.priorAttemptCount, 2);
    assert.deepEqual(h.touchedFiles, ["apps/app/e2e/widget.spec.ts"]);
    assert.match(h.errorExcerpt, /TimeoutError/);
    assert.equal(h.advisory, undefined);
    assert.equal(h.evidence, undefined);
  });

  it("surfaces the consecutive-domain advisory when the pattern holds", () => {
    const log = [
      { timestamp: "t0", itemKey: "dev", message: "x" },
      { timestamp: "t1", itemKey: RESET_OPS.RESET_FOR_REROUTE, message: "[domain:frontend] a" },
      { timestamp: "t2", itemKey: "dev", message: "y" },
      { timestamp: "t3", itemKey: RESET_OPS.RESET_FOR_REROUTE, message: "[domain:frontend] b" },
    ];
    const h = buildTriageHandoff({ ...baseArgs, errorLog: log });
    assert.ok(h.advisory);
    assert.match(h.advisory!, /frontend/);
  });

  it("projects playwright-json evidence via toHandoffEvidence", () => {
    const structured = {
      kind: "playwright-json",
      total: 1, passed: 0, failed: 1, skipped: 0,
      failedTests: [
        {
          title: "shows widget",
          file: "e2e/widget.spec.ts",
          line: 10,
          error: "TimeoutError",
          stackHead: "",
          attachments: [
            { name: "screenshot", path: "/tmp/feat_evidence/0-screenshot.png", contentType: "image/png" },
          ],
        },
      ],
      uncaughtErrors: [],
      consoleErrors: [],
      failedRequests: [],
    };
    const h = buildTriageHandoff({ ...baseArgs, structuredFailure: structured });
    assert.ok(h.evidence);
    assert.equal(h.evidence!.length, 1);
    assert.equal(h.evidence![0].testTitle, "shows widget");
  });

  it("projects browser signals via toBrowserSignals", () => {
    const structured = {
      kind: "playwright-json",
      total: 1, passed: 0, failed: 1, skipped: 0,
      failedTests: [],
      uncaughtErrors: [
        { message: "TypeError: x is undefined", inTest: "shows widget" },
      ],
      consoleErrors: ["error: image failed"],
      failedRequests: ["GET /api/x -> 500"],
    };
    const h = buildTriageHandoff({ ...baseArgs, structuredFailure: structured });
    assert.ok(h.browserSignals);
    assert.equal(h.browserSignals!.uncaughtErrors.length, 1);
    assert.equal(h.browserSignals!.consoleErrors.length, 1);
    assert.equal(h.browserSignals!.failedRequests.length, 1);
  });

  it("omits browserSignals when structuredFailure is absent", () => {
    const h = buildTriageHandoff({ ...baseArgs, structuredFailure: null });
    assert.equal(h.browserSignals, undefined);
  });

  it("falls back to empty touchedFiles when no summary matches", () => {
    const h = buildTriageHandoff({
      ...baseArgs,
      failingNodeKey: "not-a-real-key",
    });
    assert.deepEqual(h.touchedFiles, []);
  });
});

// ---------------------------------------------------------------------------
// buildTriageHandoff — priorDebugRecommendation surfacing
// ---------------------------------------------------------------------------

describe("buildTriageHandoff — priorDebugRecommendation", () => {
  const baseArgs2 = {
    failingNodeKey: "e2e-runner",
    rawError: "TimeoutError: locator.waitFor",
    triageRecord: { error_signature: "abc12345" },
    triageResult: { domain: "test-code", reason: "spec is wrong" },
    priorAttemptCount: 1,
    pipelineSummaries: [] as ItemSummary[],
    errorLog: [],
    structuredFailure: null,
  };

  it("passes the structured hint through to the handoff verbatim", () => {
    const h = buildTriageHandoff({
      ...baseArgs2,
      priorDebugRecommendation: {
        domain: "test-code",
        note: "The consent dialog timing intercepts pointer events.",
        cycleIndex: 2,
      },
    });
    assert.ok(h.priorDebugRecommendation);
    assert.equal(h.priorDebugRecommendation!.domain, "test-code");
    assert.equal(
      h.priorDebugRecommendation!.note,
      "The consent dialog timing intercepts pointer events.",
    );
    assert.equal(h.priorDebugRecommendation!.cycleIndex, 2);
  });

  it("omits the field when no recommendation is supplied", () => {
    const h = buildTriageHandoff(baseArgs2);
    assert.equal(h.priorDebugRecommendation, undefined);
  });
});
