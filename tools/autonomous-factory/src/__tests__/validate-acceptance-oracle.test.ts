/**
 * Tests for tools/autonomous-factory/hooks/validate-acceptance.mjs.
 *
 * We cannot actually spawn Playwright in unit tests, so these tests exercise
 * the pure helpers (`renderSpec`, `extractViolations`, escapers) and the
 * contract-free fallback paths of `main` via tmp dirs.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

 
// @ts-ignore — .mjs has no .d.ts companion; this is a test-only import.
import * as oracle from "../../hooks/validate-acceptance.mjs";

describe("validate-acceptance.mjs: escapers", () => {
  it("escapeSingle handles quotes and backslashes", () => {
    assert.equal(oracle.escapeSingle("a'b"), "a\\'b");
    assert.equal(oracle.escapeSingle("c\\d"), "c\\\\d");
  });
  it("escapeRegexForLiteral escapes both", () => {
    assert.equal(oracle.escapeRegexForLiteral("\\d+"), "\\\\d+");
  });
});

describe("validate-acceptance.mjs: renderSpec", () => {
  const baseContract = {
    feature: "widget",
    summary: "widget modal",
    required_dom: [
      { testid: "widget-modal", requires_non_empty_text: true, contains_text: "Add" },
    ],
    required_flows: [
      {
        name: "open modal",
        steps: [
          { action: "goto", url: "/items/abc" },
          { action: "click", testid: "widget-button" },
          { action: "assert_visible", testid: "widget-modal", timeout_ms: 5000 },
          { action: "assert_text", testid: "widget-title", contains: "Shoe" },
          { action: "fill", testid: "qty-input", value: "2" },
        ],
      },
    ],
    forbidden_console_patterns: ["Uncaught TypeError"],
    forbidden_network_failures: ["POST /api/basket"],
  };

  it("emits a Playwright spec containing every required step", () => {
    const spec = oracle.renderSpec(baseContract);
    assert.match(spec, /import \{ test, expect \} from '@playwright\/test'/);
    assert.match(spec, /getByTestId\('widget-button'\)\.click/);
    assert.match(spec, /getByTestId\('qty-input'\)\.fill\('2'\)/);
    assert.match(spec, /getByTestId\('widget-modal'\)\).toBeVisible\(\{ timeout: 5000 \}\)/);
    assert.match(spec, /toContainText\('Shoe'\)/);
    assert.match(spec, /\/items\/abc/);
  });

  it("includes forbidden console + network assertions", () => {
    const spec = oracle.renderSpec(baseContract);
    assert.match(spec, /Uncaught TypeError/);
    assert.match(spec, /POST \/api\/basket/);
    assert.match(spec, /page\.on\('console'/);
    assert.match(spec, /page\.on\('pageerror'/);
    assert.match(spec, /requestfailed/);
  });

  it("escapes dangerous characters in testids and values", () => {
    const spec = oracle.renderSpec({
      ...baseContract,
      required_flows: [{
        name: "tricky",
        steps: [{ action: "fill", testid: "name", value: "O'Brien" }],
      }],
      required_dom: [],
    });
    assert.match(spec, /fill\('O\\'Brien'\)/);
  });

  it("emits the required_dom block when dom assertions are declared", () => {
    const spec = oracle.renderSpec(baseContract);
    assert.match(spec, /acceptance required DOM/);
    assert.match(spec, /empty text content/);
  });

  it("omits the required_dom block when dom is empty", () => {
    const spec = oracle.renderSpec({ ...baseContract, required_dom: [] });
    assert.doesNotMatch(spec, /acceptance required DOM/);
  });

  it("emits .first() on action steps declared with match: first", () => {
    const spec = oracle.renderSpec({
      ...baseContract,
      required_dom: [],
      required_flows: [{
        name: "multi",
        steps: [
          { action: "goto", url: "/plp" },
          { action: "assert_visible", testid: "qvb", match: "first", timeout_ms: 5000 },
          { action: "click", testid: "qvb", match: "first" },
        ],
      }],
    });
    assert.match(spec, /getByTestId\('qvb'\)\.first\(\)\.click\(\)/);
    assert.match(spec, /expect\(page\.getByTestId\('qvb'\)\.first\(\)\)\.toBeVisible/);
  });

  it("emits .nth(N) on action steps declared with match: nth", () => {
    const spec = oracle.renderSpec({
      ...baseContract,
      required_dom: [],
      required_flows: [{
        name: "nth",
        steps: [
          { action: "goto", url: "/plp" },
          { action: "click", testid: "tile", match: "nth", nth: 2 },
        ],
      }],
    });
    assert.match(spec, /getByTestId\('tile'\)\.nth\(2\)\.click\(\)/);
  });

  it("emits .first() in the DOM block when cardinality is 'many' and skips exact-text check", () => {
    const spec = oracle.renderSpec({
      ...baseContract,
      required_dom: [
        {
          testid: "wb",
          description: "widget button (one per list item)",
          cardinality: "many",
          requires_non_empty_text: true,
          contains_text: "Quick View",
        },
      ],
      required_flows: [],
    });
    assert.match(spec, /getByTestId\('wb'\)\.first\(\).*toBeVisible/);
    assert.match(spec, /getByTestId\('wb'\)\.first\(\)\)\.toContainText\('Quick View'\)/);
    // requires_non_empty_text is intentionally skipped for cardinality: many
    assert.doesNotMatch(spec, /required_dom qvb: empty text content/);
  });
});

describe("validate-acceptance.mjs: extractViolations", () => {
  it("returns null when the reporter file is missing", () => {
    assert.equal(oracle.extractViolations(path.join(os.tmpdir(), "does-not-exist.json")), null);
  });

  it("returns empty violations on an all-pass report", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oracle-"));
    const rpt = path.join(tmp, "r.json");
    fs.writeFileSync(rpt, JSON.stringify({
      suites: [{
        specs: [{
          title: "flow",
          file: "spec.ts",
          tests: [{ results: [{ status: "passed", errors: [] }] }],
        }],
      }],
    }));
    const res = oracle.extractViolations(rpt);
    assert.deepEqual(res.violations, []);
  });

  it("collects failures with messages", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oracle-"));
    const rpt = path.join(tmp, "r.json");
    fs.writeFileSync(rpt, JSON.stringify({
      suites: [{
        suites: [{
          specs: [{
            title: "flow A",
            file: "acc.spec.ts",
            tests: [{
              results: [{
                status: "failed",
                errors: [{ message: "Forbidden console pattern observed: Uncaught TypeError: x" }],
              }],
            }],
          }],
        }],
      }],
    }));
    const res = oracle.extractViolations(rpt);
    assert.equal(res.violations.length, 1);
    assert.equal(res.violations[0].title, "flow A");
    assert.equal(res.violations[0].status, "failed");
    assert.match(res.violations[0].message, /Uncaught TypeError/);
  });
});
