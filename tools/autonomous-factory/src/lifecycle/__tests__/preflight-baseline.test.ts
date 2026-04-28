/**
 * Tests for runPreflightBaseline (A2).
 *
 * Verifies that the pre-flight baseline hook:
 *  - No-ops when no hook is configured.
 *  - Skips (non-fatal) when BASE_BRANCH is unset.
 *  - Writes the parsed route→pass/fail map to /_kickoff/flight-data.json on success.
 *  - Ignores malformed stdout without throwing.
 *  - Merges into existing flight data instead of clobbering it.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { runPreflightBaseline } from "../preflight.js";
import type { ApmCompiledOutput } from "../../apm/types.js";

function makeCtx(hookCmd: string | undefined): ApmCompiledOutput {
  return {
    config: {
      // Only the bits runPreflightBaseline touches; cast to any to keep the
      // test ergonomic (the full ApmConfig has many unrelated required fields).
      hooks: hookCmd ? { preflightBaseline: hookCmd } : {},
      environment: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    workflows: {},
    agents: {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeTempAppRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "preflight-baseline-"));
  fs.mkdirSync(path.join(dir, ".dagent"), { recursive: true });
  return dir;
}

describe("runPreflightBaseline (A2)", () => {
  let appRoot = "";
  before(() => { appRoot = makeTempAppRoot(); });
  after(() => { fs.rmSync(appRoot, { recursive: true, force: true }); });

  it("returns null when no hook is configured", () => {
    const result = runPreflightBaseline("slug1", "main", "/tmp", appRoot, makeCtx(undefined));
    assert.equal(result, null);
  });

  it("skips when BASE_BRANCH is undefined", () => {
    const result = runPreflightBaseline("slug2", undefined, "/tmp", appRoot, makeCtx("echo ignored"));
    assert.equal(result, null);
  });

  it("parses JSON stdout and writes baselineValidation to flight data", () => {
    const slug = "slug3";
    const hookCmd = `printf '%s' '{"/":"pass","/category/foo":"fail"}'`;
    const result = runPreflightBaseline(slug, "main", "/tmp", appRoot, makeCtx(hookCmd));
    assert.deepEqual(result, { "/": "pass", "/category/foo": "fail" });

    const flightPath = path.join(appRoot, ".dagent", `${slug}/_kickoff/flight-data.json`);
    const on_disk = JSON.parse(fs.readFileSync(flightPath, "utf-8")) as Record<string, unknown>;
    assert.deepEqual(on_disk.baselineValidation, { "/": "pass", "/category/foo": "fail" });
  });

  it("returns null when stdout is not valid JSON (non-fatal)", () => {
    const slug = "slug4";
    const hookCmd = `echo "not-json"`;
    const result = runPreflightBaseline(slug, "main", "/tmp", appRoot, makeCtx(hookCmd));
    assert.equal(result, null);
  });

  it("merges into existing flight data without clobbering other keys", () => {
    const slug = "slug5";
    const flightPath = path.join(appRoot, ".dagent", `${slug}/_kickoff/flight-data.json`);
    fs.mkdirSync(path.dirname(flightPath), { recursive: true });
    fs.writeFileSync(flightPath, JSON.stringify({ existingKey: "keepme" }), "utf-8");

    const hookCmd = `printf '%s' '{"/home":"pass"}'`;
    runPreflightBaseline(slug, "main", "/tmp", appRoot, makeCtx(hookCmd));

    const on_disk = JSON.parse(fs.readFileSync(flightPath, "utf-8")) as Record<string, unknown>;
    assert.equal(on_disk.existingKey, "keepme");
    assert.deepEqual(on_disk.baselineValidation, { "/home": "pass" });
  });

  it("returns null and does not write when hook exits non-zero", () => {
    const slug = "slug6";
    const hookCmd = `echo boom && exit 2`;
    const result = runPreflightBaseline(slug, "main", "/tmp", appRoot, makeCtx(hookCmd));
    assert.equal(result, null);
    const flightPath = path.join(appRoot, ".dagent", `${slug}/_kickoff/flight-data.json`);
    assert.equal(fs.existsSync(flightPath), false);
  });
});
