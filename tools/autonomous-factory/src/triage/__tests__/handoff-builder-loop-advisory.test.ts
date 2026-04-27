/**
 * triage/__tests__/handoff-builder-loop-advisory.test.ts — Phase D.
 *
 * Locks the same-test loop detector + composite advisory:
 *   1. Two prior cycles failing the same Playwright test name → advisory
 *      mentions the test name, "fixture", and "spec-compiler".
 *   2. Only one prior cycle naming the test → no test-loop advisory.
 *   3. Same domain ×2 AND same test ×2 → both advisories joined.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildLoopAdvisory,
  detectSameTestLoop,
  extractTestNamesFromMessage,
} from "../handoff-builder.js";
import { RESET_OPS } from "../../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TEST_NAME = "switch-color-swatch-in-quick-view";
const PW_LINE = (line: number) =>
  `  ✘  4 [chromium] › e2e/product-quick-view-plp.spec.ts:${line}:9 › Product Quick View on PLP › ${TEST_NAME} (1.0m)`;

function failEntry(message: string, ts: string) {
  return { timestamp: ts, itemKey: "e2e-runner", message };
}
function rerouteEntry(domain: string, ts: string) {
  return {
    timestamp: ts,
    itemKey: RESET_OPS.RESET_FOR_REROUTE,
    message: `[domain:${domain}] [source:llm] reason`,
  };
}

describe("extractTestNamesFromMessage", () => {
  it("extracts the trailing token after the last ` › ` per line", () => {
    const names = extractTestNamesFromMessage(PW_LINE(297));
    assert.deepEqual(names, [TEST_NAME]);
  });

  it("strips trailing duration suffixes", () => {
    const msg = "  [chromium] › path.spec.ts:1:1 › Suite › my-test (6.6s)";
    const names = extractTestNamesFromMessage(msg);
    assert.deepEqual(names, ["my-test"]);
  });

  it("returns [] for messages with no separator", () => {
    assert.deepEqual(extractTestNamesFromMessage("plain stack trace"), []);
  });

  it("dedups across multiple lines", () => {
    const msg = `${PW_LINE(297)}\n${PW_LINE(299)}\n  at someFn (foo.ts:1:1)`;
    assert.deepEqual(extractTestNamesFromMessage(msg), [TEST_NAME]);
  });
});

describe("detectSameTestLoop", () => {
  it("returns the shared title when the last 2 prior cycles failed the same test", () => {
    const log = [
      failEntry(PW_LINE(297), "t0"),
      rerouteEntry("frontend", "t1"),
      failEntry(PW_LINE(299), "t2"),
      rerouteEntry("frontend", "t3"),
    ];
    assert.equal(detectSameTestLoop(log, [TEST_NAME]), TEST_NAME);
  });

  it("returns null when current cycle has no failed tests", () => {
    const log = [
      failEntry(PW_LINE(297), "t0"),
      rerouteEntry("frontend", "t1"),
      failEntry(PW_LINE(299), "t2"),
      rerouteEntry("frontend", "t3"),
    ];
    assert.equal(detectSameTestLoop(log, []), null);
  });

  it("returns null when only 1 prior cycle exists", () => {
    const log = [
      failEntry(PW_LINE(297), "t0"),
      rerouteEntry("frontend", "t1"),
    ];
    assert.equal(detectSameTestLoop(log, [TEST_NAME]), null);
  });

  it("returns null when the prior cycles failed different tests", () => {
    const log = [
      failEntry("  [chromium] › a.spec.ts:1:1 › Suite › alpha", "t0"),
      rerouteEntry("frontend", "t1"),
      failEntry("  [chromium] › b.spec.ts:1:1 › Suite › beta", "t2"),
      rerouteEntry("frontend", "t3"),
    ];
    assert.equal(detectSameTestLoop(log, ["alpha", "beta"]), null);
  });
});

describe("buildLoopAdvisory", () => {
  it("emits the same-test advisory mentioning fixture + spec-compiler", () => {
    const log = [
      failEntry(PW_LINE(297), "t0"),
      rerouteEntry("frontend", "t1"),
      failEntry(PW_LINE(299), "t2"),
      rerouteEntry("frontend", "t3"),
    ];
    const advisory = buildLoopAdvisory(log, "test-code", [TEST_NAME]);
    assert.ok(advisory);
    assert.match(advisory!, new RegExp(TEST_NAME));
    assert.match(advisory!, /fixture/);
    assert.match(advisory!, /spec-compiler/);
  });

  it("emits no test-loop advisory when only 1 prior cycle names the test", () => {
    const log = [
      failEntry(PW_LINE(297), "t0"),
      rerouteEntry("frontend", "t1"),
    ];
    // Different domain → no domain advisory either.
    assert.equal(buildLoopAdvisory(log, "test-code", [TEST_NAME]), undefined);
  });

  it("joins both advisories when same-domain and same-test patterns both fire", () => {
    const log = [
      failEntry(PW_LINE(297), "t0"),
      rerouteEntry("frontend", "t1"),
      failEntry(PW_LINE(299), "t2"),
      rerouteEntry("frontend", "t3"),
    ];
    const advisory = buildLoopAdvisory(log, "frontend", [TEST_NAME]);
    assert.ok(advisory);
    // Domain block
    assert.match(advisory!, /third/);
    assert.match(advisory!, /agent-branch\.sh revert/);
    // Test block
    assert.match(advisory!, /fixture/);
    assert.match(advisory!, /spec-compiler/);
    assert.match(advisory!, new RegExp(TEST_NAME));
    // Joined with a blank line
    assert.match(advisory!, /\n\n/);
  });
});

// ---------------------------------------------------------------------------
// Regression — captured fixture from product-quick-view-plp run.
//
// The cycle-3 reroute slot in this errorLog is a `storefront-debug` JSON
// blob (triageDiagnostic) with no Playwright ` › ` lines. Before the
// `priorFailureMessages` skip-empty fix, that empty-test-name entry was
// paired with reset 5 and collapsed the lastTwo intersection to ∅,
// causing the detector to return null at cycle-4 triage despite the
// `open-quick-view-modal` test having failed in cycles 1, 2, and 4. The
// fixture is sliced to entries 0..6 (i.e. the state visible to triage
// at cycle 4, before reset 7 is appended).
// ---------------------------------------------------------------------------

describe("detectSameTestLoop — product-quick-view-plp regression", () => {
  const fixturePath = join(__dirname, "fixtures", "product-quick-view-plp-errorlog.json");
  const errorLog: Array<{ timestamp: string; itemKey: string; message: string }> =
    JSON.parse(readFileSync(fixturePath, "utf8"));

  it("returns the looping test name despite a non-test entry in cycle 3", () => {
    assert.equal(errorLog.length, 7);
    assert.equal(detectSameTestLoop(errorLog, ["open-quick-view-modal"]), "open-quick-view-modal");
  });

  it("buildLoopAdvisory surfaces fixture re-pick + spec-compiler", () => {
    const advisory = buildLoopAdvisory(errorLog, "code-defect", ["open-quick-view-modal"]);
    assert.ok(advisory);
    assert.match(advisory!, /open-quick-view-modal/);
    assert.match(advisory!, /fixture/);
    assert.match(advisory!, /spec-compiler/);
  });
});
