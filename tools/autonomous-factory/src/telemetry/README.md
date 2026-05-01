# `src/telemetry/` — Structured logging & OTel bootstrap

Defines the `PipelineLogger` interface, its JSONL/no-op/multiplex/OTel implementations, and the OpenTelemetry bootstrap used by both the worker and client.

See [Architecture overview](../../docs/architecture.md) for how spans flow from worker → OTLP collector.

## Files

| File | Purpose |
|---|---|
| [index.ts](index.ts) | Public surface — re-exports the event schema, `PipelineLogger` interface, JSONL/noop implementations, and the factory. |
| [events.ts](events.ts) | Event schema (`PipelineEvent`, `EventKind`, `EventFilter`) and the `PipelineLogger` interface. Pure type definitions shared across the subsystem. |
| [jsonl-logger.ts](jsonl-logger.ts) | JSONL-backed `PipelineLogger`. Every `event()` call appends one JSON line via synchronous `fs.writeSync`. Survives `process.exit` but not host crash; sufficient for the small set of events emitted per run. |
| [noop-logger.ts](noop-logger.ts) | No-op logger for tests and disabled contexts. |
| [multiplex-logger.ts](multiplex-logger.ts) | `PipelineLogger` that fans `event()` writes out to a per-invocation `InvocationLogger` in addition to the global pipeline logger. Lets the multiplex sinks (`events.jsonl`, `tool-calls.jsonl`, …) populate without each call site knowing about both sinks. |
| [otel-pipeline-logger.ts](otel-pipeline-logger.ts) | OTel-emitting `PipelineLogger` adapter. Each `event(...)` lands as a span event on the currently-active span — which inside a Temporal activity is the span the `OpenTelemetryPlugin` creates per attempt. |
| [otel.ts](otel.ts) | OpenTelemetry / Tempo bootstrap. `bootstrapOtel()` initializes the OTel SDK if `OTLP_ENDPOINT` is set; otherwise no-ops. Wires distributed tracing into the Temporal worker and client per ADR D-S4-1. |
| [factory.ts](factory.ts) | JSONL logger factory — creates a logger rooted at `featurePath(slug)`. |
| [logger-factory.ts](logger-factory.ts) | Activity logger DI slot. Module-scoped factory that activity bootstrap consults when no `PipelineLogger` is supplied. The worker installs a factory once at boot; every subsequent activity invocation gets a fresh logger. |
| [console-render.ts](console-render.ts) | Maps `PipelineEvent` → human-readable console line. Pure rendering; the caller decides how to print. |
| [secret-redactor.ts](secret-redactor.ts) | Builds a `(text) => text` redactor seeded from the compiled APM `config.environment` dictionary. Keys matching `/key|secret|token|password|connection|credential/i` have their values literal-replaced with `[REDACTED:KEY_NAME]` before logs hit disk. |

## Public interface

```ts
import {
  bootstrapOtel,
  createPipelineLogger,
  type PipelineLogger,
  type PipelineEvent,
} from "../telemetry/index.js";

await bootstrapOtel();                               // worker + client
const logger = createPipelineLogger({ slug, ... });  // JSONL sink
logger.event("node.start", itemKey, { invocationId });
```

## Environment variables

| Variable | Effect |
|---|---|
| `OTLP_ENDPOINT` | gRPC endpoint for the OTel collector (e.g. `http://localhost:4317`). When unset, `bootstrapOtel()` is a no-op. |
| `OTEL_SERVICE_NAME` | Service name attached to spans (defaults to `dagent-worker` / `dagent-admin`). |
| `OTEL_RESOURCE_ATTRIBUTES` | Standard OTel resource attribute pass-through. |

## Invariants & contracts

1. **`PipelineLogger.event` is fire-and-forget.** It must never throw on a malformed event; the caller's hot path cannot afford to handle telemetry failures.
2. **JSONL writes are synchronous.** Asynchronicity here would interleave events between concurrent activities. The cost is acceptable because the volume is small (few hundred events per run).
3. **OTel bootstrap is idempotent.** Calling `bootstrapOtel()` twice in a single process is safe — the worker calls it; the client may also when run in-process for tests.
4. **No imports from `workflow/`.** Workflow code is sandboxed and cannot use `node:fs`; workflow-side logging happens through the activity proxy (the activity does the writing).

## Related layers

- Implements → `Telemetry` port in [`src/ports/`](../ports/README.md)
- Bootstrapped from → [`src/worker/main.ts`](../worker/README.md) and [`src/client/run-feature.ts`](../client/README.md)
- Consumed by → [`src/activities/`](../activities/README.md), [`src/activity-lib/`](../activity-lib/README.md), [`src/lifecycle/`](../lifecycle/README.md), [`src/reporting/`](../reporting/README.md)
