/**
 * triage/__tests__/llm-router-resilience.test.ts — retry + halt-on-unavailable.
 *
 * Locks the resilient classification contract:
 *   1. A single bad LLM response triggers exactly one stricter retry
 *      with a halved timeout.
 *   2. When BOTH attempts fail (parse error / hallucinated domain /
 *      transport error / baseline-only rejection), the router halts
 *      the run with `fault_domain: "blocked"` and a `reason` carrying
 *      `llm-unavailable` — it never inherits a prior cycle's verdict.
 *      Phase 2 of the LLM-Unavailable Fallback Policy removed the
 *      previous `inheritPriorVerdict()` step because it produced
 *      cycle-2 mis-routes in the `product-quick-view-plp` run when
 *      evidence shifted between cycles (test-code noise vs. genuine
 *      code defect).
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { askLlmRouter } from "../llm-router.js";
import type { TriageLlm, TriageLlmRequest } from "../../ports/triage-llm.js";
import type { PriorAttempt } from "../historian.js";

const DOMAINS = ["frontend", "backend", "test-code", "infra"];
const ROUTING = {
  frontend: { description: "UI" },
  backend: { description: "API" },
  "test-code": { description: "spec bug" },
  infra: { description: "infra" },
};
const TRACE = "TimeoutError: locator.waitFor timed out";
const SLUG = "resilience-test";

let TMP_APP_ROOT: string;

before(() => {
  TMP_APP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "llm-router-resilience-"));
  fs.mkdirSync(path.join(TMP_APP_ROOT, ".dagent"), { recursive: true });
});

after(() => {
  if (TMP_APP_ROOT) fs.rmSync(TMP_APP_ROOT, { recursive: true, force: true });
});

/** Deterministic scripted LLM. Each `responses[i]` is what the i-th
 *  classify() call returns; once exhausted, throws. Tracks invocation
 *  count + timeouts for assertions on the retry contract. */
function scriptedLlm(responses: string[]): TriageLlm & { calls: TriageLlmRequest[] } {
  const calls: TriageLlmRequest[] = [];
  return {
    calls,
    async classify(req: TriageLlmRequest): Promise<string> {
      calls.push(req);
      if (calls.length > responses.length) {
        throw new Error(`unexpected classify call #${calls.length}`);
      }
      const r = responses[calls.length - 1];
      if (r === "__throw__") throw new Error("simulated transport failure");
      return r;
    },
  };
}

const priorAttempt = (
  cycle: number,
  failingItemKey: string,
  domain: string,
): PriorAttempt => ({
  cycle,
  timestamp: `t${cycle}`,
  resetReason: `[domain:${domain}] prior cycle reason`,
  resultingSignature: null,
  failingItemKey,
  errorPreview: "",
});

