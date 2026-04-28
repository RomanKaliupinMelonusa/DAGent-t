/**
 * compiler-route-profiles.test.ts — Session B (Items 3 + 4) coverage.
 *
 * Exercises the new compile-time pieces:
 *   - routeProfiles flattening (single-level `extends`, cycle detection)
 *   - on_failure.extends merge precedence (profile → default → node)
 *   - triage profile `domains:` validation (mismatch, derived set)
 *   - route-key validation against the resolved domain set + nearest-
 *     neighbour suggestion in the error message
 *   - built-in patterns silently drop when their domain is not routed,
 *     but declared patterns raise a fatal error
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";

import { compileApm } from "../compiler.js";

// --- Fixture builder --------------------------------------------------------

interface FixtureOpts {
  triageProfile?: Record<string, unknown>;
  routeProfiles?: Record<string, unknown>;
  extraNodes?: Record<string, Record<string, unknown>>;
  onFailureOverride?: Record<string, unknown> | null;
}

function writeFixture(opts: FixtureOpts): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "apm-compile-"));
  const apmDir = path.join(root, ".apm");
  fs.mkdirSync(apmDir, { recursive: true });
  fs.mkdirSync(path.join(apmDir, "instructions/always"), { recursive: true });
  fs.mkdirSync(path.join(apmDir, "agents"), { recursive: true });

  fs.writeFileSync(path.join(apmDir, "instructions/always/common.md"), "# always\n");
  fs.writeFileSync(path.join(apmDir, "agents/dev.agent.md"), "You are dev.\n");
  fs.writeFileSync(path.join(apmDir, "agents/test.agent.md"), "You are test.\n");

  const apm = {
    name: "fixture",
    version: "1.0.0",
    description: "",
    tokenBudget: 8000,
    agents: {
      dev: {
        instructions: ["always"],
        promptFile: "dev.agent.md",
        mcp: [],
        skills: [],
        toolLimits: { soft: 10, hard: 20 },
        security: {},
        tools: { core: ["read_file"] },
      },
      test: {
        instructions: ["always"],
        promptFile: "test.agent.md",
        mcp: [],
        skills: [],
        toolLimits: { soft: 10, hard: 20 },
        security: {},
        tools: { core: ["read_file"] },
      },
    },
    nodes: {
      dev: { type: "agent", category: "dev", agent: "@dev", timeout_minutes: 5 },
      test: { type: "agent", category: "test", agent: "@test", timeout_minutes: 5 },
      triage: { type: "triage", category: "finalize", timeout_minutes: 1, node_kind: "control-flow" },
    },
  };

  fs.writeFileSync(path.join(apmDir, "apm.yml"), yaml.dump(apm));

  const nodes: Record<string, Record<string, unknown>> = {
    dev: { depends_on: [] },
    test: {
      depends_on: ["dev"],
      ...(opts.onFailureOverride !== null
        ? {
            on_failure: opts.onFailureOverride ?? {
              triage: "triage",
              routes: { frontend: "dev" },
            },
          }
        : {}),
    },
    triage: { _node: "triage", depends_on: [], triage_profile: "main" },
    ...(opts.extraNodes ?? {}),
  };

  const triageProfile = opts.triageProfile ?? {
    packs: [],
    classifier: "rag-only",
    llm_fallback: false,
    max_reroutes: 3,
    routing: { frontend: { description: "UI" } },
  };

  const workflows = {
    default: {
      description: "fixture",
      nodes,
      triage: { main: triageProfile },
      ...(opts.routeProfiles ? { routeProfiles: opts.routeProfiles } : {}),
    },
  };
  fs.writeFileSync(path.join(apmDir, "workflows.yml"), yaml.dump(workflows));

  return root;
}

// --- Tests ------------------------------------------------------------------

describe("routeProfiles + on_failure.extends merging", () => {
  it("flattens single-level extends and inherits routes", async () => {
    const root = writeFixture({
      routeProfiles: {
        base: { routes: { environment: "$SELF", blocked: null } },
        "runtime-to-debug": {
          extends: "base",
          routes: { frontend: "dev" },
        },
      },
      triageProfile: {
        classifier: "rag-only",
        llm_fallback: false,
        max_reroutes: 3,
        routing: {
          frontend: { description: "UI" },
          environment: { description: "env" },
          blocked: { description: "block" },
          "test-code": { description: "test" },
        },
      },
      onFailureOverride: {
        triage: "triage",
        extends: "runtime-to-debug",
        routes: { "test-code": "dev" },
      },
    });

    const r = await compileApm(root);
    const routes = r.workflows.default.nodes.test.on_failure!.routes;
    assert.equal(routes.environment, "$SELF", "inherits from base via runtime-to-debug");
    assert.equal(routes.blocked, null);
    assert.equal(routes.frontend, "dev", "inherits from runtime-to-debug");
    assert.equal(routes["test-code"], "dev", "node override wins");
  });

  it("node on_failure overrides profile routes of the same domain", async () => {
    const root = writeFixture({
      routeProfiles: {
        base: { routes: { frontend: "dev" } },
      },
      onFailureOverride: {
        triage: "triage",
        extends: "base",
        routes: { frontend: "test" }, // should win
      },
    });
    const r = await compileApm(root);
    assert.equal(r.workflows.default.nodes.test.on_failure!.routes.frontend, "test");
  });

  it("fails when on_failure.extends references an unknown profile", async () => {
    const root = writeFixture({
      routeProfiles: { base: { routes: { frontend: "dev" } } },
      onFailureOverride: {
        triage: "triage",
        extends: "does-not-exist",
        routes: {},
      },
    });
    await assert.rejects(async () => compileApm(root), /unknown routeProfile "does-not-exist"/);
  });

  it("fails on routeProfiles inheritance cycle", async () => {
    const root = writeFixture({
      routeProfiles: {
        a: { extends: "b", routes: {} },
        b: { extends: "a", routes: {} },
      },
    });
    await assert.rejects(async () => compileApm(root), /routeProfiles inheritance cycle/);
  });

  // 🆁4 — depth-1 guard: a profile may extend another, but the parent must
  // not itself extend. Without this guard, adding a third link to an existing
  // chain (e.g. runtime-to-debug → base) would silently drop mid-chain
  // overrides because node-level merging only walks one hop.
  it("fails when an extended profile itself has extends (depth ≥ 2)", async () => {
    const root = writeFixture({
      routeProfiles: {
        c: { routes: { environment: "$SELF" } },
        b: { extends: "c", routes: { frontend: "dev" } },
        a: { extends: "b", routes: { blocked: null } },
      },
    });
    await assert.rejects(
      async () => compileApm(root),
      (err: unknown) => {
        assert.ok(err instanceof Error, "expected Error");
        assert.equal(err.name, "ApmCompileError");
        assert.match(err.message, /max depth of 1/);
        assert.match(err.message, /a -> b -> c/);
        return true;
      },
    );
  });

  // 🆁4 — even with depth-1 enforcement the cycle detector must catch a
  // self-edge without infinite-looping. The check is synchronous so the
  // promise rejects deterministically; no timeout is needed.
  it("fails on a self-cycle (A extends A) without looping", async () => {
    const root = writeFixture({
      routeProfiles: {
        a: { extends: "a", routes: {} },
      },
    });
    await assert.rejects(
      async () => compileApm(root),
      (err: unknown) => {
        assert.ok(err instanceof Error, "expected Error");
        assert.equal(err.name, "ApmCompileError");
        assert.match(err.message, /inheritance cycle/);
        assert.match(err.message, /a -> a/);
        return true;
      },
    );
  });
});

describe("triage profile domain validation", () => {
  it("fails when routing has a domain not in explicit `domains:` list", async () => {
    const root = writeFixture({
      triageProfile: {
        classifier: "rag-only",
        llm_fallback: false,
        max_reroutes: 3,
        domains: ["environment"],
        routing: {
          frontend: { description: "UI" },
          environment: { description: "env" },
        },
      },
    });
    await assert.rejects(
      async () => compileApm(root),
      /declares routing domain "frontend"/,
    );
  });

  it("catches unknown on_failure.routes keys with a typo suggestion", async () => {
    const root = writeFixture({
      onFailureOverride: {
        triage: "triage",
        routes: { "front-end": "dev" }, // typo
      },
    });
    await assert.rejects(
      async () => compileApm(root),
      /domain key "front-end".*Did you mean "frontend"/s,
    );
  });

  it("accepts `blocked` without it being declared in domains", async () => {
    const root = writeFixture({
      onFailureOverride: {
        triage: "triage",
        routes: { frontend: "dev", blocked: null },
      },
    });
    const r = await compileApm(root);
    assert.equal(r.workflows.default.nodes.test.on_failure!.routes.blocked, null);
  });
});

describe("built-in pattern filtering", () => {
  it("silently drops built-in patterns whose domain is not in the profile", async () => {
    const root = writeFixture({
      triageProfile: {
        classifier: "rag-only",
        llm_fallback: false,
        max_reroutes: 3,
        // No `frontend`, `browser-runtime-error`, or `schema-violation`.
        routing: { environment: { description: "env" } },
      },
      onFailureOverride: {
        triage: "triage",
        routes: { environment: "$SELF" },
      },
    });
    const r = await compileApm(root);
    // All three built-in patterns should have been filtered out.
    assert.equal(r.triage_profiles["default.main"].patterns.length, 0);
  });

  it("fails when a DECLARED pattern emits an unrouted domain", async () => {
    const root = writeFixture({
      triageProfile: {
        classifier: "rag-only",
        llm_fallback: false,
        max_reroutes: 3,
        routing: { frontend: { description: "UI" } },
        builtin_patterns: false,
        patterns: [
          {
            match_kind: "raw-regex",
            pattern: "X",
            domain: "catalog-data", // not in routing
          },
        ],
      },
    });
    await assert.rejects(
      async () => compileApm(root),
      /declared pattern emitting domain "catalog-data"/,
    );
  });

  it("builtin_patterns:false removes all built-ins even when their domain IS in the profile", async () => {
    const root = writeFixture({
      triageProfile: {
        classifier: "rag-only",
        llm_fallback: false,
        max_reroutes: 3,
        routing: { frontend: { description: "UI" } },
        builtin_patterns: false,
      },
    });
    const r = await compileApm(root);
    assert.equal(r.triage_profiles["default.main"].patterns.length, 0);
  });
});

describe("triage profile enrichment toggles", () => {
  it("defaults evidence_enrichment and baseline_noise_filter to true", async () => {
    const root = writeFixture({
      triageProfile: {
        classifier: "rag-only",
        llm_fallback: false,
        max_reroutes: 3,
        routing: { frontend: { description: "UI" } },
      },
    });
    const r = await compileApm(root);
    const compiled = r.triage_profiles["default.main"];
    assert.equal(compiled.evidence_enrichment, true);
    assert.equal(compiled.baseline_noise_filter, true);
  });

  it("propagates evidence_enrichment:false and baseline_noise_filter:false", async () => {
    const root = writeFixture({
      triageProfile: {
        classifier: "llm-only",
        llm_fallback: true,
        max_reroutes: 3,
        routing: { frontend: { description: "UI" } },
        evidence_enrichment: false,
        baseline_noise_filter: false,
      },
    });
    const r = await compileApm(root);
    const compiled = r.triage_profiles["default.main"];
    assert.equal(compiled.evidence_enrichment, false);
    assert.equal(compiled.baseline_noise_filter, false);
  });
});
