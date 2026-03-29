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
import { rmSync, existsSync, readFileSync } from "node:fs";
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
    const msg = JSON.stringify({ fault_domain: "database", diagnostic_trace: "test" });
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

  it("accepts infra fault domain for poll-infra-plan", () => {
    const msg = JSON.stringify({ fault_domain: "infra", diagnostic_trace: "terraform plan failed" });
    const result = runCli(`fail ${TEST_SLUG} poll-infra-plan '${msg}'`);
    assert.equal(result.exitCode, 0, `Unexpected failure: ${result.stderr}`);
    assert.ok(result.stdout.includes("Recorded failure"), `stdout: ${result.stdout}`);
  });
});

// ---------------------------------------------------------------------------
// Non-post-deploy, non-test items: accept any message (no validation)
// ---------------------------------------------------------------------------

describe("cmdFail CLI validation — non-post-deploy/test items", () => {
  it("accepts plain text for backend-dev", () => {
    const result = runCli(`fail ${TEST_SLUG} backend-dev "TypeScript compilation failed"`);
    assert.equal(result.exitCode, 0, `Unexpected failure: ${result.stderr}`);
  });

  it("requires structured JSON for frontend-unit-test (test items use Zod gate)", () => {
    // Plain text should be rejected
    const plain = runCli(`fail ${TEST_SLUG} frontend-unit-test "Jest tests failed: 3 failures"`);
    assert.equal(plain.exitCode, 1, `Expected rejection of plain text, got exit 0`);
    // Valid JSON should be accepted
    const msg = JSON.stringify({ fault_domain: "frontend", diagnostic_trace: "Jest tests failed: 3 failures" });
    const json = runCli(`fail ${TEST_SLUG} frontend-unit-test '${msg}'`);
    assert.equal(json.exitCode, 0, `Unexpected failure: ${json.stderr}`);
  });

  it("accepts plain text for push-app", () => {
    const result = runCli(`fail ${TEST_SLUG} push-app "git push rejected"`);
    assert.equal(result.exitCode, 0, `Unexpected failure: ${result.stderr}`);
  });
});

// ---------------------------------------------------------------------------
// salvageForDraft — Graceful Degradation state salvage
// ---------------------------------------------------------------------------

