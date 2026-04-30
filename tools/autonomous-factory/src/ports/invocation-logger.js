/**
 * ports/invocation-logger.ts — Phase 4 of the Unified Node I/O Contract.
 *
 * Per-invocation, append-only sink for handler-emitted records. One
 * instance corresponds to a single `<inv>/logs/` directory and writes
 * five sibling JSONL/log files:
 *
 *   logs/events.jsonl     — structured events (one per `event()` call)
 *   logs/tool-calls.jsonl — agent tool invocations
 *   logs/messages.jsonl   — agent / role-keyed messages
 *   logs/stdout.log       — child-process stdout chunks (raw bytes)
 *   logs/stderr.log       — child-process stderr chunks (raw bytes)
 *
 * The interface is deliberately narrow: this is the agent / handler
 * contact surface. The global `PipelineLogger` continues to own the
 * pipeline-level event stream — the per-invocation logger does **not**
 * replace it, only complements it with co-located logs.
 *
 * Implementations MUST be append-only and crash-safe (one record may be
 * lost on hard kill, but earlier records must survive). Implementations
 * SHOULD lazy-open file handles on first write and close them on
 * `close()` (Phase 4 keeps the lifecycle simple — the dispatcher closes
 * the logger after the handler returns).
 */
export {};
//# sourceMappingURL=invocation-logger.js.map