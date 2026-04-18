/**
 * supervisor.test.ts — Unit tests for the multi-slug supervisor.
 *
 * Exercises the concurrency cap, unique-slug guard, env-based max override,
 * and failure aggregation. Uses a fake `FeatureRunner` — no child processes
 * are spawned here. The real subprocess adapter is covered by an
 * integration-level smoke test in
 * `subprocess-feature-runner.test.ts`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DEFAULT_MAX_CONCURRENT_FEATURES,
  assertUniqueSlugs,
  loadIntake,
  resolveMaxConcurrent,
  runSupervisor,
  type FeatureRunOutcome,
  type FeatureRunner,
  type SupervisorFeature,
  type SupervisorIntake,
  type SupervisorLogger,
} from "../entry/supervisor.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const silentLogger: SupervisorLogger = { info: () => {}, warn: () => {}, error: () => {} };

function feature(slug: string, app = "apps/sample-app"): SupervisorFeature {
  return { slug, app };
}

/**
 * Fake runner that records concurrent in-flight count. Each run waits
 * until `release(slug)` is called, so the test can observe exactly how
 * many slugs are simultaneously in flight.
 */
function makeGatedRunner() {
  let inFlight = 0;
  let peak = 0;
  const released = new Set<string>();
  const pending = new Map<string, () => void>();

  const runner: FeatureRunner = {
    async run(f): Promise<FeatureRunOutcome> {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => {
        if (released.has(f.slug)) {
          released.delete(f.slug);
          resolve();
        } else {
          pending.set(f.slug, resolve);
        }
      });
      inFlight -= 1;
      return { slug: f.slug, exitCode: 0, durationMs: 1 };
    },
  };

  return {
    runner,
    release(slug: string): void {
      const p = pending.get(slug);
      if (p) {
        pending.delete(slug);
        p();
      } else {
        released.add(slug);
      }
    },
    get peak() { return peak; },
    get inFlight() { return inFlight; },
    get pendingSlugs() { return [...pending.keys()]; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("supervisor intake", () => {
  it("assertUniqueSlugs rejects duplicates", () => {
    assert.throws(
      () => assertUniqueSlugs([feature("a"), feature("b"), feature("a")]),
      /duplicate slug: a/,
    );
  });

  it("assertUniqueSlugs accepts distinct slugs", () => {
    assert.doesNotThrow(() => assertUniqueSlugs([feature("a"), feature("b")]));
  });

  it("loadIntake parses a valid JSON manifest", () => {
    const tmp = path.join(os.tmpdir(), `intake-${Date.now()}.json`);
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        features: [{ slug: "foo", app: "apps/sample-app" }],
        maxConcurrentFeatures: 3,
      }),
    );
    try {
      const intake = loadIntake(tmp);
      assert.equal(intake.features.length, 1);
      assert.equal(intake.features[0]!.slug, "foo");
      assert.equal(intake.maxConcurrentFeatures, 3);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });

  it("loadIntake rejects malformed JSON", () => {
    const tmp = path.join(os.tmpdir(), `intake-bad-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ features: [] })); // min(1) violates
    try {
      assert.throws(() => loadIntake(tmp));
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
});

describe("supervisor concurrency cap", () => {
  function intakeOf(...slugs: string[]): SupervisorIntake {
    return { features: slugs.map((s) => feature(s)) };
  }

  it("DEFAULT_MAX_CONCURRENT_FEATURES = 2 (Copilot rate limit)", () => {
    assert.equal(DEFAULT_MAX_CONCURRENT_FEATURES, 2);
  });

  it("env DAGENT_MAX_CONCURRENT_FEATURES overrides intake", () => {
    const intake = { ...intakeOf("a"), maxConcurrentFeatures: 5 };
    assert.equal(resolveMaxConcurrent(intake, { DAGENT_MAX_CONCURRENT_FEATURES: "7" }), 7);
  });

  it("intake override applies when env is unset", () => {
    const intake = { ...intakeOf("a"), maxConcurrentFeatures: 5 };
    assert.equal(resolveMaxConcurrent(intake, {}), 5);
  });

  it("falls back to DEFAULT when env and intake both unset", () => {
    assert.equal(resolveMaxConcurrent(intakeOf("a"), {}), DEFAULT_MAX_CONCURRENT_FEATURES);
  });

  it("resolveMaxConcurrent rejects bad env values", () => {
    assert.throws(() => resolveMaxConcurrent(intakeOf("a"), { DAGENT_MAX_CONCURRENT_FEATURES: "0" }));
    assert.throws(() => resolveMaxConcurrent(intakeOf("a"), { DAGENT_MAX_CONCURRENT_FEATURES: "-3" }));
    assert.throws(() => resolveMaxConcurrent(intakeOf("a"), { DAGENT_MAX_CONCURRENT_FEATURES: "abc" }));
  });

  it("never exceeds maxConcurrent in-flight runs", async () => {
    const gate = makeGatedRunner();
    const intake = intakeOf("a", "b", "c", "d", "e");
    const p = runSupervisor(intake, gate.runner, { maxConcurrent: 2, logger: silentLogger });

    // Wait for the worker pool to saturate.
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(gate.inFlight, 2, "exactly 2 in-flight with maxConcurrent=2");
    assert.equal(gate.peak, 2);

    // Drain.
    for (const slug of ["a", "b", "c", "d", "e"]) gate.release(slug);
    const report = await p;

    assert.equal(report.succeeded, 5);
    assert.equal(report.failed, 0);
    assert.ok(gate.peak <= 2, `peak must respect cap, got ${gate.peak}`);
  });

  it("worker count is clamped to queue length when intake is small", async () => {
    const gate = makeGatedRunner();
    const intake = intakeOf("solo");
    const p = runSupervisor(intake, gate.runner, { maxConcurrent: 8, logger: silentLogger });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(gate.inFlight, 1); // only 1 feature, so only 1 worker
    gate.release("solo");
    await p;
  });
});

describe("supervisor failure aggregation", () => {
  it("collects mixed exit codes without throwing", async () => {
    const runner: FeatureRunner = {
      async run(f) {
        const failing = new Set(["b", "d"]);
        return { slug: f.slug, exitCode: failing.has(f.slug) ? 2 : 0, durationMs: 1 };
      },
    };
    const intake: SupervisorIntake = {
      features: [feature("a"), feature("b"), feature("c"), feature("d")],
    };
    const report = await runSupervisor(intake, runner, { maxConcurrent: 2, logger: silentLogger });
    assert.equal(report.succeeded, 2);
    assert.equal(report.failed, 2);
    assert.equal(report.outcomes.length, 4);
    const failedSlugs = report.outcomes.filter((o) => o.exitCode !== 0).map((o) => o.slug).sort();
    assert.deepEqual(failedSlugs, ["b", "d"]);
  });

  it("runner thrown error is captured as exit=1 with error message", async () => {
    const runner: FeatureRunner = {
      async run(f) {
        if (f.slug === "boom") throw new Error("kaboom");
        return { slug: f.slug, exitCode: 0, durationMs: 1 };
      },
    };
    const intake: SupervisorIntake = { features: [feature("ok"), feature("boom")] };
    const report = await runSupervisor(intake, runner, { maxConcurrent: 2, logger: silentLogger });
    assert.equal(report.succeeded, 1);
    assert.equal(report.failed, 1);
    const boom = report.outcomes.find((o) => o.slug === "boom")!;
    assert.equal(boom.exitCode, 1);
    assert.equal(boom.error, "kaboom");
  });
});
