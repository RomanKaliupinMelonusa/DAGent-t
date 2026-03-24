/**
 * pipeline-fail-validation.test.ts — CLI-level Zod validation for pipeline:fail.
 *
 * Verifies that post-deploy items (live-ui, integration-test) require valid
 * TriageDiagnostic JSON, while non-post-deploy items accept any message.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/__tests__/pipeline-fail-validation.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Setup: create a temporary pipeline state so cmdFail has something to work with
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(__dirname, "../../pipeline-state.mjs");
const REPO_ROOT = join(__dirname, "../../../..");
const APP_ROOT = process.env.TEST_APP_ROOT
  ? join(REPO_ROOT, process.env.TEST_APP_ROOT)
  : join(REPO_ROOT, "apps/sample-app");

const TEST_SLUG = `__test-cli-validation-${Date.now()}`;

/** Run the pipeline-state.mjs CLI and return { exitCode, stderr, stdout }. */
function runCli(args: string): { exitCode: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync(`node ${SCRIPT} ${args}`, {
      cwd: REPO_ROOT,
      env: { ...process.env, APP_ROOT },
      encoding: "utf-8",
      timeout: 10_000,
    });
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status: number; stdout: string; stderr: string };
    return { exitCode: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

before(() => {
  // Initialize a Full-Stack pipeline state for testing
  const result = runCli(`init ${TEST_SLUG} Full-Stack`);
  assert.equal(result.exitCode, 0, `Failed to init test pipeline: ${result.stderr}`);
});

after(() => {
  // Clean up test state files
  const inProgress = join(APP_ROOT, "in-progress");
  for (const suffix of ["_STATE.json", "_TRANS.md"]) {
    const p = join(inProgress, `${TEST_SLUG}${suffix}`);
    if (existsSync(p)) rmSync(p);
  }
});

// ---------------------------------------------------------------------------
// Post-deploy items: must supply valid TriageDiagnostic JSON
// ---------------------------------------------------------------------------

describe("cmdFail CLI validation — post-deploy items", () => {
  it("rejects plain text message for live-ui", () => {
    const result = runCli(`fail ${TEST_SLUG} live-ui "something broke"`);
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes("requires a valid JSON"), `stderr: ${result.stderr}`);
  });

  it("rejects malformed JSON for integration-test", () => {
    const result = runCli(`fail ${TEST_SLUG} integration-test "{not json}"`);
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes("requires a valid JSON"), `stderr: ${result.stderr}`);
  });

  it("rejects JSON with invalid fault_domain", () => {
    const msg = JSON.stringify({ fault_domain: "infra", diagnostic_trace: "test" });
    const result = runCli(`fail ${TEST_SLUG} live-ui '${msg}'`);
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes("schema validation"), `stderr: ${result.stderr}`);
  });

  it("rejects JSON with missing diagnostic_trace", () => {
    const msg = JSON.stringify({ fault_domain: "backend" });
    const result = runCli(`fail ${TEST_SLUG} live-ui '${msg}'`);
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes("schema validation"), `stderr: ${result.stderr}`);
  });

  it("rejects JSON with empty diagnostic_trace", () => {
    const msg = JSON.stringify({ fault_domain: "backend", diagnostic_trace: "" });
    const result = runCli(`fail ${TEST_SLUG} live-ui '${msg}'`);
    assert.notEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes("schema validation"), `stderr: ${result.stderr}`);
  });

  it("accepts valid TriageDiagnostic JSON for live-ui", () => {
    const msg = JSON.stringify({ fault_domain: "frontend", diagnostic_trace: "Button not found" });
    const result = runCli(`fail ${TEST_SLUG} live-ui '${msg}'`);
    assert.equal(result.exitCode, 0, `Unexpected failure: ${result.stderr}`);
    assert.ok(result.stdout.includes("Recorded failure"), `stdout: ${result.stdout}`);
  });

  it("accepts valid TriageDiagnostic JSON for integration-test", () => {
    const msg = JSON.stringify({ fault_domain: "backend", diagnostic_trace: "API 500 on /api/jobs" });
    const result = runCli(`fail ${TEST_SLUG} integration-test '${msg}'`);
    assert.equal(result.exitCode, 0, `Unexpected failure: ${result.stderr}`);
    assert.ok(result.stdout.includes("Recorded failure"), `stdout: ${result.stdout}`);
  });

  it("accepts frontend+infra fault domain for live-ui", () => {
    const msg = JSON.stringify({ fault_domain: "frontend+infra", diagnostic_trace: "APIM route mismatch" });
    const result = runCli(`fail ${TEST_SLUG} live-ui '${msg}'`);
    assert.equal(result.exitCode, 0, `Unexpected failure: ${result.stderr}`);
    assert.ok(result.stdout.includes("Recorded failure"), `stdout: ${result.stdout}`);
  });

  it("accepts backend+infra fault domain for integration-test", () => {
    const msg = JSON.stringify({ fault_domain: "backend+infra", diagnostic_trace: "Function app missing env var" });
    const result = runCli(`fail ${TEST_SLUG} integration-test '${msg}'`);
    assert.equal(result.exitCode, 0, `Unexpected failure: ${result.stderr}`);
    assert.ok(result.stdout.includes("Recorded failure"), `stdout: ${result.stdout}`);
  });
});

// ---------------------------------------------------------------------------
// Non-post-deploy items: accept any message (no validation)
// ---------------------------------------------------------------------------

describe("cmdFail CLI validation — non-post-deploy items", () => {
  it("accepts plain text for backend-dev", () => {
    const result = runCli(`fail ${TEST_SLUG} backend-dev "TypeScript compilation failed"`);
    assert.equal(result.exitCode, 0, `Unexpected failure: ${result.stderr}`);
  });

  it("accepts plain text for frontend-unit-test", () => {
    const result = runCli(`fail ${TEST_SLUG} frontend-unit-test "Jest tests failed: 3 failures"`);
    assert.equal(result.exitCode, 0, `Unexpected failure: ${result.stderr}`);
  });

  it("accepts plain text for push-code", () => {
    const result = runCli(`fail ${TEST_SLUG} push-code "git push rejected"`);
    assert.equal(result.exitCode, 0, `Unexpected failure: ${result.stderr}`);
  });
});
