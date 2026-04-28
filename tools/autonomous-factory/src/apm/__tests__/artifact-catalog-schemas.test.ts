/**
 * artifact-catalog-schemas.test.ts — Phase 1.1 + 1.2 coverage.
 *
 * Exercises the new JSON schemas (qa-report, validation, deployment-url)
 * and the per-kind `schemaVersion` metadata surfaced via
 * `getArtifactSchemaVersion`. Complements the pre-existing
 * `artifact-schema-validation.test.ts` which covers triage-handoff and
 * acceptance at the bus/materializer boundaries.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ArtifactValidationError,
  DeploymentUrlArtifactSchema,
  QaReportArtifactSchema,
  ValidationArtifactSchema,
  getArtifactKind,
  getArtifactSchemaVersion,
  validateArtifactPayload,
} from "../artifact-catalog.js";

// ---------------------------------------------------------------------------
// schemaVersion metadata (Phase 1.2)
// ---------------------------------------------------------------------------

describe("Artifact catalog — schemaVersion metadata", () => {
  it("structured kinds advertise schemaVersion = 1", () => {
    assert.equal(getArtifactSchemaVersion("triage-handoff"), 1);
    assert.equal(getArtifactSchemaVersion("acceptance"), 1);
    assert.equal(getArtifactSchemaVersion("qa-report"), 1);
    assert.equal(getArtifactSchemaVersion("validation"), 1);
    assert.equal(getArtifactSchemaVersion("deployment-url"), 1);
    assert.equal(getArtifactSchemaVersion("node-report"), 1);
  });

  it("schema-free kinds have no schemaVersion", () => {
    assert.equal(getArtifactSchemaVersion("spec"), undefined);
    assert.equal(getArtifactSchemaVersion("baseline"), undefined);
    assert.equal(getArtifactSchemaVersion("params"), undefined);
  });

  it("every schema-carrying kind has a catalog-level schemaVersion", () => {
    const kinds = [
      "triage-handoff",
      "acceptance",
      "qa-report",
      "validation",
      "deployment-url",
      "node-report",
    ] as const;
    for (const k of kinds) {
      const def = getArtifactKind(k);
      assert.ok(def.schema, `${k} should carry a schema`);
      assert.equal(typeof def.schemaVersion, "number", `${k} must declare a schemaVersion`);
    }
  });
});

// ---------------------------------------------------------------------------
// qa-report schema
// ---------------------------------------------------------------------------

const VALID_QA_REPORT_PASS = {
  outcome: "pass" as const,
  feature: "demo",
  probes_run: 5,
  violations: [],
};

const VALID_QA_REPORT_FAIL = {
  outcome: "fail" as const,
  feature: "demo",
  probes_run: 7,
  violations: [
    {
      probe: "double-submit-race",
      kind: "console-error" as const,
      flow: "checkout-happy-path",
      evidence: "Uncaught TypeError: ...",
    },
  ],
};

describe("QaReportArtifactSchema", () => {
  it("accepts a passing report with empty violations", () => {
    assert.doesNotThrow(() => QaReportArtifactSchema.parse(VALID_QA_REPORT_PASS));
    assert.doesNotThrow(() =>
      validateArtifactPayload("qa-report", JSON.stringify(VALID_QA_REPORT_PASS)),
    );
  });

  it("accepts a failing report with enumerated violations", () => {
    assert.doesNotThrow(() => QaReportArtifactSchema.parse(VALID_QA_REPORT_FAIL));
  });

  it("accepts an explicit schemaVersion: 1", () => {
    assert.doesNotThrow(() =>
      QaReportArtifactSchema.parse({ ...VALID_QA_REPORT_PASS, schemaVersion: 1 }),
    );
  });

  it("rejects an unknown violation kind", () => {
    const bad = {
      ...VALID_QA_REPORT_FAIL,
      violations: [
        { probe: "x", kind: "not-a-real-kind", flow: "f", evidence: "e" },
      ],
    };
    assert.throws(
      () => validateArtifactPayload("qa-report", JSON.stringify(bad)),
      (err: unknown) => err instanceof ArtifactValidationError && err.kind === "qa-report",
    );
  });

  it("rejects negative probes_run", () => {
    const bad = { ...VALID_QA_REPORT_PASS, probes_run: -1 };
    assert.throws(
      () => validateArtifactPayload("qa-report", JSON.stringify(bad)),
      (err: unknown) => err instanceof ArtifactValidationError,
    );
  });

  it("rejects missing feature", () => {
    const bad: Record<string, unknown> = { ...VALID_QA_REPORT_PASS };
    delete bad.feature;
    assert.throws(
      () => validateArtifactPayload("qa-report", JSON.stringify(bad)),
      (err: unknown) => err instanceof ArtifactValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// validation schema — accepts every outcome path emitted by the oracle
// ---------------------------------------------------------------------------

describe("ValidationArtifactSchema", () => {
  it("accepts the happy-path pass outcome", () => {
    const ok = {
      outcome: "pass" as const,
      playwrightExit: 0,
      acceptanceHash: "sha256:...",
      violations: [],
      flows: ["checkout"],
      dom: ["submit-button"],
    };
    assert.doesNotThrow(() => ValidationArtifactSchema.parse(ok));
  });

  it("accepts a skipped outcome (no contract)", () => {
    const skipped = {
      outcome: "skipped" as const,
      reason: "no-acceptance-contract",
      violations: [],
    };
    assert.doesNotThrow(() =>
      validateArtifactPayload("validation", JSON.stringify(skipped)),
    );
  });

  it("accepts a fail outcome with diagnostic message + free-form violations", () => {
    const failed = {
      outcome: "fail" as const,
      reason: "playwright-spawn-error",
      message: "ENOENT: npx not found",
      violations: [
        // extractViolations output — title + message
        { title: "checkout flow", message: "expect(locator).toBeVisible()" },
      ],
    };
    assert.doesNotThrow(() =>
      validateArtifactPayload("validation", JSON.stringify(failed)),
    );
  });

  it("rejects an unknown outcome value", () => {
    const bad = { outcome: "maybe", violations: [] };
    assert.throws(
      () => validateArtifactPayload("validation", JSON.stringify(bad)),
      (err: unknown) => err instanceof ArtifactValidationError,
    );
  });

  it("rejects missing violations array", () => {
    const bad = { outcome: "pass" };
    assert.throws(
      () => validateArtifactPayload("validation", JSON.stringify(bad)),
      (err: unknown) => err instanceof ArtifactValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// deployment-url schema
// ---------------------------------------------------------------------------

describe("DeploymentUrlArtifactSchema", () => {
  it("accepts a minimal {url}", () => {
    assert.doesNotThrow(() =>
      validateArtifactPayload(
        "deployment-url",
        JSON.stringify({ url: "https://preview.example.com" }),
      ),
    );
  });

  it("accepts optional environment field", () => {
    assert.doesNotThrow(() =>
      DeploymentUrlArtifactSchema.parse({
        url: "https://preview.example.com",
        environment: "preview",
        schemaVersion: 1,
      }),
    );
  });

  it("rejects a non-URL string", () => {
    assert.throws(
      () =>
        validateArtifactPayload(
          "deployment-url",
          JSON.stringify({ url: "not a url" }),
        ),
      (err: unknown) => err instanceof ArtifactValidationError,
    );
  });

  it("rejects missing url", () => {
    assert.throws(
      () =>
        validateArtifactPayload(
          "deployment-url",
          JSON.stringify({ environment: "preview" }),
        ),
      (err: unknown) => err instanceof ArtifactValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Backwards compatibility — artifacts without schemaVersion still pass
// ---------------------------------------------------------------------------

describe("schemaVersion backwards compatibility", () => {
  it("triage-handoff without schemaVersion is accepted (legacy artifacts)", () => {
    const legacy = {
      failingItem: "backend-dev",
      errorExcerpt: "x",
      errorSignature: "sig",
      triageDomain: "backend",
      triageReason: "r",
      priorAttemptCount: 0,
    };
    assert.doesNotThrow(() =>
      validateArtifactPayload("triage-handoff", JSON.stringify(legacy)),
    );
  });

  it("qa-report with schemaVersion: 2 is rejected (literal guard)", () => {
    const futuristic = { ...VALID_QA_REPORT_PASS, schemaVersion: 2 };
    assert.throws(
      () => validateArtifactPayload("qa-report", JSON.stringify(futuristic)),
      (err: unknown) => err instanceof ArtifactValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Phase 1.1 — markdown envelope schemas (summary, debug-notes)
// ---------------------------------------------------------------------------

const VALID_SUMMARY_ENVELOPE = [
  "---",
  "schemaVersion: 1",
  "producedBy: backend-dev",
  "producedAt: 2026-04-23T12:34:56Z",
  "---",
  "",
  "Added SSE streaming to /generate endpoint.",
  "",
].join("\n");

const VALID_DEBUG_NOTES_ENVELOPE = [
  "---",
  "schemaVersion: 1",
  "producedBy: backend-debug",
  "producedAt: 2026-04-23T12:34:56Z",
  "rootCause: race in foo()",
  "touchedFiles:",
  "  - src/handlers/foo.ts",
  "---",
  "",
  "Debug body goes here.",
].join("\n");

describe("markdown-envelope schemas (summary, debug-notes)", () => {
  it("summary advertises schemaVersion = 1", () => {
    assert.equal(getArtifactSchemaVersion("summary"), 1);
    assert.ok(getArtifactKind("summary").schema);
  });

  it("debug-notes advertises schemaVersion = 1", () => {
    assert.equal(getArtifactSchemaVersion("debug-notes"), 1);
    assert.ok(getArtifactKind("debug-notes").schema);
  });

  it("accepts a valid summary envelope", () => {
    assert.doesNotThrow(() =>
      validateArtifactPayload("summary", VALID_SUMMARY_ENVELOPE),
    );
  });

  it("accepts a valid debug-notes envelope (with optional fields)", () => {
    assert.doesNotThrow(() =>
      validateArtifactPayload("debug-notes", VALID_DEBUG_NOTES_ENVELOPE),
    );
  });

  it("rejects summary with no front-matter fence", () => {
    assert.throws(
      () => validateArtifactPayload("summary", "plain body"),
      (err: unknown) =>
        err instanceof ArtifactValidationError &&
        /front-matter envelope/.test(err.message),
    );
  });

  it("rejects summary missing required schemaVersion", () => {
    const bad = [
      "---",
      "producedBy: backend-dev",
      "producedAt: 2026-04-23T12:34:56Z",
      "---",
      "",
      "body",
    ].join("\n");
    assert.throws(
      () => validateArtifactPayload("summary", bad),
      (err: unknown) =>
        err instanceof ArtifactValidationError &&
        /schemaVersion/.test(err.message),
    );
  });

  it("rejects summary with wrong schemaVersion (literal 1 guard)", () => {
    const bad = [
      "---",
      "schemaVersion: 2",
      "producedBy: backend-dev",
      "producedAt: 2026-04-23T12:34:56Z",
      "---",
      "body",
    ].join("\n");
    assert.throws(
      () => validateArtifactPayload("summary", bad),
      (err: unknown) =>
        err instanceof ArtifactValidationError &&
        /schemaVersion/.test(err.message),
    );
  });

  it("rejects debug-notes missing producedBy", () => {
    const bad = [
      "---",
      "schemaVersion: 1",
      "producedAt: 2026-04-23T12:34:56Z",
      "---",
      "body",
    ].join("\n");
    assert.throws(
      () => validateArtifactPayload("debug-notes", bad),
      (err: unknown) =>
        err instanceof ArtifactValidationError &&
        /producedBy/.test(err.message),
    );
  });

  it("preserves body after front-matter fence (parseFrontMatter round-trip)", async () => {
    const { parseFrontMatter } = await import("../artifact-catalog.js");
    const { frontMatter, body } = parseFrontMatter(VALID_SUMMARY_ENVELOPE);
    assert.ok(frontMatter);
    assert.match(body, /Added SSE streaming/);
  });
});

