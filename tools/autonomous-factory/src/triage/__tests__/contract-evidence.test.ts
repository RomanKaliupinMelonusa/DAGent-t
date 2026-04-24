/**
 * Tests for triage/contract-evidence.ts (D3).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadContractEvidence, prependContractEvidence } from "../contract-evidence.js";

function makeApp(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-"));
  fs.mkdirSync(path.join(dir, "in-progress"), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    const target = path.join(dir, "in-progress", name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body, "utf-8");
  }
  return dir;
}

describe("triage/contract-evidence", () => {
  it("returns an empty block when no artifacts exist", () => {
    const dir = makeApp({});
    const r = loadContractEvidence(dir, "pqv");
    assert.equal(r.text, "");
    assert.deepEqual(r.sources, []);
  });

  it("renders the VALIDATION artifact when present", () => {
    const dir = makeApp({
      "pqv/_validation.json": JSON.stringify({ outcome: "fail", violations: [{ title: "flow-1", message: "Uncaught TypeError" }] }, null, 2),
    });
    const r = loadContractEvidence(dir, "pqv");
    assert.match(r.text, /### Contract evidence/);
    assert.match(r.text, /Acceptance Oracle Verdict/);
    assert.match(r.text, /Uncaught TypeError/);
    assert.deepEqual(r.sources, [path.join("in-progress", "pqv/_validation.json")]);
  });

  it("renders both VALIDATION and QA-REPORT when both exist", () => {
    const dir = makeApp({
      "pqv/_validation.json": JSON.stringify({ outcome: "fail", violations: [] }),
      "pqv/_qa-report.json": JSON.stringify({ outcome: "fail", probes_run: 3, violations: [{ probe: "rapid-click" }] }),
    });
    const r = loadContractEvidence(dir, "pqv");
    assert.match(r.text, /Acceptance Oracle Verdict/);
    assert.match(r.text, /QA Adversary Report/);
    assert.match(r.text, /rapid-click/);
    assert.equal(r.sources.length, 2);
  });

  it("silently skips unreadable/missing artifacts", () => {
    const dir = makeApp({ "pqv/_qa-report.json": JSON.stringify({ outcome: "pass", violations: [] }) });
    const r = loadContractEvidence(dir, "pqv");
    assert.equal(r.sources.length, 1);
    assert.match(r.text, /QA Adversary Report/);
    assert.doesNotMatch(r.text, /Acceptance Oracle Verdict/);
  });

  it("handles missing appRoot/slug without throwing", () => {
    assert.deepEqual(loadContractEvidence("", "pqv"), { text: "", sources: [] });
    assert.deepEqual(loadContractEvidence("/nope", ""), { text: "", sources: [] });
  });

  it("prepends evidence to raw error when artifacts exist", () => {
    const dir = makeApp({ "pqv/_validation.json": JSON.stringify({ outcome: "fail" }) });
    const raw = "Test timed out after 60000ms";
    const { trace, sources } = prependContractEvidence(raw, dir, "pqv");
    assert.ok(trace.indexOf("### Contract evidence") < trace.indexOf("### Raw failure output"));
    assert.match(trace, /Test timed out after 60000ms/);
    assert.equal(sources.length, 1);
  });

  it("returns the raw trace unchanged when no artifacts exist", () => {
    const dir = makeApp({});
    const raw = "something broke";
    const { trace, sources } = prependContractEvidence(raw, dir, "pqv");
    assert.equal(trace, raw);
    assert.deepEqual(sources, []);
  });

  it("truncates very large artifacts", () => {
    const big = "x".repeat(10_000);
    const dir = makeApp({ "pqv/_validation.json": big });
    const r = loadContractEvidence(dir, "pqv");
    assert.match(r.text, /truncated/);
    // Block must be bounded (4 KB per file + markdown scaffolding).
    assert.ok(r.text.length < 6_000, `block length ${r.text.length} too large`);
  });
});
