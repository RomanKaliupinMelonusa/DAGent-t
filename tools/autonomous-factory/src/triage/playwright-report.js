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
import path from "node:path";
import { createHash } from "node:crypto";
import { WORKING_DIR } from "../paths/feature-paths.js";
const ANSI = /\u001b\[[0-9;]*m/g;
const stripAnsi = (s) => s.replace(ANSI, "");
function* walkSpecs(suites, parentFile = "") {
    if (!suites)
        return;
    for (const suite of suites) {
        const file = suite.file || parentFile;
        if (suite.specs) {
            for (const spec of suite.specs)
                yield { spec, file };
        }
        if (suite.suites)
            yield* walkSpecs(suite.suites, file);
    }
}
/** Decode an attachment body when present (Playwright stores base64). */
function decodeAttachment(att) {
    if (att.body) {
        try {
            return Buffer.from(att.body, "base64").toString("utf-8");
        }
        catch {
            return att.body;
        }
    }
    if (att.path) {
        try {
            return fs.readFileSync(att.path, "utf-8");
        }
        catch {
            return null;
        }
    }
    return null;
}
/**
 * Level-1 evidence — deterministic redaction guard. Screenshots can embed
 * sensitive user data (account / checkout / login / auth flows in a
 * commerce app, banking views, medical records, …). We skip copying those
 * binaries into the evidence dir.
 *
 * The pattern list is app-configurable via `config.evidence.redact_patterns`
 * in `.apm/apm.yml`. When nothing is declared, the built-in default below
 * is used — it targets commerce-style PII which is the dominant case for
 * this pipeline's initial users. Apps with a different sensitivity model
 * (e.g. non-commerce) should override the list; set it to `[]` to disable
 * redaction entirely.
 */
const DEFAULT_REDACT_PATTERNS = [
    "account", "checkout", "login", "auth", "password", "credit", "card",
];
/** Compile an array of regex sources into a single case-insensitive
 *  alternation. Invalid sources throw — caller (APM compiler) validates
 *  early. Returns `null` when the list is empty (redaction disabled). */
function compileRedactRegex(patterns) {
    if (patterns.length === 0)
        return null;
    // Wrap each source in a non-capturing group so top-level `|` in a user
    // pattern doesn't spill across entries.
    return new RegExp(patterns.map((p) => `(?:${p})`).join("|"), "i");
}
const DEFAULT_REDACT_RE = compileRedactRegex(DEFAULT_REDACT_PATTERNS);
function shouldRedactEvidence(title, file, re) {
    if (!re)
        return false;
    return re.test(title) || re.test(file);
}
/**
 * Level-1 evidence — classify a Playwright attachment as a binary
 * artifact worth copying (screenshot, video, trace zip). Text-only
 * attachments (console-errors, failed-requests, …) are handled by the
 * existing `decodeAttachment` path and never land in the evidence dir.
 */
function isBinaryEvidence(att) {
    if (!att.path)
        return false;
    const ct = att.contentType ?? "";
    if (ct.startsWith("image/") || ct.startsWith("video/"))
        return true;
    if (ct === "application/zip")
        return true;
    // Named-attachment fallback: Playwright emits `trace` / `screenshot` /
    // `video` names even when contentType is missing in older versions.
    const name = att.name ?? "";
    return name === "trace" || name === "screenshot" || name === "video";
}
/**
 * Level-1 evidence — copy an on-disk attachment into the feature's
 * evidence directory. Returns the copied absolute path, or `null` when
 * the source is missing / unreadable / suspected path-traversal.
 * Filenames are deterministic (`<testIdx>-<name>.<ext>`) so re-runs
 * overwrite rather than accumulate.
 */
function copyEvidence(att, evidenceDir, testIdx) {
    if (!att.path)
        return null;
    // Path-traversal guard: only copy when the source file actually exists
    // and is readable. We do not constrain the source to a particular
    // ancestor — Playwright writes to `test-results/` which may live
    // outside the app root (e.g. via a custom `outputDir`).
    let src;
    try {
        src = fs.realpathSync(att.path);
    }
    catch {
        return null;
    }
    const ext = path.extname(src) || (att.contentType === "application/zip" ? ".zip" : "");
    const safeName = (att.name ?? "attachment").replace(/[^a-zA-Z0-9_-]/g, "_");
    const destName = `${testIdx}-${safeName}${ext}`;
    const dest = path.join(evidenceDir, destName);
    try {
        fs.mkdirSync(evidenceDir, { recursive: true });
        fs.copyFileSync(src, dest);
        return dest;
    }
    catch {
        return null;
    }
}
/**
 * Parse a Playwright JSON reporter artifact. Returns `null` on any error
 * (missing file, invalid JSON, shape surprise).
 */
export function parsePlaywrightReport(reportPath, opts = {}) {
    let raw;
    try {
        raw = fs.readFileSync(reportPath, "utf-8");
    }
    catch {
        return null;
    }
    let data;
    try {
        data = JSON.parse(raw);
    }
    catch {
        return null;
    }
    const stats = data.stats ?? {};
    const passed = stats.expected ?? 0;
    const failed = stats.unexpected ?? 0;
    const skipped = stats.skipped ?? 0;
    const total = passed + failed + skipped + (stats.flaky ?? 0);
    const failedTests = [];
    const uncaughtErrors = [];
    const consoleErrors = [];
    const failedRequests = [];
    const evidenceDir = opts.appRoot && opts.slug
        ? path.join(opts.appRoot, WORKING_DIR, `${opts.slug}_evidence`)
        : null;
    // Compile the effective redaction regex once — either user-supplied or
    // the built-in commerce-PII default. An empty user array disables the
    // guard (redactRe === null → nothing is redacted).
    const redactRe = opts.redactPatterns === undefined
        ? DEFAULT_REDACT_RE
        : compileRedactRegex(opts.redactPatterns);
    let failedIdx = 0;
    for (const { spec, file } of walkSpecs(data.suites)) {
        const title = spec.title ?? "<untitled>";
        const relFile = file || "<unknown>";
        const line = typeof spec.line === "number" ? spec.line : null;
        for (const test of spec.tests ?? []) {
            const lastResult = test.results?.[test.results.length - 1];
            if (!lastResult)
                continue;
            if (lastResult.status === "passed" || lastResult.status === "skipped")
                continue;
            const firstErr = lastResult.errors?.[0];
            const errMsg = stripAnsi(firstErr?.message ?? "(no error message)");
            const stackHead = stripAnsi((firstErr?.stack ?? "").split("\n").slice(0, 4).join("\n"));
            const testAttachments = [];
            const redacted = shouldRedactEvidence(title, relFile, redactRe);
            const failedEntry = { title, file: relFile, line, error: errMsg, stackHead, attachments: testAttachments };
            failedTests.push(failedEntry);
            // Mine uncaught errors, console errors, failed requests from attachments
            // and stdout/stderr streams. Binary attachments (screenshot/video/trace)
            // are copied to the evidence dir when opts.appRoot+slug are supplied.
            for (const att of lastResult.attachments ?? []) {
                if (isBinaryEvidence(att)) {
                    if (evidenceDir && !redacted) {
                        const copied = copyEvidence(att, evidenceDir, failedIdx);
                        if (copied) {
                            testAttachments.push({
                                name: att.name ?? "attachment",
                                path: copied,
                                contentType: att.contentType ?? "application/octet-stream",
                            });
                        }
                    }
                    continue;
                }
                const body = decodeAttachment(att);
                if (!body)
                    continue;
                // Convention from e2e-guidelines rule #9: agents may attach
                // `console-errors` / `failed-requests` text blobs on failure.
                if (att.name === "console-errors" || att.name === "consoleErrors") {
                    for (const line of body.split(/\r?\n/).filter(Boolean))
                        consoleErrors.push(line);
                }
                else if (att.name === "failed-requests" || att.name === "failedRequests") {
                    for (const line of body.split(/\r?\n/).filter(Boolean))
                        failedRequests.push(line);
                }
                else if (att.name === "uncaught-error" || att.name === "uncaughtError") {
                    uncaughtErrors.push({ message: body.trim(), inTest: title });
                }
                else if (
                // Playwright 1.50+ emits `error-context` as a markdown attachment
                // containing an ARIA snapshot of the page at the failure point.
                // Highest-signal forensic artifact — inline it onto the failed
                // test entry so downstream handoff rendering can surface it.
                att.name === "error-context" ||
                    (att.contentType === "text/markdown" &&
                        (att.path?.endsWith("error-context.md") ?? false))) {
                    failedEntry.errorContext = stripAnsi(body);
                }
            }
            failedIdx++;
            const streams = [
                ...(lastResult.stdout ?? []).map((s) => s.text ?? ""),
                ...(lastResult.stderr ?? []).map((s) => s.text ?? ""),
            ].join("\n");
            if (streams) {
                // Heuristic: anything that looks like a browser uncaught TypeError.
                const uncaughtRe = /(?:Uncaught\s+)?(TypeError|ReferenceError|RangeError|SyntaxError):\s+[^\n]+/g;
                const matches = streams.match(uncaughtRe);
                if (matches) {
                    for (const m of matches)
                        uncaughtErrors.push({ message: stripAnsi(m), inTest: title });
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
export function hasImplDefectSignal(f) {
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
export function extractPrimaryCause(rawError) {
    if (!rawError)
        return null;
    const lines = stripAnsi(rawError).split(/\r?\n/);
    let lastHeader = null;
    for (let i = 0; i < lines.length; i++) {
        const m = FAILURE_HEADER_RE.exec(lines[i]);
        if (m)
            lastHeader = { idx: i, file: m[1], title: m[2].trim() };
    }
    if (!lastHeader)
        return null;
    // Scan up to ~60 lines after the header for the cause lines.
    const end = Math.min(lastHeader.idx + 60, lines.length);
    const causeLines = [];
    for (let i = lastHeader.idx + 1; i < end; i++) {
        const ln = lines[i];
        if (FAILURE_HEADER_RE.test(ln))
            break;
        if (CAUSE_LINE_RE.test(ln)) {
            causeLines.push(ln.trim());
            if (causeLines.length >= 6)
                break;
        }
    }
    if (causeLines.length === 0)
        return null;
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
 * free-form log is dominated by tens of kilobytes of framework console
 * warnings whose component stacks rotate between builds (e.g. bundler output
 * frames like `vendor.js:L:C` / `main.js:L:C`). Hashing that prose makes
 * the signature unstable across builds even when the real failure — e.g.
 * `TimeoutError: locator.waitFor: waiting for getByTestId('some-widget')`
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
export function computeStructuredSignature(payload) {
    if (!payload || typeof payload !== "object")
        return null;
    if (payload.kind !== "playwright-json")
        return null;
    const f = payload;
    if (f.failedTests.length === 0 && f.uncaughtErrors.length === 0)
        return null;
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
//# sourceMappingURL=playwright-report.js.map