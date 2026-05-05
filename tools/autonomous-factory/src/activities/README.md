# `src/activities/` — Side-Effecting Work

Plain TypeScript with full access to ports, adapters, network,
filesystem, and LLM SDKs. Each activity is a single async function that
the workflow invokes via `proxyActivities`.

## Role in the architecture

Activities are where the engine **actually does things**. The workflow
is deterministic and side-effect-free; everything that talks to the
outside world (LLM sessions, shell, git, GitHub Actions, file I/O)
happens here. Activities receive an `ActivityInput` envelope from the
workflow, return a `NodeResult` payload, and emit JSONL telemetry +
artefacts under `<app>/.dagent/<slug>/<node>/<inv-id>/`.

For the topology see
[`docs/architecture.md`](../../docs/architecture.md).

## Files

| File | Role |
|---|---|
| [copilot-agent.activity.ts](copilot-agent.activity.ts) | Drives an LLM session via `@github/copilot-sdk` for a single agent node. |
| [copilot-agent-body.ts](copilot-agent-body.ts) | The activity body extracted for direct unit testing without `MockActivityEnvironment`. |
| [local-exec.activity.ts](local-exec.activity.ts) | Runs shell commands (push, publish, tests, builds) with optional `pre`/`post` hooks. |
| [triage.activity.ts](triage.activity.ts) | Failure classifier — declarative L0 → RAG retriever → LLM router. Returns redev routing. |
| [triage-body.ts](triage-body.ts) / [triage-body-reroute.ts](triage-body-reroute.ts) | Triage internals split for unit-testability. |
| [halt-and-flush.activity.ts](halt-and-flush.activity.ts) | Finalises the feature workspace at terminal states (archive, summary, branch flush). |
| [hello.activity.ts](hello.activity.ts) | Smoke-test activity — kept for replay tests. |
| [factory.ts](factory.ts) | `createActivities(deps: ActivityDeps)` — binds every activity as a closure over the per-worker dependency registry. |
| [deps.ts](deps.ts) | `ActivityDeps` type — the dependency registry the worker constructs at boot. |
| [types.ts](types.ts) | Shared activity-side types. |
| [support/](support/) | Pure helpers shared by multiple activities — no Temporal SDK imports, unit-testable. |
| [index.ts](index.ts) | Barrel — bound activity namespace consumed by the worker. |

The companion [`__tests__/`](__tests__/) directory uses
`MockActivityEnvironment` from `@temporalio/testing` for activity-level
integration tests.

## Public interface

Activities are bound at worker boot — there is no module-level export to
import directly from outside this layer. The workflow gets typed proxies
via `src/workflow/activity-proxies.ts`:

```ts
const activities = proxyActivities<typeof bound>({ /* timeouts */ });
```

The `bound` namespace is what `createActivities(deps)` returns.

## Invariants & contracts

1. **One activity per file.** Naming convention: `<name>.activity.ts`,
   exporting an async function whose name matches.
2. **Dependency injection at the worker, not at module level.** Adapters
   are constructed once in [`src/worker/main.ts`](../worker/README.md)
   and passed to `createActivities(deps)` as `ActivityDeps`. This is the
   only way an activity gets at I/O surfaces.
3. **Heartbeat or die.** Long-running activities call
   `Context.current().heartbeat()` at least every 30s — the
   `startToCloseTimeout` set by the workflow is enforced by Temporal's
   matching service and the activity is failed if heartbeats stall.
4. **Return `NodeResult`, not exceptions for expected failure.** Genuine
   bugs should still throw, but a node that "did its job and reported a
   business-level failure" returns `{ status: "failed", error }` so the
   workflow can drive triage. Throwing reaches the workflow as an
   `ApplicationFailure` and triggers the activity-retry policy first.
5. **No state between calls.** Module-level mutable state breaks worker
   restarts. Use the dependency registry or pass through `NodeContext`.
6. **Adapter ownership stops at the worker.** Activities receive ports
   (interfaces) only. Adapters live in [`src/adapters/`](../adapters/README.md).

## How to extend

**Add a new activity:**

1. Create `src/activities/my-thing.activity.ts` exporting an async
   function `myThingActivity(input: MyInput): Promise<NodeResult>`.
2. Add it to [`factory.ts`](factory.ts) so `createActivities(deps)`
   binds it.
3. Add a typed proxy + timeout to
   [`src/workflow/activity-proxies.ts`](../workflow/activity-proxies.ts).
4. Register it in [`src/worker/main.ts`](../worker/README.md) — usually
   nothing extra to do; the factory already wires it via the registry.
5. Bump `WORKFLOW_VERSION` (the activity proxy set changed shape).
6. Add a sibling test under [`__tests__/`](__tests__/) using
   `MockActivityEnvironment`.

**Add a new dependency:**

1. Extend `ActivityDeps` in [`deps.ts`](deps.ts).
2. Construct the adapter in [`src/worker/main.ts`](../worker/README.md)
   and add it to the deps object.
3. Threading order matters — heavyweight (LLM) deps go behind the
   `WORKER_DISABLE_LLM` / `APP_ROOT` env-gates so the worker can boot in
   activity-smoke mode.

## Gotchas

- **Don't import workflow files.** Activities never `import` from
  `src/workflow/`; the dependency goes the other way.
- **`copilot-agent.activity.ts` short-circuits without DI.** If
  `WORKER_DISABLE_LLM=1` or `APP_ROOT` is unset, the activity returns
  the deterministic BUG message instead of starting a session — an
  intentional safety net for activity-smoke runs.
- **Triage runs in contract-only mode without `triageLlm`.** The
  classifier degrades gracefully to declarative L0 + RAG; the LLM
  router is the third tier and is silently skipped.
- **`local-exec` `pre`/`post` semantics differ.** A `pre` failure fails
  the node immediately (timeout 2 min). For `local-exec`, a `post`
  failure is non-fatal; for `poll` / `agent` types it triggers triage
  rerouting. Documented in
  [`AGENTIC-WORKFLOW.md`](../../../.github/AGENTIC-WORKFLOW.md).

## Related layers

- Called from → [`src/workflow/`](../workflow/README.md) via activity
  proxies
- Wires → [`src/ports/`](../ports/README.md) (used as injected
  interfaces)
- Backed by → [`src/adapters/`](../adapters/README.md) (concretions
  injected by the worker)
- Cross-cutting types → [`src/contracts/`](../contracts/) (`NodeContext`,
  `NodeResult`, node I/O contract gate)
- Pure helpers → [`support/`](support/) — safe to unit-test directly
