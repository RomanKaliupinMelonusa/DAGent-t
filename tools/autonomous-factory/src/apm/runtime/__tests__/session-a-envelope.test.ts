/**
 * session-a-envelope.test.ts — Session A (Items 7/8/9).
 *
 * Exercises the envelope foundation that landed in Session A:
 *   - catalog-level `envelope` annotation on every kind
 *   - `EnvelopeSchema` strict shape
 *   - `stampEnvelope` fills gaps without reformatting complete envelopes
 *   - `validateEnvelope` surfaces missing fields
 *   - sidecar helpers
 *   - `implementation-status` kind registration
 *
 * Paired with:
 *   - `file-artifact-bus-session-a.test.ts` — bus auto-stamp + strict mode.
 *   - `artifact-io-validator-expect-version.test.ts` — compile-time pin.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ArtifactValidationError,
  EnvelopeSchema,
  ImplementationStatusArtifactSchema,
  buildSidecarEnvelope,
  getArtifactKind,
  listArtifactKinds,
  sidecarPath,
  stampEnvelope,
  validateArtifactPayload,
  validateEnvelope,
} from "../../artifacts/artifact-catalog.js";

// ---------------------------------------------------------------------------
// catalog annotation
// ---------------------------------------------------------------------------

describe("Session A — every kind declares an envelope strategy", () => {
  it("every catalog entry carries envelope = 'inline' or 'sidecar'", () => {
    for (const def of listArtifactKinds()) {
      assert.ok(
        def.envelope === "inline" || def.envelope === "sidecar",
        `kind '${def.id}' must declare envelope (got ${String(def.envelope)})`,
      );
    }
  });

  it("human-authored + external-stream kinds use sidecar envelopes", () => {
    for (const kind of [
      "spec",
      "acceptance",
      "playwright-report",
      "playwright-log",
      "terminal-log",
      "novel-triage",
      "params",
      "meta",
    ] as const) {
      assert.equal(getArtifactKind(kind).envelope, "sidecar", kind);
    }
  });

  it("agent-authored structured kinds use inline envelopes", () => {
    for (const kind of [
      "baseline",
      "debug-notes",
      "validation",
      "qa-report",
      "change-manifest",
      "halt",
      "summary",
      "summary-data",
      "flight-data",
      "triage-handoff",
      "deployment-url",
      "node-report",
      "implementation-status",
    ] as const) {
      assert.equal(getArtifactKind(kind).envelope, "inline", kind);
    }
  });
});

// ---------------------------------------------------------------------------
// EnvelopeSchema
// ---------------------------------------------------------------------------

describe("EnvelopeSchema", () => {
  it("accepts a valid envelope", () => {
    assert.doesNotThrow(() =>
      EnvelopeSchema.parse({
        schemaVersion: 1,
        producedBy: "storefront-dev",
        producedAt: "2026-04-23T12:00:00Z",
      }),
    );
  });

  it("rejects a zero or negative schemaVersion", () => {
    assert.throws(() =>
      EnvelopeSchema.parse({
        schemaVersion: 0,
        producedBy: "x",
        producedAt: "now",
      }),
    );
  });

  it("rejects empty producedBy", () => {
    assert.throws(() =>
      EnvelopeSchema.parse({
        schemaVersion: 1,
        producedBy: "",
        producedAt: "now",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// stampEnvelope
// ---------------------------------------------------------------------------

describe("stampEnvelope", () => {
  const when = "2026-04-23T12:00:00.000Z";

  it("fills missing envelope fields on a JSON body", () => {
    const out = stampEnvelope("qa-report", '{"outcome":"pass","feature":"f","probes_run":0,"violations":[]}', "qa", when);
    const parsed = JSON.parse(out);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.producedBy, "qa");
    assert.equal(parsed.producedAt, when);
    assert.equal(parsed.outcome, "pass");
  });

  it("leaves an already-complete envelope untouched", () => {
    const body = JSON.stringify({
      schemaVersion: 1,
      producedBy: "author",
      producedAt: when,
      outcome: "pass",
      feature: "f",
      probes_run: 0,
      violations: [],
    });
    assert.equal(stampEnvelope("qa-report", body, "qa", when), body);
  });

  it("no-op for sidecar kinds", () => {
    const body = '{"foo":1}';
    assert.equal(stampEnvelope("params", body, "node", when), body);
  });

  it("no-op for inline markdown kinds with a schema (respects existing strict gate)", () => {
    // summary has MarkdownEnvelopeBaseSchema — stamper must NOT inject
    // front-matter here, so the existing validator can reject malformed
    // producer output instead of silently sanitizing it.
    const body = "plain body no fence";
    assert.equal(stampEnvelope("summary", body, "backend-dev", when), body);
  });

  it("stamps front-matter onto a schema-free inline markdown kind (halt)", () => {
    const out = stampEnvelope("halt", "body", "kernel", when);
    assert.match(out, /^---\n/);
    assert.match(out, /schemaVersion: 1/);
    assert.match(out, /producedBy: kernel/);
    assert.match(out, /body\s*$/);
  });

  it("leaves a malformed JSON body intact (validator will flag)", () => {
    const body = "{not-json";
    assert.equal(stampEnvelope("qa-report", body, "qa", when), body);
  });
});

// ---------------------------------------------------------------------------
// validateEnvelope
// ---------------------------------------------------------------------------

describe("validateEnvelope", () => {
  const when = "2026-04-23T12:00:00.000Z";

  it("accepts an inline JSON body with the envelope fields", () => {
    const body = JSON.stringify({
      schemaVersion: 1,
      producedBy: "qa",
      producedAt: when,
      outcome: "pass",
      feature: "f",
      probes_run: 0,
      violations: [],
    });
    assert.doesNotThrow(() => validateEnvelope("qa-report", body));
  });

  it("throws when inline JSON body is missing producedBy", () => {
    const body = JSON.stringify({
      schemaVersion: 1,
      producedAt: when,
      outcome: "pass",
      feature: "f",
      probes_run: 0,
      violations: [],
    });
    assert.throws(
      () => validateEnvelope("qa-report", body),
      (e: unknown) =>
        e instanceof ArtifactValidationError &&
        /envelope\.producedBy/.test(e.message),
    );
  });

  it("throws for sidecar kinds when no sidecar body is provided", () => {
    assert.throws(
      () => validateEnvelope("spec", "# Feature spec"),
      (e: unknown) =>
        e instanceof ArtifactValidationError &&
        /sidecar missing/.test(e.message),
    );
  });

  it("accepts a sidecar kind when given a valid sidecar body", () => {
    const sidecar = JSON.stringify({
      schemaVersion: 1,
      producedBy: "human",
      producedAt: when,
    });
    assert.doesNotThrow(() =>
      validateEnvelope("spec", "# Feature spec", { sidecarBody: sidecar }),
    );
  });
});

// ---------------------------------------------------------------------------
// Sidecar helpers
// ---------------------------------------------------------------------------

describe("sidecar helpers", () => {
  it("buildSidecarEnvelope stamps the catalog schemaVersion", () => {
    const env = buildSidecarEnvelope("acceptance", "spec-compiler", "T");
    assert.equal(env.schemaVersion, 1);
    assert.equal(env.producedBy, "spec-compiler");
    assert.equal(env.producedAt, "T");
  });

  it("buildSidecarEnvelope defaults to 1 for schema-free kinds", () => {
    const env = buildSidecarEnvelope("terminal-log", "runner", "T");
    assert.equal(env.schemaVersion, 1);
  });

  it("sidecarPath appends .meta.json", () => {
    assert.equal(sidecarPath("/tmp/x/spec.md"), "/tmp/x/spec.md.meta.json");
  });
});

// ---------------------------------------------------------------------------
// implementation-status kind (Item 9)
// ---------------------------------------------------------------------------

describe("implementation-status kind", () => {
  it("is registered with an inline envelope and catalog schemaVersion=1", () => {
    const def = getArtifactKind("implementation-status");
    assert.equal(def.ext, "json");
    assert.equal(def.envelope, "inline");
    assert.equal(def.schemaVersion, 1);
    assert.deepEqual(def.scopes, ["node"]);
    assert.ok(def.schema, "must carry a strict schema");
  });

  it("validates a populated flow list", () => {
    const body = JSON.stringify({
      schemaVersion: 1,
      producedBy: "storefront-dev",
      producedAt: "2026-04-23T00:00:00Z",
      flows: [
        { flowId: "checkout-happy-path", status: "live" },
        {
          flowId: "new-wishlist",
          status: "feature-flag-off",
          gate: "FEATURE_NEW_WISHLIST",
          reason: "gated off in preview env",
        },
        { flowId: "guest-return", status: "partial", reason: "billing step stubbed" },
      ],
    });
    assert.doesNotThrow(() =>
      validateArtifactPayload("implementation-status", body),
    );
  });

  it("rejects an unknown status value", () => {
    const bad = {
      schemaVersion: 1,
      producedBy: "x",
      producedAt: "T",
      flows: [{ flowId: "f", status: "maybe" }],
    };
    assert.throws(
      () => validateArtifactPayload("implementation-status", JSON.stringify(bad)),
      (e: unknown) => e instanceof ArtifactValidationError,
    );
  });

  it("rejects a payload missing the envelope", () => {
    const bad = { flows: [{ flowId: "f", status: "live" }] };
    assert.throws(
      () => validateArtifactPayload("implementation-status", JSON.stringify(bad)),
      (e: unknown) => e instanceof ArtifactValidationError,
    );
  });

  it("exports a usable Zod schema", () => {
    assert.doesNotThrow(() =>
      ImplementationStatusArtifactSchema.parse({
        schemaVersion: 1,
        producedBy: "x",
        producedAt: "T",
        flows: [],
      }),
    );
  });
});
