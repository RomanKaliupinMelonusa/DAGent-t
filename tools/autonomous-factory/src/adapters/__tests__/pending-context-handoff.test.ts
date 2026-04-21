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

  it("does NOT render the 📎 Evidence section even when evidence is present (data kept on handoff for the future debug agent)", () => {
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
          ],
        },
      ],
    });
    assert.ok(!/### 📎 Evidence/.test(md));
    assert.ok(!/0-screenshot\.png/.test(md));
  });

  it("does NOT render the 🌐 Browser signals section even when browserSignals is present", () => {
    const md = renderTriageHandoffMarkdown({
      ...handoff,
      browserSignals: {
        uncaughtErrors: [{ message: "TypeError: x is undefined", inTest: "quick view" }],
        consoleErrors: ["error: hydration mismatch"],
        failedRequests: ["GET /api/product -> 500"],
      },
    });
    assert.ok(!/### 🌐 Browser signals/.test(md));
    assert.ok(!/TypeError: x is undefined/.test(md));
    assert.ok(!/hydration mismatch/.test(md));
    assert.ok(!/\/api\/product -> 500/.test(md));
  });

  it("does NOT render the 🕸️ DOM state (ARIA) snapshot block", () => {
    const md = renderTriageHandoffMarkdown({
      ...handoff,
      evidence: [
        {
          testTitle: "shows widget modal",
          attachments: [],
          errorContext: "# Page snapshot\n- banner",
        },
      ],
    });
    assert.ok(!/### 🕸️ DOM state at failure/.test(md));
    assert.ok(!/Page snapshot/.test(md));
  });

  it("does NOT render the baseline-drops provenance footer", () => {
    const md = renderTriageHandoffMarkdown({
      ...handoff,
      baselineDropCounts: { console: 3, network: 2, uncaught: 1 },
    });
    assert.ok(!/Noise filtered/.test(md));
  });

  it("renders the 🧪 Failed tests block when failedTests is populated, and suppresses the assertion excerpt", () => {
    const md = renderTriageHandoffMarkdown({
      ...handoff,
      failedTests: [
        { title: "open-quick-view-modal", file: "e2e/pqv.spec.ts", line: 92, error: "TimeoutError: locator.waitFor" },
        { title: "pickup-store-search", file: "e2e/pqv.spec.ts", line: 161, error: "TimeoutError: locator.waitFor" },
      ],
    });
    assert.match(md, /### 🧪 Failed tests/);
    assert.match(md, /\*\*open-quick-view-modal\*\* \(e2e\/pqv\.spec\.ts:92\) — TimeoutError/);
    assert.match(md, /\*\*pickup-store-search\*\* \(e2e\/pqv\.spec\.ts:161\)/);
    // Excerpt re-render must be suppressed.
    assert.ok(!/### Failing test step \(context\)/.test(md));
    assert.match(md, /Failing assertion excerpt omitted/);
  });

  it("falls back to rendering the excerpt when no failedTests are provided", () => {
    const md = renderTriageHandoffMarkdown(handoff);
    assert.match(md, /### Failing test step \(context\)/);
    assert.match(md, /AssertionError: expected selector/);
    assert.ok(!/### 🧪 Failed tests/.test(md));
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
