/**
 * file-invocation-logger.test.ts — Phase 4 adapter unit tests.
 *
 * Covers the five sinks (events, tool-calls, messages, stdout, stderr),
 * append semantics (multiple calls accumulate), JSONL framing
 * (one record per line), automatic timestamp injection, and that
 * the adapter never throws upward — write errors land on `lastError`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileInvocationLogger } from "../file-invocation-logger.js";
import { buildSecretRedactor } from "../../telemetry/secret-redactor.js";

describe("FileInvocationLogger", () => {
  it("appends events as JSONL with auto-timestamp", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fil-events-"));
    const log = new FileInvocationLogger(dir);
    await log.event({ kind: "dispatch.start", invocationId: "inv_1" });
    await log.event({ kind: "agent.message", text: "hello" });
    const lines = readFileSync(join(dir, "events.jsonl"), "utf8")
      .split("\n").filter((l) => l.length > 0);
    assert.equal(lines.length, 2);
    const a = JSON.parse(lines[0]);
    const b = JSON.parse(lines[1]);
    assert.equal(a.kind, "dispatch.start");
    assert.equal(a.invocationId, "inv_1");
    assert.match(a.ts, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(b.kind, "agent.message");
  });

  it("preserves caller-supplied timestamps", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fil-ts-"));
    const log = new FileInvocationLogger(dir);
    await log.event({ ts: "2025-01-01T00:00:00Z", kind: "k" });
    const line = readFileSync(join(dir, "events.jsonl"), "utf8").trim();
    assert.equal(JSON.parse(line).ts, "2025-01-01T00:00:00Z");
  });

  it("writes tool-calls and messages to their own files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fil-multi-"));
    const log = new FileInvocationLogger(dir);
    await log.toolCall({ tool: "edit", file: "x.ts" });
    await log.message("assistant", "hi", { tokens: 3 });
    const tc = readFileSync(join(dir, "tool-calls.jsonl"), "utf8").trim();
    const msg = readFileSync(join(dir, "messages.jsonl"), "utf8").trim();
    assert.equal(JSON.parse(tc).tool, "edit");
    const m = JSON.parse(msg);
    assert.equal(m.role, "assistant");
    assert.equal(m.text, "hi");
    assert.equal(m.tokens, 3);
  });

  it("appends raw stdout/stderr chunks without framing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fil-raw-"));
    const log = new FileInvocationLogger(dir);
    await log.stdout("line one\n");
    await log.stdout("line two\n");
    await log.stderr("err one\n");
    assert.equal(readFileSync(join(dir, "stdout.log"), "utf8"), "line one\nline two\n");
    assert.equal(readFileSync(join(dir, "stderr.log"), "utf8"), "err one\n");
  });

  it("creates the logs directory lazily on first write", async () => {
    const parent = mkdtempSync(join(tmpdir(), "fil-lazy-"));
    const dir = join(parent, "deep", "logs");
    assert.ok(!existsSync(dir));
    const log = new FileInvocationLogger(dir);
    await log.event({ kind: "k" });
    assert.ok(existsSync(dir));
    assert.ok(existsSync(join(dir, "events.jsonl")));
  });

  it("never throws upward — failures land on lastError", async () => {
    // Point at a path that cannot be created (NUL char in Linux path).
    const log = new FileInvocationLogger("/proc/1/root/forbidden\0\0");
    await log.event({ kind: "k" });
    // No throw; lastError populated.
    assert.ok(log.lastError instanceof Error);
  });

  // ────────────────────────────────────────────────────────────────────
  // Track B3 — redactor integration
  // ────────────────────────────────────────────────────────────────────

  it("applies a secret redactor to JSONL event records", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fil-redact-jsonl-"));
    const redact = buildSecretRedactor({ API_KEY: "super-secret-12345" });
    const log = new FileInvocationLogger(dir, redact);
    await log.event({ kind: "tool.call", args: { auth: "super-secret-12345" } });
    const line = readFileSync(join(dir, "events.jsonl"), "utf8").trim();
    assert.ok(!line.includes("super-secret-12345"), "secret must not appear in log");
    assert.ok(line.includes("[REDACTED:API_KEY]"), "redaction token expected");
    const parsed = JSON.parse(line);
    assert.equal(parsed.kind, "tool.call");
    assert.equal(parsed.args.auth, "[REDACTED:API_KEY]");
  });

  it("applies a secret redactor to stdout/stderr string chunks", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fil-redact-raw-"));
    const redact = buildSecretRedactor({ DB_PASSWORD: "pw-abcdef-1234" });
    const log = new FileInvocationLogger(dir, redact);
    await log.stdout("connecting with pw-abcdef-1234 ...\n");
    await log.stderr("error: token pw-abcdef-1234 rejected\n");
    const out = readFileSync(join(dir, "stdout.log"), "utf8");
    const err = readFileSync(join(dir, "stderr.log"), "utf8");
    assert.ok(!out.includes("pw-abcdef-1234"));
    assert.ok(out.includes("[REDACTED:DB_PASSWORD]"));
    assert.ok(!err.includes("pw-abcdef-1234"));
    assert.ok(err.includes("[REDACTED:DB_PASSWORD]"));
  });

  it("redacts Buffer chunks when a redactor is configured", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fil-redact-buf-"));
    const redact = buildSecretRedactor({ AUTH_TOKEN: "tok-deadbeef-99" });
    const log = new FileInvocationLogger(dir, redact);
    await log.stdout(Buffer.from("prefix tok-deadbeef-99 suffix\n", "utf8"));
    const out = readFileSync(join(dir, "stdout.log"), "utf8");
    assert.equal(out, "prefix [REDACTED:AUTH_TOKEN] suffix\n");
  });

  it("preserves log content verbatim when no redactor is configured", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fil-no-redact-"));
    const log = new FileInvocationLogger(dir);
    await log.stdout("password=plaintext\n");
    const out = readFileSync(join(dir, "stdout.log"), "utf8");
    assert.equal(out, "password=plaintext\n");
  });
});
