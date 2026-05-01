/**
 * apm/__tests__/agent-artifact-helper.test.ts
 *
 * Phase 3 — `{{artifact "producer" "kind"}}` Handlebars helper coverage.
 *
 * The helper must:
 *   1. Throw at render time when the producer+kind is not declared in the
 *      node's `consumes_artifacts`.
 *   2. Throw when `__declaredConsumes` was never threaded (caller bug).
 *   3. Resolve to `__upstreamArtifacts[producer]` content for declared edges.
 *   4. Return an empty string for optional declared edges when the upstream
 *      produced no content.
 *   5. Return a bracketed placeholder for required declared edges when the
 *      upstream produced no content (Phase 2.1 already fails such dispatch
 *      before this path is reached — this is a defence in depth).
 *   6. Reject non-string / empty arguments.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import Handlebars from "handlebars";
import { getAgentConfig, type AgentContext } from "../agents.js";
import type { ApmCompiledOutput } from "../../manifest/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    featureSlug: "feat-x",
    specPath: "/tmp/spec.md",
    deployedUrl: null,
    workflowName: "wf-1",
    repoRoot: "/repo",
    appRoot: "/repo/apps/x",
    itemKey: "consumer-node",
    baseBranch: "main",
    ...overrides,
  };
}

function makeApmContext(
  template: string,
  consumes: Array<{ from: string; kind: string; required?: boolean }> = [],
): ApmCompiledOutput {
  return {
    agents: {
      "consumer-node": {
        systemPromptTemplate: template,
        rules: "",
        mcp: {},
      },
    },
    workflows: {
      "wf-1": {
        nodes: {
          "consumer-node": {
            consumes_artifacts: consumes,
          },
        },
      },
    },
  } as unknown as ApmCompiledOutput;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("{{artifact}} Handlebars helper — Phase 3", () => {
  it("renders parsed content for a declared edge with upstream data", () => {
    const template = `plan: {{artifact "planner" "params"}}`;
    const apm = makeApmContext(template, [{ from: "planner", kind: "params" }]);
    const ctx = makeContext({
      upstreamArtifacts: { planner: { step: "design", n: 3 } },
    });
    const cfg = getAgentConfig("consumer-node", ctx, apm);
    assert.match(cfg.systemMessage, /plan:\s*\{/);
    assert.match(cfg.systemMessage, /"step":\s*"design"/);
    assert.match(cfg.systemMessage, /"n":\s*3/);
  });

  it("stringifies primitive upstream content directly", () => {
    const template = `val: {{artifact "producer" "params"}}`;
    const apm = makeApmContext(template, [{ from: "producer", kind: "params" }]);
    const ctx = makeContext({ upstreamArtifacts: { producer: "hello" } });
    const cfg = getAgentConfig("consumer-node", ctx, apm);
    assert.match(cfg.systemMessage, /val:\s*hello/);
  });

  it("throws on an undeclared producer+kind edge", () => {
    const template = `{{artifact "ghost" "params"}}`;
    const apm = makeApmContext(template, [{ from: "real", kind: "params" }]);
    const ctx = makeContext({ upstreamArtifacts: { real: {} } });
    assert.throws(
      () => getAgentConfig("consumer-node", ctx, apm),
      (err: unknown) =>
        err instanceof Error &&
        /undeclared edge/.test(err.message) &&
        /"ghost"\s*"params"/.test(err.message) &&
        /Declared consumes_artifacts:\s*"real:params"/.test(err.message),
    );
  });

  it("lists (none) in the error when the node declares no edges", () => {
    const template = `{{artifact "x" "y"}}`;
    const apm = makeApmContext(template, []);
    const ctx = makeContext();
    assert.throws(
      () => getAgentConfig("consumer-node", ctx, apm),
      (err: unknown) =>
        err instanceof Error &&
        /Declared consumes_artifacts:\s*\(none\)/.test(err.message),
    );
  });

  it("returns an empty string for an optional declared edge with no upstream data", () => {
    const template = `opt:[{{artifact "opt-producer" "params"}}]`;
    const apm = makeApmContext(template, [
      { from: "opt-producer", kind: "params", required: false },
    ]);
    const ctx = makeContext({ upstreamArtifacts: {} });
    const cfg = getAgentConfig("consumer-node", ctx, apm);
    assert.match(cfg.systemMessage, /opt:\[\]/);
  });

  it("returns a bracketed placeholder for a required declared edge with no upstream data", () => {
    const template = `req:[{{artifact "req-producer" "params"}}]`;
    const apm = makeApmContext(template, [
      { from: "req-producer", kind: "params", required: true },
    ]);
    const ctx = makeContext({ upstreamArtifacts: {} });
    const cfg = getAgentConfig("consumer-node", ctx, apm);
    assert.match(cfg.systemMessage, /req:\[\[artifact req-producer:params unresolved\]\]/);
  });

  it("rejects an empty producer argument", () => {
    const template = `{{artifact "" "params"}}`;
    const apm = makeApmContext(template, []);
    const ctx = makeContext();
    assert.throws(
      () => getAgentConfig("consumer-node", ctx, apm),
      (err: unknown) =>
        err instanceof Error && /non-empty producer node key/.test(err.message),
    );
  });

  it("rejects an empty kind argument", () => {
    const template = `{{artifact "producer" ""}}`;
    const apm = makeApmContext(template, []);
    const ctx = makeContext();
    assert.throws(
      () => getAgentConfig("consumer-node", ctx, apm),
      (err: unknown) =>
        err instanceof Error && /non-empty kind string/.test(err.message),
    );
  });

  it("works as a direct Handlebars helper invocation without __declaredConsumes (caller bug)", () => {
    // Directly compile a template that calls the helper but run it against
    // empty data so `__declaredConsumes` is missing — the helper must throw
    // the "caller bug" message rather than silently returning nothing.
    const template = Handlebars.compile(`{{artifact "a" "b"}}`, { noEscape: true });
    assert.throws(
      () => template({}),
      (err: unknown) =>
        err instanceof Error &&
        /no declared consumes_artifacts were threaded/.test(err.message),
    );
  });
});
