/**
 * domain/failure-routing.test.ts — Unit tests for failure routing resolution.
 *
 * Uses Node.js built-in test runner (node:test) — zero test dependencies.
 * Run: npx tsx src/domain/__tests__/failure-routing.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveFailureTarget,
  resolveFailureRoutes,
  type RoutableWorkflow,
} from "../failure-routing.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKFLOW: RoutableWorkflow = {
  nodes: {
    "backend-dev": {
      type: "agent",
      on_failure: {
        triage: "triage-backend",
        routes: { backend: "backend-dev", infra: "infra-dev" },
      },
    },
    "frontend-dev": {
      type: "agent",
      on_failure: "triage-frontend", // string shorthand
    },
    "infra-dev": {
      type: "agent",
      triage: "infra-profile", // deprecated field
    },
    "triage-infra": {
      type: "triage",
      triage_profile: "infra-profile",
    },
    "no-failure": {
      type: "agent",
    },
    "triage-backend": { type: "triage" },
    "triage-frontend": { type: "triage" },
  },
  default_triage: "triage-backend",
  default_routes: { backend: "backend-dev" },
};

// ---------------------------------------------------------------------------
// resolveFailureTarget
// ---------------------------------------------------------------------------

describe("resolveFailureTarget", () => {
  it("resolves from on_failure.triage (object)", () => {
    assert.equal(resolveFailureTarget(WORKFLOW, "backend-dev"), "triage-backend");
  });

  it("resolves from on_failure string shorthand", () => {
    assert.equal(resolveFailureTarget(WORKFLOW, "frontend-dev"), "triage-frontend");
  });

  it("resolves from deprecated triage field via profile lookup", () => {
    assert.equal(resolveFailureTarget(WORKFLOW, "infra-dev"), "triage-infra");
  });

  it("falls back to default_triage", () => {
    assert.equal(resolveFailureTarget(WORKFLOW, "no-failure"), "triage-backend");
  });

  it("returns undefined for unknown node", () => {
    assert.equal(resolveFailureTarget(WORKFLOW, "nonexistent"), undefined);
  });
});

// ---------------------------------------------------------------------------
// resolveFailureRoutes
// ---------------------------------------------------------------------------

describe("resolveFailureRoutes", () => {
  it("resolves from on_failure.routes", () => {
    const routes = resolveFailureRoutes(WORKFLOW, "backend-dev");
    assert.deepEqual(routes, { backend: "backend-dev", infra: "infra-dev" });
  });

  it("falls back to default_routes", () => {
    const routes = resolveFailureRoutes(WORKFLOW, "no-failure");
    assert.deepEqual(routes, { backend: "backend-dev" });
  });

  it("falls back to default_routes for string on_failure", () => {
    const routes = resolveFailureRoutes(WORKFLOW, "frontend-dev");
    assert.deepEqual(routes, { backend: "backend-dev" });
  });
});
