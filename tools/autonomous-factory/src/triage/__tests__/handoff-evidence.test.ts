/**
 * triage/__tests__/handoff-evidence.test.ts — format-dispatched projection
 * from a StructuredFailure to TriageHandoff.evidence.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toHandoffEvidence, toBrowserSignals } from "../handoff-evidence.js";
import type { StructuredFailure } from "../playwright-report.js";

describe("toHandoffEvidence", () => {
  it("returns undefined for unknown / missing input", () => {
    assert.equal(toHandoffEvidence(undefined), undefined);
    assert.equal(toHandoffEvidence(null), undefined);
    assert.equal(toHandoffEvidence({}), undefined);
    assert.equal(toHandoffEvidence({ kind: "jest-json" }), undefined);
  });

  it("projects a playwright-json StructuredFailure with attachments", () => {
    const structured: StructuredFailure = {
      kind: "playwright-json",
      total: 1, passed: 0, failed: 1, skipped: 0,
      failedTests: [
        {
          title: "shows widget",
          file: "e2e/widget.spec.ts",
          line: 10,
          error: "TimeoutError: locator.waitFor",
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
    const evidence = toHandoffEvidence(structured);
    assert.ok(evidence);
    assert.equal(evidence!.length, 1);
    assert.equal(evidence![0].testTitle, "shows widget");
    assert.equal(evidence![0].attachments[0].path, "/tmp/feat_evidence/0-screenshot.png");
  });

  it("skips failed tests without attachments, returns undefined when all empty", () => {
    const structured: StructuredFailure = {
      kind: "playwright-json",
      total: 1, passed: 0, failed: 1, skipped: 0,
      failedTests: [
        {
          title: "no evidence",
          file: "e2e/x.spec.ts",
          line: 1,
          error: "e",
          stackHead: "",
          // no attachments field
        },
      ],
      uncaughtErrors: [],
      consoleErrors: [],
      failedRequests: [],
    };
    assert.equal(toHandoffEvidence(structured), undefined);
  });
});

describe("toBrowserSignals", () => {
  it("returns undefined for unknown / missing input", () => {
    assert.equal(toBrowserSignals(undefined), undefined);
    assert.equal(toBrowserSignals(null), undefined);
    assert.equal(toBrowserSignals({}), undefined);
    assert.equal(toBrowserSignals({ kind: "jest-json" }), undefined);
  });

  it("returns undefined when every channel is empty", () => {
    const structured: StructuredFailure = {
      kind: "playwright-json",
      total: 1, passed: 0, failed: 1, skipped: 0,
      failedTests: [],
      uncaughtErrors: [],
      consoleErrors: [],
      failedRequests: [],
    };
    assert.equal(toBrowserSignals(structured), undefined);
  });

  it("projects all three channels when present", () => {
    const structured: StructuredFailure = {
      kind: "playwright-json",
      total: 1, passed: 0, failed: 1, skipped: 0,
      failedTests: [],
      uncaughtErrors: [
        { message: "TypeError: foo is undefined", inTest: "shows widget" },
      ],
      consoleErrors: ["error: image failed to load"],
      failedRequests: ["GET https://api.example.com/thing -> 500"],
    };
    const sig = toBrowserSignals(structured);
    assert.ok(sig);
    assert.equal(sig!.uncaughtErrors.length, 1);
    assert.equal(sig!.uncaughtErrors[0].inTest, "shows widget");
    assert.equal(sig!.consoleErrors.length, 1);
    assert.equal(sig!.failedRequests.length, 1);
  });

  it("caps channels and truncates long messages", () => {
    const longMsg = "X".repeat(500);
    const structured: StructuredFailure = {
      kind: "playwright-json",
      total: 1, passed: 0, failed: 1, skipped: 0,
      failedTests: [],
      uncaughtErrors: Array.from({ length: 25 }, (_, i) => ({
        message: `err ${i}: ${longMsg}`,
        inTest: "t",
      })),
      consoleErrors: Array.from({ length: 30 }, (_, i) => `c${i}`),
      failedRequests: Array.from({ length: 30 }, (_, i) => `r${i}`),
    };
    const sig = toBrowserSignals(structured)!;
    assert.equal(sig.uncaughtErrors.length, 10);
    assert.equal(sig.consoleErrors.length, 15);
    assert.equal(sig.failedRequests.length, 15);
    // 300-char cap: 299 chars + ellipsis = 300.
    assert.equal(sig.uncaughtErrors[0].message.length, 300);
    assert.ok(sig.uncaughtErrors[0].message.endsWith("\u2026"));
  });
});
