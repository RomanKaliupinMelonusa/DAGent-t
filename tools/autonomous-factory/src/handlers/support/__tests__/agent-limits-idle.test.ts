/**
 * agent-limits-idle.test.ts — B2 session.idle circuit breaker config cascade.
 *
 * Verifies that `resolveIdleTimeoutLimit` applies the standard APM cascade:
 *   agent-level → manifest defaultToolLimits → code fallback (2).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveIdleTimeoutLimit, IDLE_TIMEOUT_LIMIT_FALLBACK } from "../agent-limits.js";
import type { ApmCompiledOutput } from "../../../apm/types.js";

function makeCtx(partial: {
  defaultLimit?: number;
  agentLimit?: number;
}): ApmCompiledOutput {
  return {
    config: partial.defaultLimit !== undefined
      ? { defaultToolLimits: { idleTimeoutLimit: partial.defaultLimit } }
      : {},
    agents: {
      "storefront-dev": {
        rules: "",
        tokenCount: 0,
        mcp: {},
        skills: {},
        tools: undefined,
        security: undefined,
        systemPromptTemplate: "",
        toolLimits: partial.agentLimit !== undefined
          ? { idleTimeoutLimit: partial.agentLimit }
          : undefined,
      },
    },
  } as unknown as ApmCompiledOutput;
}

describe("resolveIdleTimeoutLimit (B2)", () => {
  it("falls back to code default when no config declares a limit", () => {
    assert.equal(
      resolveIdleTimeoutLimit(makeCtx({}), "storefront-dev"),
      IDLE_TIMEOUT_LIMIT_FALLBACK,
    );
    assert.equal(IDLE_TIMEOUT_LIMIT_FALLBACK, 2);
  });

  it("uses manifest defaultToolLimits when agent does not override", () => {
    assert.equal(
      resolveIdleTimeoutLimit(makeCtx({ defaultLimit: 4 }), "storefront-dev"),
      4,
    );
  });

  it("agent-level limit wins over manifest default", () => {
    assert.equal(
      resolveIdleTimeoutLimit(makeCtx({ defaultLimit: 4, agentLimit: 1 }), "storefront-dev"),
      1,
    );
  });

  it("falls back to code default for unknown agent keys", () => {
    assert.equal(
      resolveIdleTimeoutLimit(makeCtx({ defaultLimit: 5 }), "unknown-agent"),
      5,
    );
    assert.equal(
      resolveIdleTimeoutLimit(makeCtx({}), "unknown-agent"),
      IDLE_TIMEOUT_LIMIT_FALLBACK,
    );
  });
});
