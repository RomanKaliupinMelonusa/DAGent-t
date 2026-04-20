/**
 * triage/playwright-report.ts — Parse Playwright `--reporter=json` output into
 * a compact, triage-ready StructuredFailure shape.
 *
 * Consumed by:
 *   - `handlers/local-exec.ts` — when a node declares `structured_failure:
 *     { format: "playwright-json", path: "..." }`, the handler reads the
 *     referenced artifact on failure and emits the parsed shape on
 *     `handlerOutput.structuredFailure`.
 *   - Future `triage/contract-classifier.ts` (Phase C.1) — deterministically
 *     maps uncaught JS errors in browser contexts to `impl-defect`.
 *
 * The parser tolerates partial / malformed reports — a corrupt file yields
 * `null` and the caller falls back to raw stdout.
 */

import fs from "node:fs";

/** Discriminated `kind` keeps future formats (jest-json, pytest-json) additive. */
export interface StructuredFailure {
  readonly kind: "playwright-json";
  /** Total tests counted by the report. */
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  /** Failing tests — one entry per unique test, not per retry. */
  readonly failedTests: ReadonlyArray<{
    readonly title: string;
    readonly file: string;
    readonly line: number | null;
    /** First assertion / error message on the test — stripped of ANSI. */
    readonly error: string;
    /** First few lines of the stack trace, ANSI-stripped. */
    readonly stackHead: string;
  }>;
  /** Uncaught runtime exceptions captured from browser contexts — the
   *  signal we care most about, because these classify as `impl-defect`. */
  readonly uncaughtErrors: ReadonlyArray<{
    readonly message: string;
    readonly inTest: string;
  }>;
  /** `page.on('console', 'error')` captures surfaced via `attachments` or
   *  stdout. Best-effort: the list reporter elides most of these so the
   *  feature spec should attach them explicitly. */
  readonly consoleErrors: ReadonlyArray<string>;
  /** `page.on('requestfailed')` captures likewise. */
  readonly failedRequests: ReadonlyArray<string>;
}

const ANSI = /\u001b\[[0-9;]*m/g;
const stripAnsi = (s: string): string => s.replace(ANSI, "");

// ─── Minimal structural types for the bits of the report we read ────────
// The full Playwright JSON reporter schema is large; we type only what we
// touch so future Playwright upgrades don't break us on irrelevant fields.

interface PwError { message?: string; stack?: string }
interface PwAttachment { name?: string; contentType?: string; body?: string; path?: string }
interface PwTestResult { status?: string; errors?: PwError[]; attachments?: PwAttachment[]; stdout?: { text?: string }[]; stderr?: { text?: string }[] }
interface PwTest { title?: string; status?: string; results?: PwTestResult[] }
interface PwSpec { title?: string; file?: string; line?: number; tests?: PwTest[] }
interface PwSuite { file?: string; specs?: PwSpec[]; suites?: PwSuite[] }
interface PwReport { stats?: { expected?: number; unexpected?: number; skipped?: number; flaky?: number }; suites?: PwSuite[] }

function* walkSpecs(suites: PwSuite[] | undefined, parentFile = ""): Generator<{ spec: PwSpec; file: string }> {
  if (!suites) return;
  for (const suite of suites) {
    const file = suite.file || parentFile;
    if (suite.specs) {
      for (const spec of suite.specs) yield { spec, file };
    }
    if (suite.suites) yield* walkSpecs(suite.suites, file);
  }
}

/** Decode an attachment body when present (Playwright stores base64). */
function decodeAttachment(att: PwAttachment): string | null {
  if (att.body) {
    try { return Buffer.from(att.body, "base64").toString("utf-8"); } catch { return att.body; }
  }
  if (att.path) {
    try { return fs.readFileSync(att.path, "utf-8"); } catch { return null; }
  }
  return null;
}

/**
 * Parse a Playwright JSON reporter artifact. Returns `null` on any error
 * (missing file, invalid JSON, shape surprise).
 */
export function parsePlaywrightReport(reportPath: string): StructuredFailure | null {
  let raw: string;
  try {
    raw = fs.readFileSync(reportPath, "utf-8");
  } catch {
    return null;
  }
  let data: PwReport;
  try {
    data = JSON.parse(raw) as PwReport;
  } catch {
    return null;
  }

  const stats = data.stats ?? {};
  const passed = stats.expected ?? 0;
  const failed = stats.unexpected ?? 0;
  const skipped = stats.skipped ?? 0;
  const total = passed + failed + skipped + (stats.flaky ?? 0);

  const failedTests: StructuredFailure["failedTests"][number][] = [];
  const uncaughtErrors: StructuredFailure["uncaughtErrors"][number][] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  for (const { spec, file } of walkSpecs(data.suites)) {
    const title = spec.title ?? "<untitled>";
    const relFile = file || "<unknown>";
    const line = typeof spec.line === "number" ? spec.line : null;

    for (const test of spec.tests ?? []) {
      const lastResult = test.results?.[test.results.length - 1];
      if (!lastResult) continue;
      if (lastResult.status === "passed" || lastResult.status === "skipped") continue;

      const firstErr = lastResult.errors?.[0];
      const errMsg = stripAnsi(firstErr?.message ?? "(no error message)");
      const stackHead = stripAnsi((firstErr?.stack ?? "").split("\n").slice(0, 4).join("\n"));

      failedTests.push({ title, file: relFile, line, error: errMsg, stackHead });

      // Mine uncaught errors, console errors, failed requests from attachments
      // and stdout/stderr streams.
      for (const att of lastResult.attachments ?? []) {
        const body = decodeAttachment(att);
        if (!body) continue;
        // Convention from e2e-guidelines rule #9: agents may attach
        // `console-errors` / `failed-requests` text blobs on failure.
        if (att.name === "console-errors" || att.name === "consoleErrors") {
          for (const line of body.split(/\r?\n/).filter(Boolean)) consoleErrors.push(line);
        } else if (att.name === "failed-requests" || att.name === "failedRequests") {
          for (const line of body.split(/\r?\n/).filter(Boolean)) failedRequests.push(line);
        } else if (att.name === "uncaught-error" || att.name === "uncaughtError") {
          uncaughtErrors.push({ message: body.trim(), inTest: title });
        }
      }

      const streams = [
        ...(lastResult.stdout ?? []).map((s) => s.text ?? ""),
        ...(lastResult.stderr ?? []).map((s) => s.text ?? ""),
      ].join("\n");
      if (streams) {
        // Heuristic: anything that looks like a browser uncaught TypeError.
        const uncaughtRe = /(?:Uncaught\s+)?(TypeError|ReferenceError|RangeError|SyntaxError):\s+[^\n]+/g;
        const matches = streams.match(uncaughtRe);
        if (matches) {
          for (const m of matches) uncaughtErrors.push({ message: stripAnsi(m), inTest: title });
        }
      }
    }
  }

  return {
    kind: "playwright-json",
    total, passed, failed, skipped,
    failedTests,
    uncaughtErrors,
    consoleErrors,
    failedRequests,
  };
}

/**
 * Best-effort check: is this structured failure dominated by impl-defect
 * signals (uncaught runtime exceptions)? Used by the contract-violation
 * pre-classifier to short-circuit triage.
 */
export function hasImplDefectSignal(f: StructuredFailure): boolean {
  return f.uncaughtErrors.length > 0;
}
