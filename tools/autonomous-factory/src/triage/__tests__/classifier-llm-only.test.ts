/**
 * triage/__tests__/classifier-llm-only.test.ts
 *
 * Asserts that `profile.classifier === "llm-only"` causes `evaluateTriage`
 * to skip the RAG (layer 1) path entirely, even when the profile carries
 * signatures that would otherwise produce a high-confidence RAG match.
 *
 * This locks in the escape hatch used to disable RAG in the storefront
 * profile after RAG produced a misdiagnosis on a real Playwright failure
 * (matched on unrelated Salesforce analytics `net::ERR_NAME_NOT_RESOLVED`
 * noise in the error trace).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluateTriage } from "../index.js";
import type { TriageLlm } from "../../ports/triage-llm.js";

// LLM router appends to <appRoot>/in-progress/<slug>_NOVEL_TRIAGE.jsonl on
// every invocation; the directory must exist.
const TMP_APP_ROOT = mkdtempSync(join(tmpdir(), "triage-classifier-test-"));
mkdirSync(join(TMP_APP_ROOT, "in-progress"), { recursive: true });

function makeStubLlm(responseDomain: string, responseReason: string): TriageLlm {
  return {
    async classify() {
      return JSON.stringify({
        fault_domain: responseDomain,
        reason: responseReason,
      });
    },
  };
}

describe("evaluateTriage — classifier=llm-only", () => {
  it("skips RAG even when signatures would match, and invokes the LLM", async () => {
    const profile = {
      classifier: "llm-only",
      llm_fallback: false,
      max_reroutes: 5,
      routing: {
        frontend: { description: "UI errors" },
        environment: { description: "Transient infra glitches" },
      },
      signatures: [
        {
          error_snippet: "net::ERR_NAME_NOT_RESOLVED",
          fault_domain: "environment",
          reason: "DNS resolution failed",
        },
      ],
    };

    const trace =
      "TimeoutError: locator.waitFor: Timeout 30000ms exceeded waiting for locator\n" +
      "Side log: net::ERR_NAME_NOT_RESOLVED to c360a.salesforce.com";

    const llm = makeStubLlm("frontend", "Playwright assertion failed");
    const result = await evaluateTriage(trace, profile, llm, "slug", TMP_APP_ROOT);

    assert.equal(result.source, "llm", "LLM must be invoked, not RAG");
    assert.equal(result.domain, "frontend");
    // rag_matches MUST be empty because RAG was skipped.
    assert.deepEqual(result.rag_matches, []);
  });

  it("classifier=rag-only refuses to fall back to LLM when RAG has no match", async () => {
    const profile = {
      classifier: "rag-only",
      llm_fallback: true, // should be ignored — classifier wins
      max_reroutes: 5,
      routing: { frontend: { description: "UI errors" } },
      signatures: [],
    };

    const llm = makeStubLlm("frontend", "should not be called");
    const result = await evaluateTriage("anything", profile, llm, "slug", TMP_APP_ROOT);

    assert.equal(result.source, "fallback");
    assert.equal(result.domain, "$SELF");
  });

  it("default classifier (undefined) + llm_fallback=true behaves as rag+llm", async () => {
    const profile = {
      llm_fallback: true,
      max_reroutes: 5,
      routing: { frontend: { description: "UI errors" } },
      signatures: [],
    };

    const llm = makeStubLlm("frontend", "classified by llm");
    const result = await evaluateTriage("anything", profile, llm, "slug", TMP_APP_ROOT);

    assert.equal(result.source, "llm");
    assert.equal(result.domain, "frontend");
  });
});
