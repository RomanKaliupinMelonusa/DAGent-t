/**
 * Tests for `buildE2eReadinessEnv` — declarative `apm.e2e.readiness.*`
 * env injection for pre/post hooks of the e2e-runner family of nodes
 * (Session B Phase 1 polish).
 *
 * Covers:
 *  - Full readiness block on `e2e-runner` → all four env vars present.
 *  - Missing readiness block → no env vars (bash defaults remain).
 *  - Non-e2e itemKey + populated readiness → no env vars (gating works).
 *  - Partial readiness (only `url`) → only `E2E_READINESS_URL` injected.
 *  - Sibling allow-listed keys (`qa-adversary`, `storefront-debug`) also
 *    receive injection — they share the e2e-runner pre/post hooks.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildE2eReadinessEnv } from "../../activities/support/e2e-readiness-env.js";
import type { ApmConfig } from "../../apm/index.js";

const FULL: ApmConfig = {
  e2e: {
    readiness: {
      url: "http://localhost:3000/category/newarrivals",
      timeout_s: 180,
      min_bytes: 12000,
      deny_re: "Building your app",
    },
  },
  // Only fields buildE2eReadinessEnv reads matter — cast through to keep
  // the test ergonomic without restating the full config schema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const URL_ONLY: ApmConfig = {
  e2e: { readiness: { url: "http://localhost:3000/" } },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const NONE: ApmConfig = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe("buildE2eReadinessEnv (Session B Phase 1)", () => {
  it("injects all four env vars for e2e-runner when readiness is fully populated", () => {
    const env = buildE2eReadinessEnv("e2e-runner", FULL);
    assert.deepEqual(env, {
      E2E_READINESS_URL: "http://localhost:3000/category/newarrivals",
      READY_TIMEOUT_S: "180",
      READY_MIN_BYTES: "12000",
      READY_DENY_RE: "Building your app",
    });
  });

  it("returns an empty object when apm.e2e.readiness is absent", () => {
    const env = buildE2eReadinessEnv("e2e-runner", NONE);
    assert.deepEqual(env, {});
  });

  it("does not inject env vars for nodes outside the e2e-runner allow-list", () => {
    const env = buildE2eReadinessEnv("dev-build", FULL);
    assert.deepEqual(env, {});
  });

  it("only injects defined fields when readiness is partial", () => {
    const env = buildE2eReadinessEnv("e2e-runner", URL_ONLY);
    assert.deepEqual(env, { E2E_READINESS_URL: "http://localhost:3000/" });
  });

  it("injects for qa-adversary, storefront-debug and baseline-analyzer — sibling allow-listed keys", () => {
    assert.equal(
      buildE2eReadinessEnv("qa-adversary", FULL).E2E_READINESS_URL,
      "http://localhost:3000/category/newarrivals",
    );
    assert.equal(
      buildE2eReadinessEnv("storefront-debug", FULL).E2E_READINESS_URL,
      "http://localhost:3000/category/newarrivals",
    );
    assert.equal(
      buildE2eReadinessEnv("baseline-analyzer", FULL).E2E_READINESS_URL,
      "http://localhost:3000/category/newarrivals",
    );
  });

  it("treats undefined config as a no-op (no readiness block configured)", () => {
    const env = buildE2eReadinessEnv("e2e-runner", undefined);
    assert.deepEqual(env, {});
  });
});