describe("askLlmRouter — A3 resilience", () => {
  it("recovers when first call returns no JSON and the retry succeeds", async () => {
    const llm = scriptedLlm([
      "this is just prose, no JSON here",
      `{"fault_domain":"backend","reason":"server 500"}`,
    ]);
    const result = await askLlmRouter(
      llm, TRACE, DOMAINS, [], SLUG, TMP_APP_ROOT, ROUTING, null, [], "e2e-runner",
    );
    assert.equal(result.fault_domain, "backend");
    assert.equal(result.reason, "server 500");
    assert.equal(llm.calls.length, 2, "retry must fire on parse failure");
    assert.equal(llm.calls[1].timeoutMs, 30_000, "retry must use halved timeout");
    assert.match(llm.calls[1].systemMessage, /previous response was rejected/);
  });

  it("recovers when first call hallucinates a domain and retry succeeds", async () => {
    const llm = scriptedLlm([
      `{"fault_domain":"definitely-not-a-real-domain","reason":"x"}`,
      `{"fault_domain":"frontend","reason":"hydration"}`,
    ]);
    const result = await askLlmRouter(
      llm, TRACE, DOMAINS, [], SLUG, TMP_APP_ROOT, ROUTING, null, [], "e2e-runner",
    );
    assert.equal(result.fault_domain, "frontend");
    assert.equal(llm.calls.length, 2);
    assert.match(llm.calls[1].systemMessage, /hallucinated/);
  });

  it("halts with blocked when both calls fail, even when a same-item prior attempt exists", async () => {
    // Phase 2 contract: the router MUST NOT inherit cycle 1's domain.
    // Evidence may have shifted between cycles, so re-using a stale
    // verdict silently produced cycle-2 mis-routes in the
    // `product-quick-view-plp` run.
    const llm = scriptedLlm([
      "garbage",
      `{"fault_domain":"still-bogus","reason":"x"}`,
    ]);
    const priors: PriorAttempt[] = [
      priorAttempt(1, "e2e-runner", "backend"),
    ];
    const result = await askLlmRouter(
      llm, TRACE, DOMAINS, [], SLUG, TMP_APP_ROOT, ROUTING, null, priors, "e2e-runner",
    );
    assert.equal(result.fault_domain, "blocked");
    assert.match(result.reason, /llm-unavailable/);
    assert.doesNotMatch(result.reason, /inherited from cycle/);
  });

  it("falls through to blocked when both calls fail and no prior attempts exist", async () => {
    const llm = scriptedLlm([
      "garbage",
      "still garbage",
    ]);
    const result = await askLlmRouter(
      llm, TRACE, DOMAINS, [], SLUG, TMP_APP_ROOT, ROUTING, null, [], "e2e-runner",
    );
    assert.equal(result.fault_domain, "blocked");
    assert.match(result.reason, /llm-unavailable/);
  });

  it("halts with blocked when prior verdict points to a now-disallowed domain", async () => {
    const llm = scriptedLlm([
      "__throw__",
      "__throw__",
    ]);
    // `legacy-domain` is NOT in DOMAINS — and also no longer relevant
    // post Phase 2 since inheritance has been removed entirely.
    const priors: PriorAttempt[] = [
      priorAttempt(1, "e2e-runner", "legacy-domain"),
    ];
    const result = await askLlmRouter(
      llm, TRACE, DOMAINS, [], SLUG, TMP_APP_ROOT, ROUTING, null, priors, "e2e-runner",
    );
    assert.equal(result.fault_domain, "blocked");
    assert.match(result.reason, /llm-unavailable/);
  });

  it("does not inherit a prior verdict for a different failing item", async () => {
    const llm = scriptedLlm(["garbage", "garbage"]);
    const priors: PriorAttempt[] = [
      priorAttempt(1, "different-node", "backend"),
    ];
    const result = await askLlmRouter(
      llm, TRACE, DOMAINS, [], SLUG, TMP_APP_ROOT, ROUTING, null, priors, "e2e-runner",
    );
    assert.equal(result.fault_domain, "blocked");
    assert.match(result.reason, /llm-unavailable/);
  });

  it("reproduces product-quick-view-plp cycle 2: test-code noise must not inherit code-defect", async () => {
    // Cycle 1 was classified as `code-defect`. In cycle 2 the actual
    // failure is pure test-code noise (403 Forbidden console errors,
    // a locator timeout). Both LLM calls fail. The router MUST halt
    // with `blocked`, NOT inherit `code-defect` from cycle 1, and the
    // _NOVEL_TRIAGE.jsonl log must record `llm-unavailable → blocked`
    // with no `inherited from cycle N` entry.
    const cycle2Trace =
      "403 Forbidden\n" +
      "at console.error (page.html:1)\n" +
      "locator.waitFor: Timeout 30000ms exceeded.\n" +
      "  - waiting for getByTestId('product-card')";
    const llm = scriptedLlm(["__throw__", "__throw__"]);
    const priors: PriorAttempt[] = [
      {
        cycle: 1,
        timestamp: "t1",
        resetReason: "[domain:code-defect] cycle 1 verdict",
        resultingSignature: null,
        failingItemKey: "e2e-runner",
        errorPreview: "prior cycle preview",
      },
    ];

    // Use a unique slug so we can read its _NOVEL_TRIAGE.jsonl without
    // interference from other tests in this file.
    const slug = "product-quick-view-plp-cycle2";
    const result = await askLlmRouter(
      llm, cycle2Trace, ["code-defect", "test-code", "frontend", "infra"], [],
      slug, TMP_APP_ROOT,
      {
        "code-defect": { description: "genuine bug" },
        "test-code": { description: "spec bug" },
        frontend: { description: "UI" },
        infra: { description: "infra" },
      },
      null, priors, "e2e-runner",
    );

    assert.equal(result.fault_domain, "blocked", "must halt, not inherit code-defect");
    assert.notEqual(result.fault_domain, "code-defect");
    assert.match(result.reason, /llm-unavailable/);
    assert.doesNotMatch(result.reason, /inherited/);

    // Verify _NOVEL_TRIAGE.jsonl carries the blocked entry with full
    // evidence and no inheritance breadcrumb.
    const logPath = path.join(
      TMP_APP_ROOT, ".dagent", slug, "_novel-triage.jsonl",
    );
    assert.ok(fs.existsSync(logPath), `expected log file at ${logPath}`);
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n");
    const entries = lines.map((l) => JSON.parse(l));
    const blockedEntries = entries.filter(
      (e: { fault_domain: string }) => e.fault_domain === "blocked",
    );
    assert.ok(blockedEntries.length >= 1, "expected a blocked log entry");
    const blockedEntry = blockedEntries[blockedEntries.length - 1];
    assert.match(blockedEntry.reason, /llm-unavailable/);
    assert.ok(
      typeof blockedEntry.trace_excerpt === "string"
        && blockedEntry.trace_excerpt.includes("403 Forbidden"),
      "trace_excerpt must preserve actual evidence",
    );
    for (const e of entries) {
      assert.doesNotMatch(
        e.reason as string, /inherited from cycle/,
        "no entry should advertise inheritance post Phase 2",
      );
    }
  });

  it("succeeds on the first call without firing retry or inheritance", async () => {
    const llm = scriptedLlm([`{"fault_domain":"infra","reason":"flake"}`]);
    const result = await askLlmRouter(
      llm, TRACE, DOMAINS, [], SLUG, TMP_APP_ROOT, ROUTING, null,
      [priorAttempt(1, "e2e-runner", "frontend")],
      "e2e-runner",
    );
    assert.equal(result.fault_domain, "infra");
    assert.equal(llm.calls.length, 1);
  });

  it("does not attempt inheritance when failingNodeKey is omitted (back-compat)", async () => {
    const llm = scriptedLlm(["garbage", "garbage"]);
    const priors: PriorAttempt[] = [
      priorAttempt(1, "e2e-runner", "backend"),
    ];
    // No `failingNodeKey` argument — legacy call signature.
    const result = await askLlmRouter(
      llm, TRACE, DOMAINS, [], SLUG, TMP_APP_ROOT, ROUTING, null, priors,
    );
    assert.equal(result.fault_domain, "blocked");
  });
});
