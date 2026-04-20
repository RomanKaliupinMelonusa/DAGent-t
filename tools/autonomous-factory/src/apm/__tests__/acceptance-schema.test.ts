import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AcceptanceContractSchema,
  loadAcceptanceContract,
  hashAcceptanceContract,
  AcceptanceParseError,
} from "../acceptance-schema.js";

function tmpFile(name: string, body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acceptance-test-"));
  const p = path.join(dir, name);
  fs.writeFileSync(p, body, "utf-8");
  return p;
}

describe("AcceptanceContractSchema", () => {
  it("accepts a minimal valid contract and applies defaults", () => {
    const parsed = AcceptanceContractSchema.parse({
      feature: "demo",
      summary: "A demo feature.",
    });
    assert.equal(parsed.feature, "demo");
    assert.deepEqual(parsed.required_dom, []);
    assert.deepEqual(parsed.required_flows, []);
    // built-in forbidden patterns are populated by default
    assert.ok(parsed.forbidden_console_patterns.length >= 2);
    assert.deepEqual(parsed.base_template_reuse, []);
  });

  it("rejects a contract missing `feature`", () => {
    const r = AcceptanceContractSchema.safeParse({ summary: "x" });
    assert.equal(r.success, false);
  });

  it("rejects a flow with zero steps", () => {
    const r = AcceptanceContractSchema.safeParse({
      feature: "demo",
      summary: "x",
      required_flows: [{ name: "f", description: "d", steps: [] }],
    });
    assert.equal(r.success, false);
  });

  it("rejects an unknown flow-step action", () => {
    const r = AcceptanceContractSchema.safeParse({
      feature: "demo",
      summary: "x",
      required_flows: [{
        name: "f",
        description: "d",
        steps: [{ action: "teleport", testid: "nope" }],
      }],
    });
    assert.equal(r.success, false);
  });
});

describe("loadAcceptanceContract", () => {
  it("parses a well-formed YAML file", () => {
    const p = tmpFile("ACC.yml", `
feature: quick-view
summary: A quick-view modal.
required_dom:
  - testid: product-name-modal
    description: Name of the product shown in the modal
    requires_non_empty_text: true
required_flows:
  - name: open-modal
    description: Click tile opens modal
    steps:
      - { action: goto, url: "/" }
      - { action: click, testid: quick-view-tile-button }
      - { action: assert_visible, testid: product-name-modal, timeout_ms: 10000 }
forbidden_network_failures:
  - "GET /mobify/proxy/api/.*/products/.*"
base_template_reuse:
  - symbol: ProductViewModal
    package: "@salesforce/retail-react-app"
    rationale: Ships the modal UX out of the box.
`);
    const c = loadAcceptanceContract(p);
    assert.equal(c.feature, "quick-view");
    assert.equal(c.required_dom.length, 1);
    assert.equal(c.required_flows[0]!.steps.length, 3);
    assert.equal(c.base_template_reuse.length, 1);
  });

  it("throws AcceptanceParseError on missing file", () => {
    assert.throws(
      () => loadAcceptanceContract("/tmp/does-not-exist-acceptance.yml"),
      (err: unknown) => err instanceof AcceptanceParseError,
    );
  });

  it("throws AcceptanceParseError on schema violation", () => {
    const p = tmpFile("bad.yml", `feature: ""\nsummary: ""\n`);
    assert.throws(
      () => loadAcceptanceContract(p),
      (err: unknown) => err instanceof AcceptanceParseError,
    );
  });
});

describe("hashAcceptanceContract", () => {
  it("is deterministic for equivalent contracts", () => {
    const a = AcceptanceContractSchema.parse({ feature: "x", summary: "s" });
    const b = AcceptanceContractSchema.parse({ feature: "x", summary: "s" });
    assert.equal(hashAcceptanceContract(a), hashAcceptanceContract(b));
  });

  it("changes when a field changes", () => {
    const a = AcceptanceContractSchema.parse({ feature: "x", summary: "s" });
    const b = AcceptanceContractSchema.parse({ feature: "x", summary: "s2" });
    assert.notEqual(hashAcceptanceContract(a), hashAcceptanceContract(b));
  });
});
