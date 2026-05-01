# `src/telemetry/` — Structured logging

Defines the `PipelineLogger` interface and its JSONL / no-op implementations.
Phase 4.4 collapsed this layer to **JSONL + console only** — the OTel,
multiplex, and secret-redactor sinks were retired.

See [Architecture overview](../../docs/architecture.md) for how events flow
from activities to `.dagent/<slug>/_LOG.jsonl` and the operator console.

## Files

| File | Purpose |
|---|---|
| [index.ts](index.ts) | Public surface — re-exports the event schema, `PipelineLogger` interface, and the JSONL/noop implementations. |
| [events.ts](events.ts) | Event schema (`PipelineEvent`, `EventKind`, `EventFilter`) and the `PipelineLogger` interface. Pure type definitions shared across the subsystem. |
| [jsonl-logger.ts](jsonl-logger.ts) | JSONL-backed `PipelineLogger`. Every `event()` call appends one JSON line via synchronous `fs.writeSync`; durable kinds (`run.start`, `run.end`, `state.salvage`, `breaker.fire`) additionally `fsync`. |
| [noop-logger.ts](noop-logger.ts) | No-op logger for tests and disabled contexts. |
| [logger-factory.ts](logger-factory.ts) | Activity logger DI slot. Module-scoped factory that activity bootstrap consults when no `PipelineLogger` is supplied. The worker installs a factory once at boot; every subsequent activity invocation gets a fresh logger. |
| [console-render.ts](console-render.ts) | Maps `PipelineEvent` → human-readable console line. Pure rendering; the caller decides how to print. |

## Public interface

```ts
import {
  createPipelineLogger,
  type PipelineLogger,
  type PipelineEvent,
} from "../telemetry/index.js";

const logger = createPipelineLogger({ slug, ... });  // JSONL sink
logger.event("node.start", itemKey, { invocationId });
```

## Invariants & contracts

1. **`PipelineLogger.event` is fire-and-forget.** It must never throw on a malformed event; the caller's hot path cannot afford to handle telemetry failures.
2. **JSONL writes are synchronous.** Asynchronicity here would interleave events between concurrent activities. The cost is acceptable because the volume is small (few hundred events per run).
3. **No imports from `workflow/`.** Workflow code is sandboxed and cannot use `node:fs`; workflow-side logging happens through the activity proxy (the activity does the writing).

## Known gaps

- **Secret redaction is not wired into the logger pipeline.** The retired
  `secret-redactor.ts` (Phase 4.4) consumed `config.environment` and
  scrubbed env-var secrets from per-invocation `stdout.log` / `stderr.log`
  / `messages.jsonl` files. Without it, any secret that an executed
  subprocess echoes lands at-rest in `.dagent/<slug>/<node>/inv_*/logs/`.
  The threat is local-only (`.dagent/` is gitignored), but operators
  should treat `.dagent/` directories as sensitive when sharing
  reproductions. Re-introducing the redactor as an `InvocationLogger`
  decorator is on the backlog.

## Related layers

- Implements → `Telemetry` port in [`src/ports/`](../ports/README.md)
- Bootstrapped from → [`src/worker/main.ts`](../worker/README.md) and [`src/client/run-feature.ts`](../client/README.md)
- Consumed by → [`src/activities/`](../activities/README.md)
