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

  it("defaults required_dom cardinality to 'one' and step match to 'only'", () => {
    const parsed = AcceptanceContractSchema.parse({
      feature: "demo",
      summary: "x",
      required_dom: [{ testid: "tile", description: "a tile" }],
      required_flows: [{
        name: "f",
        description: "d",
        steps: [{ action: "click", testid: "btn" }],
      }],
    });
    assert.equal(parsed.required_dom[0]!.cardinality, "one");
    const step = parsed.required_flows[0]!.steps[0]! as { match: string; nth?: number };
    assert.equal(step.match, "only");
    assert.equal(step.nth, undefined);
  });

  it("accepts cardinality: many on required_dom", () => {
    const parsed = AcceptanceContractSchema.parse({
      feature: "demo",
      summary: "x",
      required_dom: [{ testid: "wb", description: "widget button", cardinality: "many" }],
    });
    assert.equal(parsed.required_dom[0]!.cardinality, "many");
  });

  it("accepts match: first on a click step", () => {
    const parsed = AcceptanceContractSchema.parse({
      feature: "demo",
      summary: "x",
      required_flows: [{
        name: "f",
        description: "d",
        steps: [{ action: "click", testid: "qvb", match: "first" }],
      }],
    });
    const step = parsed.required_flows[0]!.steps[0]! as { match: string };
    assert.equal(step.match, "first");
  });

  it("accepts match: nth with an nth index", () => {
    const parsed = AcceptanceContractSchema.parse({
      feature: "demo",
      summary: "x",
      required_flows: [{
        name: "f",
        description: "d",
        steps: [{ action: "assert_visible", testid: "tile", match: "nth", nth: 2 }],
      }],
    });
    const step = parsed.required_flows[0]!.steps[0]! as { match: string; nth: number };
    assert.equal(step.match, "nth");
    assert.equal(step.nth, 2);
  });

  it("rejects match: nth without an nth index", () => {
    const r = AcceptanceContractSchema.safeParse({
      feature: "demo",
      summary: "x",
      required_flows: [{
        name: "f",
        description: "d",
        steps: [{ action: "click", testid: "qvb", match: "nth" }],
      }],
    });
    assert.equal(r.success, false);
  });

  it("rejects nth when match is not 'nth'", () => {
    const r = AcceptanceContractSchema.safeParse({
      feature: "demo",
      summary: "x",
      required_flows: [{
        name: "f",
        description: "d",
        steps: [{ action: "click", testid: "qvb", match: "first", nth: 0 }],
      }],
    });
    assert.equal(r.success, false);
  });
});

describe("loadAcceptanceContract", () => {
  it("parses a well-formed YAML file", () => {
    const p = tmpFile("ACC.yml", `
feature: widget
summary: A widget modal.
required_dom:
  - testid: item-name-modal
    description: Name of the item shown in the modal
    requires_non_empty_text: true
required_flows:
  - name: open-modal
    description: Click tile opens modal
    steps:
      - { action: goto, url: "/" }
      - { action: click, testid: widget-tile-button }
      - { action: assert_visible, testid: item-name-modal, timeout_ms: 10000 }
forbidden_network_failures:
  - "GET /api/.*/items/.*"
base_template_reuse:
  - symbol: WidgetModal
    package: "@example/ui-kit"
    rationale: Ships the modal UX out of the box.
`);
    const c = loadAcceptanceContract(p);
    assert.equal(c.feature, "widget");
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
