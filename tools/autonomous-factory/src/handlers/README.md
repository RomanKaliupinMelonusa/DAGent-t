# `src/handlers/` — Handler Plugin System

> Every DAG node is executed by a handler. Adding a new node type means picking an existing handler or registering a new one.

## Role in the architecture

Handlers are pluggable executors that know how to run one *kind* of DAG node (agent session, shell script, CI poll, approval gate, triage pass). The kernel does not know what a "backend-dev" is — it asks a handler resolver for the right executor and dispatches the node.

Handlers are **observers**: they never mutate pipeline state. They return a `NodeResult` containing a list of `DagCommand`s, which the dispatch layer translates into kernel commands. The kernel is the sole state writer.

## Files

| File | Purpose |
|---|---|
| [types.ts](types.ts) | `NodeHandler` contract, `NodeContext` (everything a handler needs), `NodeResult` / `SkipResult`, `HandlerMetadata`. |
| [registry.ts](registry.ts) | `resolveHandler(node, …)` — dispatches to built-in handlers or dynamically imports a custom one. Built-in handler map: `copilot-agent`, `github-ci-poll`, `local-exec`, `approval`, `triage`. |
| [copilot-agent.ts](copilot-agent.ts) | Runs an LLM agent session via the `CopilotSessionRunner` port. Handles prompt assembly, harness wiring, outcome classification from the `report_outcome` SDK tool. |
| [local-exec.ts](local-exec.ts) | Runs a shell script declared in `workflows.yml` (e.g. `push-app`, `publish-pr`). Uses `Shell` port. |
| [github-ci-poll.ts](github-ci-poll.ts) | Polls a GitHub Actions run pinned to a specific SHA via `CiGateway`. |
| [approval.ts](approval.ts) | Human approval gate — records state, emits command to wait; kernel holds until resumed. |
| [triage-handler.ts](triage-handler.ts) | Classifies a prior failure by invoking [src/triage/](../triage/README.md), emits `reset-nodes` + `stage-invocation` (with `trigger: "triage-reroute"` and a `parentInvocationId`); the triage handoff payload is written as the declared `triage-handoff` artifact under `outputs/`. |
| [middleware.ts](middleware.ts) | Chains middlewares around handler execution (timing, logging, auth). |
| [middlewares/](middlewares/) | Built-in middleware registry + individual middleware modules. |
| [support/](support/) | Shared helpers for `copilot-agent`: [agent-context.ts](support/agent-context.ts) (build `AgentContext` from APM + NodeContext), [agent-limits.ts](support/agent-limits.ts) (tool/timeout limit cascade), [agent-post-session.ts](support/agent-post-session.ts) (HEAD capture, git-diff fallback), [auto-skip-evaluator.ts](support/auto-skip-evaluator.ts) (skip re-run if nothing changed), [result-processor.ts](support/result-processor.ts) (collapse identical failures). |
| [index.ts](index.ts) | Barrel. |

## Public interface

```ts
export interface NodeHandler {
  readonly name: string;
  execute(ctx: NodeContext): Promise<NodeResult | SkipResult>;
}

export interface NodeResult {
  kind: "done" | "failed";
  summary: ItemSummary;
  commands: DagCommand[];            // e.g. reset-nodes, stage-invocation
  // …
}
```

`NodeContext` is immutable and carries everything a handler needs: item key, slug, APM compiled context, pipeline state snapshot, previous attempt summary, ports (vcs, stateStore, shell, featureFilesystem, copilotSessionRunner, triageLlm, baselineLoader, triageArtifactLoader), and the `CopilotClient`.

## Invariants & contracts

1. **Handlers are observers.** No `stateStore.completeItem()` / `failItem()` calls from within a handler. Return `DagCommand`s instead.
2. **All I/O via ports.** No `child_process`, `fs`, or `gh`/`git`/`az` subprocess calls in handler source. Support helpers may call into ports too.
3. **Agent completion is signalled via the SDK `report_outcome` tool.** A session that ends without calling it is classified as a failure — see [copilot-agent.ts](copilot-agent.ts) `detectNoOpDev`.
4. **Auto-skip must be explicit.** If `evaluateAutoSkip()` returns a `SkipResult`, the handler returns early; otherwise it runs to completion.
5. **`executionId` is the telemetry primary key.** Every handler invocation gets a fresh UUID for log correlation; do not reuse across retries.

## How to extend

**Add a new node type** (existing handler fits):

1. Declare the node in `.apm/workflows.yml` with `handler: local-exec` (or `copilot-agent`, etc.) and any `handler_config`.
2. No engine changes required.

**Add a new handler type** (e.g. `grpc-health-poll`):

1. Create `handlers/grpc-health-poll.ts` with a default export implementing `NodeHandler`.
2. Register in [registry.ts](registry.ts) under `BUILTIN_HANDLERS` — note it is lazy-loaded via dynamic `import()`.
3. Optionally add inference in `BUILTIN_INFERENCE` so workflow nodes with `type: grpc-poll` resolve to it without declaring `handler:` explicitly.
4. Document any new `handler_config` fields in the APM workflow schema.
5. Write unit tests in `__tests__/` using mocked ports.

**Add a custom handler from a workflow file** (no engine change):

1. Create a `.ts` file under your app's `.apm/` directory with a default export of `NodeHandler`.
2. Reference it in `workflows.yml`: `handler: ./.apm/handlers/my-handler.ts`.
3. The [registry](registry.ts) validates the path via `local-path-validator.ts` (must stay under the app/repo root) and dynamically imports it.

**Add a new middleware** (e.g. distributed tracing):

1. Create a file under [middlewares/](middlewares/).
2. Register via `registerMiddlewares()` (called from [bootstrap.ts](../entry/bootstrap.ts)).
3. Middlewares compose around `handler.execute()` and receive the same `NodeContext`.

## Gotchas

- **`copilot-agent.ts` is the most complex handler.** It wires 5+ SDK event listeners via [support/](support/), computes effective attempts, builds the prompt, and post-processes git diffs. If you modify it, run the full test suite — many regressions surface only in integration.
- **`support/auto-skip-evaluator.ts` uses git merge-base heuristics** that are easy to fool on shallow clones. Auto-skip is intentionally conservative; when in doubt, it runs the node.
- **Middleware ordering is registration order.** If a new middleware expects to see another's output, declare it after.
- **`triage-handler.ts` is unusual** — it doesn't execute user code; it's a reactive handler that runs *after* a prior failure and emits reset commands. It has no agent session.
- **Custom handlers are sandboxed by path only.** The validator prevents directory traversal outside `appRoot`/`repoRoot`; it does NOT sandbox what the loaded code can do. Treat custom handlers as trusted.

## Related layers

- Uses → [src/ports/](../ports/README.md) (all I/O)
- Uses → [src/apm/](../apm/README.md) (for `copilot-agent` prompt assembly)
- Uses → [src/triage/](../triage/README.md) (`triage-handler`)
- Uses → [src/harness/](../harness/) (RBAC, shell guards, outcome tool — wired into Copilot sessions)
- Emits commands to → [src/kernel/](../kernel/README.md) via dispatch
- Dispatched by → [src/loop/dispatch/](../loop/)
