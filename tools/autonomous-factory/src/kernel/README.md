# `src/kernel/` — Command-Sourced State Machine

> The sole owner of pipeline state. Everything else is an observer.

## Role in the architecture

The kernel is the single point of truth for `PipelineState` (durable) and `RunState` (in-memory run telemetry). It processes typed `Command`s and returns `CommandResult` + `Effect[]`. It is **synchronous and pure** — zero I/O, zero `async`. The caller (loop/dispatch/effect-executor) performs the I/O described by the emitted effects.

This design eliminates TOCTOU races between parallel handlers and makes every state transition auditable in one place.

## Files

| File | Purpose | Key exports |
|---|---|---|
| [pipeline-kernel.ts](pipeline-kernel.ts) | The `PipelineKernel` class. Holds state, runs rules, returns `ProcessResult`. | `PipelineKernel`, `ProcessResult` |
| [commands.ts](commands.ts) | Command discriminated union (`complete-item`, `fail-item`, `record-attempt`, `record-summary`, `record-execution`, `record-handler-output`, wrapped `DagCommand`). | `Command`, `CompleteItemCommand`, `FailItemCommand`, … |
| [effects.ts](effects.ts) | Effect discriminated union (`persist-state`, `persist-execution-record`, `persist-triage-record`, `telemetry-event`, `reindex`, `persist-pending-context`, `write-halt-artifact`). | `Effect`, `PersistStateEffect`, … |
| [effect-executor.ts](effect-executor.ts) | Runs a list of effects against injected ports. The only impure file in the layer. | `executeEffects`, `EffectPorts` |
| [rules.ts](rules.ts) | `KernelRules` port — schedule / transitions / routing. `DefaultKernelRules` delegates to `domain/`. | `KernelRules`, `DefaultKernelRules` |
| [types.ts](types.ts) | `RunState`, `CommandResult`, `createRunState`. | `RunState`, `CommandResult`, `createRunState` |
| [admin.ts](admin.ts) | Admin-only mutations used by the CLI (reset-scripts, resume-elevated, etc.). Still flows through commands. | `adminReset*` helpers |
| [invocation-id.ts](invocation-id.ts) | Generates per-dispatch invocation IDs (the primary key for the artifact ledger and per-invocation directories). | `createInvocationId`, `InvocationId` |
| [index.ts](index.ts) | Barrel. | (all of the above) |

## Public interface

```ts
const kernel = new PipelineKernel(slug, initialDagState, initialRunState, rules);

// Reads (always frozen snapshots)
const dag = kernel.dagSnapshot();
const run = kernel.runSnapshot();
const batch = kernel.getNextBatch();

// Writes (commands only)
const { result, effects } = kernel.process({ type: "complete-item", itemKey: "backend-dev" });
await executeEffects(effects, { stateStore, telemetry, fileSystem });
```

## Invariants & contracts

1. **No `async` anywhere in this folder** (except `effect-executor.ts`).
2. **No I/O imports** — no `node:fs`, `node:child_process`, `@github/copilot-sdk`, `gh`, `git`. Lint-enforced where possible.
3. **State is replaced, not mutated in place.** Every transition produces a new state object via `structuredClone`.
4. **`process(cmd)` is idempotent for queries but serialised for writes.** Callers must not call `process` concurrently for the same slug. A runtime re-entrance guard throws `KernelReentryError` if `process()` is invoked nested (e.g. an effect consumer recurses back into the kernel inline instead of returning effects to the caller).
5. **Handlers do not import this folder.** They emit `DagCommand[]` in their `NodeResult`; dispatch wraps those into kernel commands.

## How to extend

**Add a new command** (e.g. `record-ci-sha`):

1. Define the shape in [commands.ts](commands.ts) and add it to the `Command` union.
2. Handle it in `PipelineKernel.process()` inside [pipeline-kernel.ts](pipeline-kernel.ts) — call the right rule, return `CommandResult` + `Effect[]`.
3. If it needs a new side effect, add it to [effects.ts](effects.ts) and handle in [effect-executor.ts](effect-executor.ts).
4. Add a unit test in `__tests__/` covering the state transition and the emitted effects.

**Add a new rule** (e.g. stricter failure semantics):

1. Add the method to `KernelRules` in [rules.ts](rules.ts).
2. Implement in `DefaultKernelRules` by delegating to a new pure function in `domain/`.
3. Inject a different `KernelRules` implementation in tests via the constructor.

## Gotchas

- **`structuredClone` is not cheap.** `dagSnapshot()` and `runSnapshot()` clone on every call. Do not call them inside tight loops; cache the reference.
- **`admin.ts` can look like it violates the "only commands" rule** — it doesn't; each admin helper assembles a command and routes through `process()`.
- **The kernel doesn't know what a "DEV item" is.** Domain semantics (which keys count as deploy, post-deploy, dev) live in `domain/` and are looked up via rules.

## Related layers

- Rules delegate to → [src/domain/](../domain/README.md)
- Effects are consumed by → [src/adapters/](../adapters/README.md) via ports
- Commands are produced by → [src/handlers/](../handlers/README.md) (as `DagCommand[]`) and [src/loop/dispatch/](../loop/)
- Wired in → [src/entry/main.ts](../entry/README.md)
