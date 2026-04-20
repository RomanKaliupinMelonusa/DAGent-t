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
import { createHash } from "node:crypto";

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

/**
 * Round-2 R4 — extract the primary cause from a raw Playwright stdout/stderr blob.
 *
 * When the pipeline doesn't have a parsed `StructuredFailure` (e.g. the
 * `playwright-json` reporter wasn't configured on a node, or the artifact
 * was missing) the triage layer otherwise receives a 30 KB ANSI-riddled
 * log in which the real TimeoutError / Error / Expected-line is buried
 * hundreds of lines deep. The LLM router consistently misclassifies these.
 *
 * This scanner walks the raw output looking for Playwright's test-failure
 * header pattern:
 *     1) [project] › e2e/feature.spec.ts:123:45 › suite › test title
 * and captures the first `TimeoutError:` / `Error:` / `Expected:` lines
 * that follow before the next failure header or the end of the report.
 * Returns a compact markdown block, or `null` when no failure header
 * could be located (caller should fall back to untrimmed raw text).
 *
 * Exported for unit testing; consumed by `contract-evidence.ts`.
 */
const FAILURE_HEADER_RE = /^\s*\d+\)\s+\[[^\]]+\]\s+›\s+(\S+)\s+›\s+(.+)$/;
const CAUSE_LINE_RE = /^\s*(?:Error|TimeoutError|Expected|Received|Actual):/;

export function extractPrimaryCause(rawError: string): string | null {
  if (!rawError) return null;
  const lines = stripAnsi(rawError).split(/\r?\n/);
  let lastHeader: { idx: number; file: string; title: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const m = FAILURE_HEADER_RE.exec(lines[i]);
    if (m) lastHeader = { idx: i, file: m[1], title: m[2].trim() };
  }
  if (!lastHeader) return null;

  // Scan up to ~60 lines after the header for the cause lines.
  const end = Math.min(lastHeader.idx + 60, lines.length);
  const causeLines: string[] = [];
  for (let i = lastHeader.idx + 1; i < end; i++) {
    const ln = lines[i];
    if (FAILURE_HEADER_RE.test(ln)) break;
    if (CAUSE_LINE_RE.test(ln)) {
      causeLines.push(ln.trim());
      if (causeLines.length >= 6) break;
    }
  }
  if (causeLines.length === 0) return null;

  return [
    `Failing test: \`${lastHeader.file}\` › ${lastHeader.title}`,
    ...causeLines.map((l) => `  ${l}`),
  ].join("\n");
}

/**
 * Round-2 R3 (replacement) — compute an error signature from the STRUCTURED
 * failure shape, not from raw stdout.
 *
 * Motivation: when a Playwright handler produces a `StructuredFailure`, its
 * free-form log is dominated by tens of kilobytes of React warning console
 * dumps whose component stacks rotate between builds (e.g. PWA Kit's
 * `vendor.js:L:C` / `main.js:L:C` frames). Hashing that prose makes the
 * signature unstable across builds even when the real failure — a
 * `TimeoutError: locator.waitFor: waiting for getByTestId('quick-view-modal')`
 * — is identical.
 *
 * The structured hash is built from fields that are stable by construction:
 *   - each failing test's first error-line class (`TimeoutError`, `Error`, …),
 *   - each failing test's title,
 *   - each failing test's first `getByTestId('…')` locator (the contract surface),
 *   - the count of `uncaughtErrors` (not their texts — those carry line:col too).
 *
 * Returns `null` when the input is not a playwright-json StructuredFailure or
 * carries no failing tests — callers then fall back to the raw-string hash.
 */
const ERROR_CLASS_RE = /^\s*(TimeoutError|TypeError|ReferenceError|RangeError|SyntaxError|Error|AssertionError)\b/;
const GET_BY_TESTID_SIG_RE = /getByTestId\(\s*['"]([^'"]+)['"]\s*\)/;

export function computeStructuredSignature(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  if ((payload as { kind?: unknown }).kind !== "playwright-json") return null;
  const f = payload as StructuredFailure;
  if (f.failedTests.length === 0 && f.uncaughtErrors.length === 0) return null;

  // Canonicalise each failing test into a stable tuple.
  const testTuples = f.failedTests
    .map((t) => {
      const firstErrLine = (t.error || "").split(/\r?\n/)[0] ?? "";
      const cls = ERROR_CLASS_RE.exec(firstErrLine)?.[1] ?? "Error";
      const locator = GET_BY_TESTID_SIG_RE.exec(t.error)?.[1]
        ?? GET_BY_TESTID_SIG_RE.exec(t.stackHead)?.[1]
        ?? "";
      return `${cls}|${t.title}|${locator}`;
    })
    // Deterministic ordering — tests may be reported in different orders
    // between runs when workers shuffle.
    .sort();

  // Uncaught errors: count only. Their message text carries line:col noise
  // and is correlated 1:1 with how many tests crashed.
  const uncaughtCount = f.uncaughtErrors.length;

  const canonical = `pw|tests=${testTuples.join(";")}|uncaught=${uncaughtCount}`;
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
