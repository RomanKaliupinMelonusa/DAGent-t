# ADR 0004 — Telemetry: JSONL Plus Console Mirror

## Status

Accepted — 2026-04-30. Replaces the predecessor multiplex
JSONL/noop/multiplex/OTel-redactor stack.

## Context

The predecessor `src/telemetry/` shipped:

- A `PipelineLogger` interface with three implementations (JSONL,
  noop, multiplex).
- An OTel sink with bootstrap.
- A secret-redactor adapter.
- A multi-sink composer for "send to JSONL AND OTel AND console
  simultaneously".

The complexity bought relatively little: in practice, every operator
read JSONL or the console; OTel export was unconfigured. The redactor
had a narrow blast radius — agents already follow rules that prohibit
emitting secrets in tool calls.

## Decision

Replace the stack with the lean implementation under
[`src/telemetry/`](../../src/telemetry/):

- **`JsonlLogger`** ([`jsonl-logger.ts`](../../src/telemetry/jsonl-logger.ts))
  — writes JSONL events to `<app>/.dagent/<slug>/_LOG.jsonl`. The
  authoritative trace.
- **`NoopLogger`** ([`noop-logger.ts`](../../src/telemetry/noop-logger.ts))
  — the test-friendly null implementation.
- **Console mirror** ([`console-render.ts`](../../src/telemetry/console-render.ts))
  — same events rendered for human eyeballs as the worker runs.
  Driven by the same logger; not a separate sink.
- **`logger-factory`** ([`logger-factory.ts`](../../src/telemetry/logger-factory.ts))
  — selects the implementation based on environment (composition root
  in the worker layer).

OTel exposure is deferred to the Temporal SDK's built-in tracer
([ADR 0001](0001-temporal.md)) — workflows + activities produce OTLP
spans automatically when an exporter is configured.

The secret redactor is removed. Per-feature `.dagent/` directories
should never be checked in to source control; agents are forbidden
from emitting secrets via system prompt rules.

## Consequences

| Positive | Negative |
|---|---|
| Single source of telemetry per feature; easy to grep, easy to ship. | Loss of pluggable sinks; if an operator wants OTel they configure the Temporal exporter, not a custom logger. |
| Console output is always the same shape as the JSONL file. | Loss of in-engine secret redaction (mitigated by prompt rules + per-feature directory hygiene). |
| Layer file count drops from ~10 to ~6. | None significant. |

## Where to look

- Logger interface → [`src/ports/telemetry.ts`](../../src/ports/telemetry.ts)
- JSONL implementation → [`src/telemetry/jsonl-logger.ts`](../../src/telemetry/jsonl-logger.ts)
- Console rendering → [`src/telemetry/console-render.ts`](../../src/telemetry/console-render.ts)
- Layer README → [`src/telemetry/README.md`](../../src/telemetry/README.md)
