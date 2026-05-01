/**
 * adapters/file-invocation-logger.ts — Filesystem-backed `InvocationLogger`.
 *
 * Writes append-only into `<invocationDir>/logs/`:
 *   - events.jsonl, tool-calls.jsonl, messages.jsonl  (one JSON per line)
 *   - stdout.log, stderr.log                         (raw chunks, no framing)
 *
 * `appendFile` opens its own file handle each call. That's fine for the
 * volumes Phase 4 needs (a few hundred records per invocation) and keeps
 * the adapter stateless apart from the logs directory it owns.
 *
 * The adapter never throws upward — write failures are swallowed and a
 * one-shot error message is captured on `lastError` for tests / triage.
 * This matches the "best-effort, do-not-block-dispatch" policy used by
 * the rest of the per-invocation filesystem layer.
 */

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { InvocationLogger } from "../ports/invocation-logger.js";
import type { SecretRedactor } from "../telemetry/secret-redactor.js";

const EVENTS_FILE = "events.jsonl";
const TOOL_CALLS_FILE = "tool-calls.jsonl";
const MESSAGES_FILE = "messages.jsonl";
const STDOUT_FILE = "stdout.log";
const STDERR_FILE = "stderr.log";

export class FileInvocationLogger implements InvocationLogger {
  /** Last write error, useful for tests / observability. */
  public lastError: Error | null = null;

  constructor(
    private readonly logsDir: string,
    private readonly redactor?: SecretRedactor,
  ) {}

  async event(record: Record<string, unknown>): Promise<void> {
    await this.appendJsonl(EVENTS_FILE, withTimestamp(record));
  }

  async toolCall(record: Record<string, unknown>): Promise<void> {
    await this.appendJsonl(TOOL_CALLS_FILE, withTimestamp(record));
  }

  async message(
    role: string,
    text: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.appendJsonl(MESSAGES_FILE, withTimestamp({ role, text, ...extra }));
  }

  async stdout(chunk: string | Buffer): Promise<void> {
    await this.appendRaw(STDOUT_FILE, chunk);
  }

  async stderr(chunk: string | Buffer): Promise<void> {
    await this.appendRaw(STDERR_FILE, chunk);
  }

  /** No-op: we open + close per write via `appendFile`. */
  async close(): Promise<void> {
    /* no-op */
  }

  // ────────────────────────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────────────────────────

  private async appendJsonl(filename: string, record: Record<string, unknown>): Promise<void> {
    try {
      await this.ensureDir();
      const raw = JSON.stringify(record) + "\n";
      const line = this.redactor ? this.redactor(raw) : raw;
      await appendFile(path.join(this.logsDir, filename), line, "utf8");
    } catch (err) {
      this.lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  private async appendRaw(filename: string, chunk: string | Buffer): Promise<void> {
    try {
      await this.ensureDir();
      // Redaction is a string operation. When a redactor is configured
      // we decode Buffer chunks as utf8 (our stdout/stderr streams are
      // always text). When no redactor is configured we keep the raw
      // byte path to preserve Buffer fidelity.
      if (this.redactor) {
        const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        await appendFile(path.join(this.logsDir, filename), this.redactor(text), "utf8");
      } else {
        await appendFile(path.join(this.logsDir, filename), chunk);
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  /** `recursive: true` makes mkdir idempotent. The InvocationFilesystem
   *  adapter normally creates `logs/` ahead of time via `.gitkeep`, but
   *  we re-ensure here so the logger stays usable in standalone tests. */
  private async ensureDir(): Promise<void> {
    await mkdir(this.logsDir, { recursive: true });
  }
}

function withTimestamp(record: Record<string, unknown>): Record<string, unknown> {
  if (typeof record.ts === "string") return record;
  return { ts: new Date().toISOString(), ...record };
}
