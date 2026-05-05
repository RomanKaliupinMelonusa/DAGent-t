# `src/worker/` — Worker Process

The composition root for the long-running Temporal worker process. Wires
adapters → activity dependencies, registers the workflow + activity
bundles, and polls the configured task queue.

## Role in the architecture

The worker is one of two binaries the engine ships (`dagent-worker`).
The other — `dagent-admin` — is the client; it sends signals/queries to
the worker indirectly via the Temporal cluster.

Run with `npm run worker --workspace=orchestrator`. The build-and-run
chain is:

```
tsc -p tsconfig.json   →   dist/                   →   node dist/worker/main.js
```

Workers run from compiled JS, **not `tsx`**. Webpack inside
`@temporalio/worker` (used to bundle workflow code) is incompatible
with `tsx`'s global `Module._resolveFilename` hook.

## Files

| File | Role |
|---|---|
| [main.ts](main.ts) | Composition root — builds `ActivityDeps`, creates `NativeConnection`, builds + runs the `Worker`, handles graceful shutdown. |

This layer has exactly one file by design — it's the place where every
other layer is wired together, and it's small enough to fit in a single
read.

## Public interface

`main()` is the entry point. There is no exported API; the worker is
invoked as a process, not imported.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `TEMPORAL_ADDRESS` | `localhost:7233` | Temporal frontend gRPC address. |
| `TEMPORAL_TASK_QUEUE` | `dagent-pipeline` | Task queue this worker polls. |
| `TEMPORAL_NAMESPACE` | `default` | Temporal namespace. |
| `APP_ROOT` | _(unset)_ | Absolute path to the app root the worker services. **Required for production DI** (triage LLM + baseline loader + Copilot SDK). Without it, triage runs in contract-only mode and the copilot-agent activity returns the deterministic BUG message. |
| `WORKER_DISABLE_LLM` | _(unset)_ | When `"1"`/`"true"`, skips `CopilotClient` startup entirely. Useful for CI activity-smoke tests against `local-exec` / `github-ci-poll` only. |

## Invariants & contracts

1. **Composition happens here.** No other file in the engine constructs
   adapters at module load. Tests use the same wiring shape against
   in-memory fakes.
2. **One `ActivityDeps` per worker.** Built once at boot; passed to
   `createActivities(deps)`; the bound namespace is what `Worker.create`
   receives. The same registry threads through every activity for the
   life of the process.
3. **`CopilotClient` lifecycle is owned here.** Started before the
   first activity dispatch; stopped on `SIGTERM`/`SIGINT`. The SDK's
   stdio channel is shared across all in-flight sessions.
4. **`bundlerOptions: { ignoreModules: ["crypto", "buffer"] }`** is
   load-bearing. `js-sha256` (used by
   [`src/domain/error-signature.ts`](../domain/error-signature.ts))
   contains static `require('crypto')` / `require('buffer')` calls
   inside its `nodeWrap` helper. The helper never executes inside the
   workflow sandbox (gated on `typeof process === 'object'`), but
   webpack walks the requires statically and the SDK's determinism
   check rejects them. This option is the canonical escape hatch.
5. **Workflows path resolves at runtime against the compiled layout.**
   `resolve(__dirname, "../workflow/index.js")`. tsx-based execution is
   not supported.
6. **Cooperative shutdown.** `Worker.shutdown()` drains in-flight
   activities; `CopilotClient.stop()` runs after the drain. Process
   exits naturally when both finish.

## How to extend

**Wire a new adapter:**

1. Construct the adapter in `main.ts`'s `buildActivityDeps()` factory.
2. Extend the `ActivityDeps` shape in
   [`src/activities/deps.ts`](../activities/deps.ts).
3. Add the dependency to the registry returned by `buildActivityDeps()`.
4. Inject in the activity body that needs it.

**Add a new task queue (multi-worker):**

Spawn a second worker process (`dagent-worker-build`,
`dagent-worker-deploy`, …) with `TEMPORAL_TASK_QUEUE` set. Workflow
code dispatches to a specific queue via the per-activity proxy
options. There is no in-process multi-queue support — keep one queue
per worker process for cleaner scaling and crash isolation.

**Run without LLMs (CI activity-smoke):**

Set `WORKER_DISABLE_LLM=1`. The Copilot SDK and Copilot-backed triage
adapters are deferred imports — the worker boots without resolving
them, and activities that depend on LLM ports return their deterministic
fallback.

## Gotchas

- **Webpack walks all imports statically.** Adding any new dependency
  with a static `require` of a Node built-in that doesn't pass the
  determinism check will need to be added to `bundlerOptions.ignoreModules`.
- **The worker keeps the `CopilotClient` alive for the whole process
  lifetime.** SDK sessions are short-lived; the underlying stdio channel
  is not. Don't try to close the client between sessions.
- **`APP_ROOT` must be absolute.** A relative path throws at boot — the
  triage / baseline loaders expect a stable absolute root.
- **One worker per app root.** Multiple apps would need either separate
  worker processes (different `APP_ROOT`) or a richer DI design. The
  current factory is single-app.

## Related layers

- Composes → [`src/adapters/`](../adapters/README.md) (every concrete
  adapter is constructed here)
- Wires → [`src/activities/`](../activities/README.md) via
  `createActivities(deps)`
- Registers → [`src/workflow/`](../workflow/README.md) bundle
- Operated by → [`src/client/admin.ts`](../client/README.md) (the
  Temporal client talks to the worker indirectly through the cluster)
