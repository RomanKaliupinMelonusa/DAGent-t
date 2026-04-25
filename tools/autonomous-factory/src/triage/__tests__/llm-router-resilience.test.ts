/**
 * triage/__tests__/llm-router-resilience.test.ts — A3 retry + inheritance.
 *
 * Locks the resilient classification contract introduced after the
 * `product-quick-view-plp` run: a single bad LLM response must not
 * collapse the entire triage cycle to `blocked`. Instead the router
 *   1. retries once with a stricter prompt,
 *   2. inherits the prior cycle's verdict when both calls fail and
 *      `priorAttempts` carries a same-item `[domain:X]` tag,
 *   3. only falls through to `blocked` when neither path works.
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
  fs.mkdirSync(path.join(TMP_APP_ROOT, "in-progress"), { recursive: true });
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

  it("inherits prior verdict when both calls fail and a same-item attempt exists", async () => {
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
    assert.equal(result.fault_domain, "backend");
    assert.match(result.reason, /inherited from cycle 1/);
    assert.match(result.reason, /LLM classification unavailable/);
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
    assert.match(result.reason, /halting for human review/);
  });

  it("falls through to blocked when prior verdict points to a now-disallowed domain", async () => {
    const llm = scriptedLlm([
      "__throw__",
      "__throw__",
    ]);
    // `legacy-domain` is NOT in DOMAINS — must not be inherited.
    const priors: PriorAttempt[] = [
      priorAttempt(1, "e2e-runner", "legacy-domain"),
    ];
    const result = await askLlmRouter(
      llm, TRACE, DOMAINS, [], SLUG, TMP_APP_ROOT, ROUTING, null, priors, "e2e-runner",
    );
    assert.equal(result.fault_domain, "blocked");
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
