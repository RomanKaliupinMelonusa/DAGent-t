/**
 * triage/__tests__/handoff-evidence.test.ts — format-dispatched projection
 * from a StructuredFailure to TriageHandoff.evidence.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toHandoffEvidence } from "../handoff-evidence.js";
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
