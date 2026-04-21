/**
 * pending-context-handoff.test.ts — B1 structured triage handoff rendering.
 *
 * Covers:
 *   - `renderTriageHandoffMarkdown` — pure formatter for the typed handoff.
 *   - `renderPendingContext` — composes narrative + handoff block.
 *   - `JsonFileStateStore.setPendingContext` — backwards compatible with
 *     plain strings; renders structured payloads to markdown.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PipelineState, TriageHandoff } from "../../types.js";

const tmpAppRoot = mkdtempSync(join(tmpdir(), "dagent-handoff-test-"));
mkdirSync(join(tmpAppRoot, "in-progress"), { recursive: true });
process.env.APP_ROOT = tmpAppRoot;

const {
  JsonFileStateStore,
  renderTriageHandoffMarkdown,
  renderPendingContext,
} = await import("../json-file-state-store.js");
const { statePath } = await import("../file-state/io.js");

const SLUG = "handoff-fixture";

function baseState(): PipelineState {
  return {
    feature: SLUG,
    workflowName: "fixture",
    started: "2026-04-19T00:00:00.000Z",
    deployedUrl: null,
    implementationNotes: null,
    items: [
      { key: "dev", label: "Dev", agent: "dev", status: "pending", error: null },
    ],
    errorLog: [],
    dependencies: { dev: [] },
    nodeTypes: { dev: "agent" },
    nodeCategories: { dev: "dev" },
    jsonGated: {},
    naByType: [],
    salvageSurvivors: [],
  };
}

beforeEach(() => {
  writeFileSync(statePath(SLUG), JSON.stringify(baseState(), null, 2) + "\n", "utf8");
});

const handoff: TriageHandoff = {
  failingItem: "e2e-runner",
  errorExcerpt: "AssertionError: expected selector [data-testid=modal] to be visible\n  at spec.ts:42",
  errorSignature: "abc12345",
  triageDomain: "test-code",
  triageReason: "Locator does not match the updated DOM",
  priorAttemptCount: 2,
  touchedFiles: ["apps/example/e2e/widget.spec.ts"],
};

describe("renderTriageHandoffMarkdown (B1)", () => {
  it("emits a well-formed markdown block", () => {
    const md = renderTriageHandoffMarkdown(handoff);
    assert.match(md, /^## 🧩 Triage handoff/);
    assert.match(md, /\*\*Failing item:\*\* `e2e-runner`/);
    assert.match(md, /\*\*Domain:\*\* test-code/);
    assert.match(md, /\*\*Error signature:\*\* `abc12345`/);
    assert.match(md, /\*\*Prior attempts:\*\* 2/);
    assert.match(md, /apps\/example\/e2e\/widget\.spec\.ts/);
    assert.match(md, /AssertionError: expected selector/);
  });

  it("renders '(none captured)' when touchedFiles is empty", () => {
    const md = renderTriageHandoffMarkdown({ ...handoff, touchedFiles: [] });
    assert.match(md, /\*\*Touched files:\*\* \(none captured\)/);
  });

  it("renders the 📎 Evidence section when evidence is present", () => {
    const md = renderTriageHandoffMarkdown({
      ...handoff,
      evidence: [
        {
          testTitle: "shows widget modal",
          attachments: [
            {
              name: "screenshot",
              path: "/tmp/app/in-progress/feat_evidence/0-screenshot.png",
              contentType: "image/png",
            },
            {
              name: "trace",
              path: "/tmp/app/in-progress/feat_evidence/0-trace.zip",
              contentType: "application/zip",
            },
          ],
        },
      ],
    });
    assert.match(md, /### 📎 Evidence/);
    assert.match(md, /\*\*shows widget modal\*\*/);
    assert.match(md, /0-screenshot\.png.*image\/png/);
    assert.match(md, /0-trace\.zip.*application\/zip/);
  });

  it("omits the 📎 Evidence section when evidence is empty or missing", () => {
    const noEvidence = renderTriageHandoffMarkdown(handoff);
    assert.ok(!/### 📎 Evidence/.test(noEvidence));
    const emptyEvidence = renderTriageHandoffMarkdown({ ...handoff, evidence: [] });
    assert.ok(!/### 📎 Evidence/.test(emptyEvidence));
  });

  it("reframes the excerpt heading as step context, not root cause", () => {
    const md = renderTriageHandoffMarkdown(handoff);
    assert.match(md, /### Failing test step \(context\)/);
    assert.match(md, /not\*\* the root cause/);
    // Old heading must be gone.
    assert.ok(!/### Error excerpt/.test(md));
  });

  it("renders the 🌐 Browser signals section with all three channels", () => {
    const md = renderTriageHandoffMarkdown({
      ...handoff,
      browserSignals: {
        uncaughtErrors: [
          { message: "TypeError: x is undefined", inTest: "quick view" },
        ],
        consoleErrors: ["error: hydration mismatch"],
        failedRequests: ["GET /api/product -> 500"],
      },
    });
    assert.match(md, /### 🌐 Browser signals \(baseline-filtered\)/);
    assert.match(md, /\*\*Uncaught errors\*\*/);
    assert.match(md, /TypeError: x is undefined.*in \*quick view\*/);
    assert.match(md, /\*\*Console errors:\*\*/);
    assert.match(md, /hydration mismatch/);
    assert.match(md, /\*\*Failed network requests:\*\*/);
    assert.match(md, /\/api\/product -> 500/);
  });

  it("renders only non-empty browser-signal subsections", () => {
    const md = renderTriageHandoffMarkdown({
      ...handoff,
      browserSignals: {
        uncaughtErrors: [],
        consoleErrors: ["only console"],
        failedRequests: [],
      },
    });
    assert.match(md, /### 🌐 Browser signals/);
    assert.match(md, /\*\*Console errors:\*\*/);
    assert.ok(!/\*\*Uncaught errors\*\*/.test(md));
    assert.ok(!/\*\*Failed network requests:\*\*/.test(md));
  });

  it("omits the 🌐 Browser signals section when browserSignals is missing", () => {
    const md = renderTriageHandoffMarkdown(handoff);
    assert.ok(!/### 🌐 Browser signals/.test(md));
  });
});

describe("renderPendingContext (B1)", () => {
  it("combines narrative and handoff markdown with a blank line separator", () => {
    const rendered = renderPendingContext({
      narrative: "## Retry context\nPrior attempt failed.",
      handoff,
    });
    assert.match(rendered, /^## Retry context\nPrior attempt failed\.\n\n## 🧩 Triage handoff/);
  });
});

describe("JsonFileStateStore.setPendingContext (B1 backward compat)", () => {
  it("accepts a plain string (legacy path) and persists verbatim", async () => {
    const store = new JsonFileStateStore();
    await store.setPendingContext(SLUG, "dev", "plain-string-context");
    const disk = await store.getStatus(SLUG);
    const dev = disk.items.find((i) => i.key === "dev")!;
    assert.equal((dev as { pendingContext?: string }).pendingContext, "plain-string-context");
  });

  it("accepts a structured PendingContextPayload and renders it to markdown", async () => {
    const store = new JsonFileStateStore();
    await store.setPendingContext(SLUG, "dev", {
      narrative: "## Retry context\nPrior attempt failed.",
      handoff,
    });
    const disk = await store.getStatus(SLUG);
    const dev = disk.items.find((i) => i.key === "dev")!;
    const persisted = (dev as { pendingContext?: string }).pendingContext ?? "";
    assert.match(persisted, /^## Retry context/);
    assert.match(persisted, /## 🧩 Triage handoff/);
    assert.match(persisted, /\*\*Failing item:\*\* `e2e-runner`/);
  });
});

process.on("exit", () => {
  try {
    rmSync(tmpAppRoot, { recursive: true, force: true });
  } catch { /* noop */ }
});
