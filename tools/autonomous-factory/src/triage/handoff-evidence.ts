/**
 * triage/handoff-evidence.ts — Format-agnostic projection from a
 * `StructuredFailure` payload to the `TriageHandoff.evidence` shape.
 *
 * The triage handler is a pure classifier — it must not know the internal
 * schema of any particular reporter format. This module owns that dispatch
 * so that when `jest-json` / `pytest-json` / … land they add a branch here
 * without touching `triage-handler.ts`.
 *
 * Returns `undefined` when:
 *   - the input is not a recognised structured failure,
 *   - the recognised format has no binary evidence harvested.
 */

import type { TriageHandoff } from "../types.js";
import type { StructuredFailure } from "./playwright-report.js";

type Evidence = NonNullable<TriageHandoff["evidence"]>;
type BrowserSignals = NonNullable<TriageHandoff["browserSignals"]>;
type FailedTests = NonNullable<TriageHandoff["failedTests"]>;

// Per-channel caps. Keeps the dev-agent prompt bounded even when a flaky
// page spams hundreds of console warnings or failed image requests. The
// uncaught cap is tightest because each entry is the strongest impl-defect
// signal and the caps should favour breadth over repetition.
const MAX_UNCAUGHT = 10;
const MAX_CONSOLE = 15;
const MAX_NETWORK = 15;
const MAX_MESSAGE_CHARS = 300;
/** `error-context.md` cap per failed test — roughly ARIA snapshot of a
 *  page. Generous enough to include DOM landmarks and a few roles, but
 *  not so large one flaky test blows the dispatch prompt. */
const MAX_ERROR_CONTEXT_CHARS = 4_000;

function truncate(s: string): string {
  if (s.length <= MAX_MESSAGE_CHARS) return s;
  return `${s.slice(0, MAX_MESSAGE_CHARS - 1)}\u2026`;
}

function truncateErrorContext(s: string): string {
  if (s.length <= MAX_ERROR_CONTEXT_CHARS) return s;
  return `${s.slice(0, MAX_ERROR_CONTEXT_CHARS - 1)}\u2026`;
}

function fromPlaywrightJson(f: StructuredFailure): Evidence | undefined {
  const out: Array<Evidence[number]> = [];
  for (const t of f.failedTests) {
    const atts = t.attachments ?? [];
    const hasErrorContext = typeof t.errorContext === "string" && t.errorContext.length > 0;
    if (atts.length === 0 && !hasErrorContext) continue;
    out.push({
      testTitle: t.title,
      attachments: atts.map((a) => ({
        name: a.name,
        path: a.path,
        contentType: a.contentType,
      })),
      ...(hasErrorContext ? { errorContext: truncateErrorContext(t.errorContext as string) } : {}),
    });
  }
  return out.length > 0 ? out : undefined;
}

export function toHandoffEvidence(
  structured: unknown,
): TriageHandoff["evidence"] {
  if (!structured || typeof structured !== "object") return undefined;
  const kind = (structured as { kind?: unknown }).kind;
  if (kind === "playwright-json") {
    return fromPlaywrightJson(structured as StructuredFailure);
  }
  // Future: jest-json, pytest-json, … each add a branch here.
  return undefined;
}

function browserSignalsFromPlaywrightJson(
  f: StructuredFailure,
): BrowserSignals | undefined {
  const consoleErrors = f.consoleErrors.slice(0, MAX_CONSOLE).map(truncate);
  const failedRequests = f.failedRequests.slice(0, MAX_NETWORK).map(truncate);
  const uncaughtErrors = f.uncaughtErrors.slice(0, MAX_UNCAUGHT).map((e) => ({
    message: truncate(e.message),
    inTest: e.inTest,
  }));
  if (
    consoleErrors.length === 0 &&
    failedRequests.length === 0 &&
    uncaughtErrors.length === 0
  ) {
    return undefined;
  }
  return { consoleErrors, failedRequests, uncaughtErrors };
}

/**
 * Project a baseline-filtered `StructuredFailure` into the browser-signal
 * bullets rendered into the triage handoff markdown. Returns `undefined`
 * when the payload is not a recognised structured failure or every channel
 * is empty after filtering.
 */
export function toBrowserSignals(
  structured: unknown,
): TriageHandoff["browserSignals"] {
  if (!structured || typeof structured !== "object") return undefined;
  const kind = (structured as { kind?: unknown }).kind;
  if (kind === "playwright-json") {
    return browserSignalsFromPlaywrightJson(structured as StructuredFailure);
  }
  // Future: jest-json, pytest-json, … each add a branch here.
  return undefined;
}

// ---------------------------------------------------------------------------
// Compact failed-tests projection — minimal "what broke" summary for the
// redevelopment dev agent. Excludes stack traces, attachments, DOM snapshots,
// browser signals. A future debug agent (with Playwright MCP access) is
// expected to harvest deeper context on demand.
// ---------------------------------------------------------------------------

/** Max number of failing tests surfaced to the dev agent. Beyond this a
 *  truncation marker is appended (handled by the renderer). */
const MAX_FAILED_TESTS = 20;

/** Return the first non-empty line of a multi-line error message. */
function firstLine(s: string): string {
  for (const raw of s.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length > 0) return line;
  }
  return "";
}

function failedTestsFromPlaywrightJson(f: StructuredFailure): FailedTests | undefined {
  const out: Array<FailedTests[number]> = [];
  for (const t of f.failedTests.slice(0, MAX_FAILED_TESTS)) {
    out.push({
      title: t.title,
      ...(t.file ? { file: t.file } : {}),
      ...(t.line !== undefined ? { line: t.line } : {}),
      error: truncate(firstLine(t.error || "") || "(no error message)"),
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Project a structured failure into the compact `failedTests` list surfaced
 * in the triage handoff. Returns `undefined` when the payload is not a
 * recognised structured failure or no tests failed.
 */
export function toFailedTests(
  structured: unknown,
): TriageHandoff["failedTests"] {
  if (!structured || typeof structured !== "object") return undefined;
  const kind = (structured as { kind?: unknown }).kind;
  if (kind === "playwright-json") {
    return failedTestsFromPlaywrightJson(structured as StructuredFailure);
  }
  return undefined;
}
