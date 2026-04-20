/**
 * triage/__tests__/playwright-report.test.ts — Parser for Playwright
 * `--reporter=json` artifacts. See ../playwright-report.ts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parsePlaywrightReport, hasImplDefectSignal, computeStructuredSignature } from "../playwright-report.js";

function writeTmp(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pwreport-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, "utf-8");
  return p;
}

describe("parsePlaywrightReport", () => {
  it("returns null on missing file", () => {
    assert.equal(parsePlaywrightReport("/no/such/path.json"), null);
  });

  it("returns null on invalid JSON", () => {
    const p = writeTmp("broken.json", "{not valid json");
    assert.equal(parsePlaywrightReport(p), null);
  });

  it("aggregates stats and captures a failed test with stack head", () => {
    const report = {
      stats: { expected: 2, unexpected: 1, skipped: 0, flaky: 0 },
      suites: [
        {
          file: "e2e/product-quick-view.spec.ts",
          specs: [
            {
              title: "shows modal with product content",
              file: "e2e/product-quick-view.spec.ts",
              line: 42,
              tests: [
                {
                  status: "unexpected",
                  results: [
                    {
                      status: "failed",
                      errors: [
                        {
                          message: "TypeError: Cannot read properties of undefined (reading 'masterId')",
                          stack:
                            "TypeError: Cannot read properties of undefined (reading 'masterId')\n    at ProductView (overrides/app/components/product-view/index.jsx:42:18)\n    at renderWithHooks (react-dom.js:1)\n    at mountIndeterminate (react-dom.js:2)",
                        },
                      ],
                      attachments: [],
                      stdout: [],
                      stderr: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const p = writeTmp("ok.json", JSON.stringify(report));
    const parsed = parsePlaywrightReport(p);
    assert.ok(parsed);
    assert.equal(parsed!.kind, "playwright-json");
    assert.equal(parsed!.total, 3);
    assert.equal(parsed!.passed, 2);
    assert.equal(parsed!.failed, 1);
    assert.equal(parsed!.failedTests.length, 1);
    assert.equal(parsed!.failedTests[0].title, "shows modal with product content");
    assert.equal(parsed!.failedTests[0].line, 42);
    assert.match(parsed!.failedTests[0].error, /masterId/);
    assert.match(parsed!.failedTests[0].stackHead, /ProductView/);
  });

  it("extracts uncaught browser errors from stdout/stderr streams", () => {
    const report = {
      stats: { expected: 0, unexpected: 1, skipped: 0, flaky: 0 },
      suites: [
        {
          specs: [
            {
              title: "adds to cart",
              file: "e2e/cart.spec.ts",
              tests: [
                {
                  status: "unexpected",
                  results: [
                    {
                      status: "failed",
                      errors: [{ message: "Timeout" }],
                      attachments: [],
                      stdout: [{ text: "pageerror: TypeError: foo is not a function\n" }],
                      stderr: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const p = writeTmp("uncaught.json", JSON.stringify(report));
    const parsed = parsePlaywrightReport(p);
    assert.ok(parsed);
    assert.equal(parsed!.uncaughtErrors.length, 1);
    assert.equal(parsed!.uncaughtErrors[0].inTest, "adds to cart");
    assert.match(parsed!.uncaughtErrors[0].message, /TypeError: foo is not a function/);
    assert.equal(hasImplDefectSignal(parsed!), true);
  });

  it("ignores passing/skipped tests when mining failures", () => {
    const report = {
      stats: { expected: 1, unexpected: 0, skipped: 1, flaky: 0 },
      suites: [
        {
          specs: [
            {
              title: "green",
              file: "e2e/g.spec.ts",
              tests: [{ status: "expected", results: [{ status: "passed" }] }],
            },
            {
              title: "skipped",
              file: "e2e/g.spec.ts",
              tests: [{ status: "skipped", results: [{ status: "skipped" }] }],
            },
          ],
        },
      ],
    };
    const p = writeTmp("green.json", JSON.stringify(report));
    const parsed = parsePlaywrightReport(p);
    assert.ok(parsed);
    assert.equal(parsed!.failedTests.length, 0);
    assert.equal(parsed!.uncaughtErrors.length, 0);
    assert.equal(hasImplDefectSignal(parsed!), false);
  });
});

describe("computeStructuredSignature", () => {
  const cycle1 = {
    kind: "playwright-json" as const,
    total: 3,
    passed: 0,
    failed: 3,
    skipped: 0,
    failedTests: [
      {
        title: "quick-view-open-and-load",
        file: "e2e/product-quick-view.spec.ts",
        line: 10,
        error:
          "TimeoutError: locator.waitFor: Timeout 5000ms exceeded.\n    waiting for getByTestId('quick-view-modal') to be visible",
        stackHead: "    at e2e/product-quick-view.spec.ts:12:30",
      },
      {
        title: "quick-view-modal-shows-product-details",
        file: "e2e/product-quick-view.spec.ts",
        line: 20,
        error:
          "TimeoutError: locator.waitFor: Timeout 5000ms exceeded.\n    waiting for getByTestId('quick-view-modal') to be visible",
        stackHead: "    at e2e/product-quick-view.spec.ts:22:30",
      },
    ],
    uncaughtErrors: [],
    consoleErrors: [],
    failedRequests: [],
  };

  // Same three failures but tests reported in a different order, and error
  // prose carrying different bundle line:col (simulating build rotation).
  const cycle3 = {
    kind: "playwright-json" as const,
    total: 3,
    passed: 0,
    failed: 3,
    skipped: 0,
    failedTests: [
      {
        title: "quick-view-modal-shows-product-details",
        file: "e2e/product-quick-view.spec.ts",
        line: 20,
        error:
          "TimeoutError: locator.waitFor: Timeout 5000ms exceeded.\n    waiting for getByTestId('quick-view-modal') to be visible\n    at vendor.js:98765:4321",
        stackHead: "    at e2e/product-quick-view.spec.ts:22:30",
      },
      {
        title: "quick-view-open-and-load",
        file: "e2e/product-quick-view.spec.ts",
        line: 10,
        error:
          "TimeoutError: locator.waitFor: Timeout 5000ms exceeded.\n    waiting for getByTestId('quick-view-modal') to be visible\n    at main.js:11111:222",
        stackHead: "    at e2e/product-quick-view.spec.ts:12:30",
      },
    ],
    uncaughtErrors: [],
    consoleErrors: [],
    failedRequests: [],
  };

  it("returns null for non-playwright payloads", () => {
    assert.equal(computeStructuredSignature(null), null);
    assert.equal(computeStructuredSignature({ kind: "other" }), null);
    assert.equal(computeStructuredSignature("string"), null);
  });

  it("returns a stable 16-hex signature for a playwright-json failure set", () => {
    const sig = computeStructuredSignature(cycle1);
    assert.ok(sig);
    assert.match(sig!, /^[0-9a-f]{16}$/);
  });

  it("hashes identically across builds despite rotating bundle line:col and test-order shuffling", () => {
    const a = computeStructuredSignature(cycle1);
    const b = computeStructuredSignature(cycle3);
    assert.equal(a, b, "rotating bundle frames must not change the signature");
  });

  it("differs when the failing testid locator changes", () => {
    const diff = {
      ...cycle1,
      failedTests: cycle1.failedTests.map((t) => ({
        ...t,
        error: t.error.replace("quick-view-modal", "some-other-modal"),
      })),
    };
    assert.notEqual(
      computeStructuredSignature(cycle1),
      computeStructuredSignature(diff),
    );
  });

  it("differs when the error class changes", () => {
    const diff = {
      ...cycle1,
      failedTests: cycle1.failedTests.map((t) => ({
        ...t,
        error: t.error.replace("TimeoutError", "TypeError"),
      })),
    };
    assert.notEqual(
      computeStructuredSignature(cycle1),
      computeStructuredSignature(diff),
    );
  });

  it("returns null when there are no failures", () => {
    const green = { ...cycle1, failed: 0, failedTests: [] };
    assert.equal(computeStructuredSignature(green), null);
  });
});

describe("parsePlaywrightReport — Level-1 screenshot evidence", () => {
  function makeReport(attachments: unknown[], title = "shows modal") {
    return {
      stats: { expected: 0, unexpected: 1, skipped: 0, flaky: 0 },
      suites: [
        {
          file: "e2e/product-quick-view.spec.ts",
          specs: [
            {
              title,
              file: "e2e/product-quick-view.spec.ts",
              line: 10,
              tests: [
                {
                  status: "unexpected",
                  results: [
                    {
                      status: "failed",
                      errors: [{ message: "TimeoutError: locator.waitFor" }],
                      attachments,
                      stdout: [],
                      stderr: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it("copies on-disk screenshot attachments into <slug>_evidence/", () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pw-app-"));
    const slug = "product-quick-view";
    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-src-"));
    const screenshot = path.join(srcDir, "test-failed-1.png");
    fs.writeFileSync(screenshot, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const report = makeReport([
      { name: "screenshot", contentType: "image/png", path: screenshot },
    ]);
    const p = writeTmp("evidence.json", JSON.stringify(report));
    const parsed = parsePlaywrightReport(p, { appRoot, slug });
    assert.ok(parsed);
    const atts = parsed!.failedTests[0].attachments ?? [];
    assert.equal(atts.length, 1);
    assert.equal(atts[0].name, "screenshot");
    assert.equal(atts[0].contentType, "image/png");
    assert.match(atts[0].path, /product-quick-view_evidence\/0-screenshot\.png$/);
    assert.ok(fs.existsSync(atts[0].path), "copied evidence file should exist on disk");
  });

  it("skips binary attachments whose source file is missing", () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pw-app-"));
    const report = makeReport([
      { name: "screenshot", contentType: "image/png", path: "/no/such/path.png" },
    ]);
    const p = writeTmp("missing.json", JSON.stringify(report));
    const parsed = parsePlaywrightReport(p, { appRoot, slug: "feat" });
    assert.ok(parsed);
    assert.deepEqual(parsed!.failedTests[0].attachments, []);
  });

  it("redacts evidence from account/checkout/login specs", () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pw-app-"));
    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-src-"));
    const screenshot = path.join(srcDir, "fail.png");
    fs.writeFileSync(screenshot, "png");
    const report = makeReport(
      [{ name: "screenshot", contentType: "image/png", path: screenshot }],
      "completes checkout flow",
    );
    const p = writeTmp("redact.json", JSON.stringify(report));
    const parsed = parsePlaywrightReport(p, { appRoot, slug: "feat" });
    assert.ok(parsed);
    assert.deepEqual(parsed!.failedTests[0].attachments, []);
    assert.equal(
      fs.existsSync(path.join(appRoot, "in-progress", "feat_evidence")),
      false,
      "evidence dir should not be created when everything is redacted",
    );
  });

  it("skips evidence harvesting when appRoot/slug options are not supplied", () => {
    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-src-"));
    const screenshot = path.join(srcDir, "fail.png");
    fs.writeFileSync(screenshot, "png");
    const report = makeReport([
      { name: "screenshot", contentType: "image/png", path: screenshot },
    ]);
    const p = writeTmp("no-opts.json", JSON.stringify(report));
    const parsed = parsePlaywrightReport(p);
    assert.ok(parsed);
    assert.deepEqual(parsed!.failedTests[0].attachments, []);
  });

  it("still decodes text attachments (console-errors) alongside binary evidence", () => {
    const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pw-app-"));
    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), "pw-src-"));
    const screenshot = path.join(srcDir, "fail.png");
    fs.writeFileSync(screenshot, "png");
    const report = makeReport([
      { name: "screenshot", contentType: "image/png", path: screenshot },
      {
        name: "console-errors",
        contentType: "text/plain",
        body: Buffer.from("hydration mismatch on <div>").toString("base64"),
      },
    ]);
    const p = writeTmp("mixed.json", JSON.stringify(report));
    const parsed = parsePlaywrightReport(p, { appRoot, slug: "feat" });
    assert.ok(parsed);
    assert.equal(parsed!.failedTests[0].attachments?.length, 1);
    assert.ok(parsed!.consoleErrors.some((l) => /hydration mismatch/.test(l)));
  });
});