describe("salvageForDraft — graceful degradation", () => {
  const SALVAGE_SLUG = `__test-salvage-${Date.now()}`;
  const stateFile = join(APP_ROOT, "in-progress", `${SALVAGE_SLUG}_STATE.json`);

  /** Helper: read the raw state JSON from disk. */
  function readTestState(): {
    items: Array<{ key: string; status: string }>;
    errorLog: Array<{ itemKey: string; message: string }>;
  } {
    return JSON.parse(readFileSync(stateFile, "utf-8"));
  }

  /** Helper: call salvageForDraft programmatically via a child process. */
  function callSalvage(slug: string, failedItemKey: string): { exitCode: number; stdout: string; stderr: string } {
    const script = `import("./pipeline-state.mjs").then(m => { const s = m.salvageForDraft("${slug}", "${failedItemKey}"); console.log(JSON.stringify({ items: s.items.length })); })`;
    try {
      const stdout = execSync(`node --input-type=module -e '${script}'`, {
        cwd: join(__dirname, "../.."),
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
    const result = runCli(`init ${SALVAGE_SLUG} Full-Stack`);
    assert.equal(result.exitCode, 0, `Failed to init salvage test pipeline: ${result.stderr}`);

    // Simulate a realistic pipeline state: pre-deploy items done, push-app done, poll-app-ci pending
    for (const key of ["schema-dev", "infra-architect", "push-infra", "create-draft-pr", "poll-infra-plan", "await-infra-approval", "infra-handoff", "backend-dev", "frontend-dev", "backend-unit-test", "frontend-unit-test", "push-app"]) {
      const r = runCli(`complete ${SALVAGE_SLUG} ${key}`);
      assert.equal(r.exitCode, 0, `Failed to complete ${key}: ${r.stderr}`);
    }
  });

  after(() => {
    for (const suffix of ["_STATE.json", "_TRANS.md"]) {
      const p = join(APP_ROOT, "in-progress", `${SALVAGE_SLUG}${suffix}`);
      if (existsSync(p)) rmSync(p);
    }
  });

  it("marks poll-app-ci, integration-test, live-ui, and code-cleanup as na", () => {
    const result = callSalvage(SALVAGE_SLUG, "poll-app-ci");
    assert.equal(result.exitCode, 0, `salvageForDraft failed: ${result.stderr}`);
    const state = readTestState();

    const expectedNa = ["poll-app-ci", "integration-test", "live-ui", "code-cleanup"];
    for (const key of expectedNa) {
      const item = state.items.find(i => i.key === key);
      assert.ok(item, `Item ${key} not found in state`);
      assert.equal(item.status, "na", `Expected ${key} to be "na" but got "${item.status}"`);
    }
  });

  it("leaves docs-archived and create-pr as pending", () => {
    const state = readTestState();

    const expectedPending = ["docs-archived", "publish-pr"];
    for (const key of expectedPending) {
      const item = state.items.find(i => i.key === key);
      assert.ok(item, `Item ${key} not found in state`);
      assert.equal(item.status, "pending", `Expected ${key} to be "pending" but got "${item.status}"`);
    }
  });

  it("logs exactly one salvage-draft entry in errorLog", () => {
    const state = readTestState();
    const salvageEntries = state.errorLog.filter(e => e.itemKey === "salvage-draft");
    assert.equal(salvageEntries.length, 1, `Expected 1 salvage-draft entry, got ${salvageEntries.length}`);
    assert.ok(
      salvageEntries[0].message.includes("poll-app-ci"),
      `salvage-draft message should mention poll-app-ci: ${salvageEntries[0].message}`,
    );
  });

  it("is idempotent — second call is a no-op", () => {
    const stateBefore = readTestState();
    const logCountBefore = stateBefore.errorLog.length;

    callSalvage(SALVAGE_SLUG, "poll-app-ci");
    const stateAfter = readTestState();

    assert.equal(stateAfter.errorLog.length, logCountBefore, "Idempotent call should not add a new errorLog entry");
  });
});

// ---------------------------------------------------------------------------
// salvageForDraft — defensive reset of stale failures
// ---------------------------------------------------------------------------

describe("salvageForDraft — defensive reset of stale failures", () => {
  const STALE_SLUG = `__test-salvage-stale-${Date.now()}`;
  const stateFile = join(APP_ROOT, "in-progress", `${STALE_SLUG}_STATE.json`);

  function readTestState(): {
    items: Array<{ key: string; status: string; error: string | null }>;
    errorLog: Array<{ itemKey: string; message: string }>;
  } {
    return JSON.parse(readFileSync(stateFile, "utf-8"));
  }

  function callSalvage(slug: string, failedItemKey: string): { exitCode: number; stdout: string; stderr: string } {
    const script = `import("./pipeline-state.mjs").then(m => { const s = m.salvageForDraft("${slug}", "${failedItemKey}"); console.log(JSON.stringify({ items: s.items.length })); })`;
    try {
      const stdout = execSync(`node --input-type=module -e '${script}'`, {
        cwd: join(__dirname, "../.."),
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
    const result = runCli(`init ${STALE_SLUG} Full-Stack`);
    assert.equal(result.exitCode, 0, `Failed to init stale test pipeline: ${result.stderr}`);

    // Complete pre-deploy + push-app
    for (const key of ["schema-dev", "infra-architect", "push-infra", "create-draft-pr", "poll-infra-plan", "await-infra-approval", "infra-handoff", "backend-dev", "frontend-dev", "backend-unit-test", "frontend-unit-test", "push-app"]) {
      const r = runCli(`complete ${STALE_SLUG} ${key}`);
      assert.equal(r.exitCode, 0, `Failed to complete ${key}: ${r.stderr}`);
    }

    // Simulate a prior publish-pr failure (e.g., GitHub API rate limit)
    const r = runCli(`fail ${STALE_SLUG} publish-pr "GitHub API rate limit exceeded"`);
    assert.equal(r.exitCode, 0, `Failed to fail create-pr: ${r.stderr}`);
  });

  after(() => {
    for (const suffix of ["_STATE.json", "_TRANS.md"]) {
      const p = join(APP_ROOT, "in-progress", `${STALE_SLUG}${suffix}`);
      if (existsSync(p)) rmSync(p);
    }
  });

  it("resets a previously-failed publish-pr back to pending with null error", () => {
    // Verify publish-pr is currently failed
    const before = readTestState();
    const prBefore = before.items.find(i => i.key === "publish-pr");
    assert.equal(prBefore?.status, "failed", "Precondition: publish-pr should be failed");
    assert.ok(prBefore?.error, "Precondition: publish-pr should have an error message");

    const result = callSalvage(STALE_SLUG, "poll-app-ci");
    assert.equal(result.exitCode, 0, `salvageForDraft failed: ${result.stderr}`);

    const after = readTestState();
    const prAfter = after.items.find(i => i.key === "publish-pr");
    assert.equal(prAfter?.status, "pending", `Expected publish-pr to be "pending" but got "${prAfter?.status}"`);
    assert.equal(prAfter?.error, null, "Expected publish-pr error to be null after salvage");

    const docsAfter = after.items.find(i => i.key === "docs-archived");
    assert.equal(docsAfter?.status, "pending", `Expected docs-archived to be \"pending\" but got \"${docsAfter?.status}\"`);
  });
});

// ---------------------------------------------------------------------------
// salvageForDraft — infra-architect permission escalation
// ---------------------------------------------------------------------------

describe("salvageForDraft — infra-architect permission escalation", () => {
  const INFRA_SLUG = `__test-salvage-infra-${Date.now()}`;
  const stateFile = join(APP_ROOT, "in-progress", `${INFRA_SLUG}_STATE.json`);

  function readTestState(): {
    items: Array<{ key: string; status: string }>;
    errorLog: Array<{ itemKey: string; message: string }>;
  } {
    return JSON.parse(readFileSync(stateFile, "utf-8"));
  }

  function callSalvage(slug: string, failedItemKey: string): { exitCode: number; stdout: string; stderr: string } {
    const script = `import("./pipeline-state.mjs").then(m => { const s = m.salvageForDraft("${slug}", "${failedItemKey}"); console.log(JSON.stringify({ items: s.items.length })); })`;
    try {
      const stdout = execSync(`node --input-type=module -e '${script}'`, {
        cwd: join(__dirname, "../.."),
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
    const result = runCli(`init ${INFRA_SLUG} Full-Stack`);
    assert.equal(result.exitCode, 0, `Failed to init infra test pipeline: ${result.stderr}`);

    // Simulate realistic state: schema-dev done, infra-architect done (code is correct,
    // but terraform apply failed with permissions — session-runner marks it "done" before salvage)
    for (const key of ["schema-dev", "infra-architect"]) {
      const r = runCli(`complete ${INFRA_SLUG} ${key}`);
      assert.equal(r.exitCode, 0, `Failed to complete ${key}: ${r.stderr}`);
    }
  });

  after(() => {
    for (const suffix of ["_STATE.json", "_TRANS.md"]) {
      const p = join(APP_ROOT, "in-progress", `${INFRA_SLUG}${suffix}`);
      if (existsSync(p)) rmSync(p);
    }
  });

  it("preserves infra-architect as 'done' and skips remaining infra + Wave 2 items", () => {
    const result = callSalvage(INFRA_SLUG, "infra-architect");
    assert.equal(result.exitCode, 0, `salvageForDraft failed: ${result.stderr}`);
    const state = readTestState();

    // infra-architect should remain "done" (protected by item.status !== "done" guard)
    const ia = state.items.find(i => i.key === "infra-architect");
    assert.equal(ia?.status, "done", "infra-architect should remain 'done' — code is correct");

    // Remaining infra wave items should be "na" (skipped for elevated apply)
    for (const key of ["push-infra", "create-draft-pr", "poll-infra-plan", "await-infra-approval", "infra-handoff"]) {
      const item = state.items.find(i => i.key === key);
      assert.equal(item?.status, "na", `Expected ${key} to be "na" but got "${item?.status}"`);
    }

    // Wave 2 items should be "na"
    for (const key of ["backend-dev", "frontend-dev", "backend-unit-test", "frontend-unit-test", "push-app", "poll-app-ci"]) {
      const item = state.items.find(i => i.key === key);
      assert.equal(item?.status, "na", `Expected ${key} to be "na" but got "${item?.status}"`);
    }

    // Standard post-deploy skips
    for (const key of ["integration-test", "live-ui", "code-cleanup"]) {
      const item = state.items.find(i => i.key === key);
      assert.equal(item?.status, "na", `Expected ${key} to be "na" but got "${item?.status}"`);
    }

    // docs-archived and create-pr should be pending (for draft PR creation)
    for (const key of ["docs-archived", "publish-pr"]) {
      const item = state.items.find(i => i.key === key);
      assert.equal(item?.status, "pending", `Expected ${key} to be "pending" but got "${item?.status}"`);
    }
  });

  it("logs salvage-draft entry mentioning infra-architect", () => {
    const state = readTestState();
    const salvageEntries = state.errorLog.filter(e => e.itemKey === "salvage-draft");
    assert.equal(salvageEntries.length, 1, `Expected 1 salvage-draft entry, got ${salvageEntries.length}`);
    assert.ok(
      salvageEntries[0].message.includes("infra-architect"),
      `salvage-draft message should mention infra-architect: ${salvageEntries[0].message}`,
    );
  });
});
