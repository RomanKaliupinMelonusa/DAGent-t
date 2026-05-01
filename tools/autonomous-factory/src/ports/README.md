# `src/ports/` — Hexagonal Interface Contracts

Interfaces only. No code. Every I/O boundary the engine crosses is declared here.

See [Architecture overview](../../docs/architecture.md) for the worker /
client / Temporal topology that consumes these ports.

## Role in the architecture

`ports/` defines the contracts between business logic and the outside world. Activities, `activity-lib/`, and the `entry/` bootstrap depend on these interfaces — never on concrete implementations. Implementations live in [adapters/](../adapters/README.md) and are wired in [`src/worker/main.ts`](../worker/README.md).

Ports are the **seam** that makes the engine substitutable: swap
`GithubCiAdapter` for `GitlabCiAdapter`, `CopilotTriageLlm` for any other
LLM provider, `RoamCodeIndexer` for a different code-intelligence backend
— without touching business logic.

## Files

Each file declares exactly one port interface (plus supporting types). Nothing else. Pipeline state itself lives in Temporal event history (see [ADR 0001](../../docs/adr/0001-temporal.md)) — no `StateStore` port.

| File | Port | Implemented by |
|---|---|---|
| [version-control.ts](version-control.ts) | `VersionControl` — git operations (commit, push, diff) | `adapters/git-shell-adapter.ts` |
| [ci-gateway.ts](ci-gateway.ts) | `CiGateway` — CI run polling and status | `adapters/github-ci-adapter.ts` |
| [hook-executor.ts](hook-executor.ts) | `HookExecutor` — runs `.apm/hooks/*.sh` lifecycle scripts | `adapters/shell-hook-executor.ts` |
| [shell.ts](shell.ts) | `Shell` — generic subprocess execution with stderr/stdout/timeout | `adapters/node-shell-adapter.ts` |
| [feature-filesystem.ts](feature-filesystem.ts) | `FeatureFilesystem` — feature workspace file ops (`.dagent/`, `archive/`) | `adapters/local-filesystem.ts` |
| [context-compiler.ts](context-compiler.ts) | `ContextCompiler` — APM compile entry point | `adapters/apm-file-compiler.ts` |
| [telemetry.ts](telemetry.ts) | `Telemetry` — structured event emission | `telemetry/jsonl-logger.ts` (the `PipelineLogger` lives in [`src/telemetry/`](../telemetry/README.md), not in `adapters/`) |
| [triage-llm.ts](triage-llm.ts) | `TriageLlm` — LLM-based failure classification fallback | `adapters/copilot-triage-llm.ts` |
| [triage-artifact-loader.ts](triage-artifact-loader.ts) | `TriageArtifactLoader` — reads feature artifacts for triage context | `adapters/file-triage-artifact-loader.ts` |
| [baseline-loader.ts](baseline-loader.ts) | `BaselineLoader` — loads previous-pass evidence for baseline advisories | `adapters/file-baseline-loader.ts` |
| [copilot-session-runner.ts](copilot-session-runner.ts) | `CopilotSessionRunner` — one agent session lifecycle | `adapters/copilot-session-runner.ts` |
| [cognitive-breaker.ts](cognitive-breaker.ts) | `CognitiveBreaker` — per-session tool-call limits | `adapters/session-circuit-breaker.ts` |
| [code-indexer.ts](code-indexer.ts) | `CodeIndexer` — structural-intelligence index build | `adapters/roam-code-indexer.ts` |
| [artifact-bus.ts](artifact-bus.ts) | `ArtifactBus` — declared `consumes_*` / `produces_artifacts` resolution + per-invocation materialization | `adapters/file-artifact-bus.ts` |
| [invocation-filesystem.ts](invocation-filesystem.ts) | `InvocationFilesystem` — per-invocation `inputs/` / `outputs/` / `logs/` tree operations | `adapters/file-invocation-filesystem.ts` |
| [invocation-logger.ts](invocation-logger.ts) | `InvocationLogger` — multiplex per-invocation log sinks (`events.jsonl`, `tool-calls.jsonl`, `messages.jsonl`, `stdout.log`, `stderr.log`) | `adapters/file-invocation-logger.ts` |
| [index.ts](index.ts) | Barrel re-exports. | — |

## Public interface

Every port is an `interface` with async methods. Example:

```ts
export interface VersionControl {
  currentBranch(): Promise<string>;
  headSha(): Promise<string>;
  diffStat(base: string, head?: string): Promise<DiffStat>;
  commit(message: string, options?: CommitOptions): Promise<CommitResult>;
  push(branch: string, options?: PushOptions): Promise<void>;
  // …
}
```

Port methods are **async** even when the reference implementation is synchronous — to keep the interface stable if an implementation ever moves off-box.

## Invariants & contracts

1. **Zero executable code.** Only `export type` and `export interface` declarations. No default values, no helper functions, no `const` arrays.
2. **No imports from `adapters/`, `activities/`, `workflow/`.** Ports may import shared types from `src/types.ts` and `src/app-types.ts` only.
3. **Errors are exceptions, not result types.** Callers `try/catch`; do not wrap every call in `Result<T, E>`.
4. **One port per file.** Keeps grepping for "who uses `StateStore`?" trivial.

## How to extend

**Add a new port** (e.g. `ScmProvider` to replace GitHub coupling):

1. Create `ports/scm-provider.ts` with only the interface.
2. Add it to the barrel in [index.ts](index.ts).
3. Implement it in `adapters/github-scm-adapter.ts` (and optionally `gitlab-scm-adapter.ts`).
4. Wire the chosen implementation in [`src/worker/main.ts`](../worker/README.md) and inject via the relevant activity's dependency setter.
5. Update callers (activities, `activity-lib`) to depend on the port, not the adapter.

**Add a method to an existing port:**

1. Add the method signature to the port interface.
2. Implement it in every adapter that provides this port (TypeScript will force this — intentionally strict).
3. Add a test stub if ports are mocked in tests.

## Gotchas

- **Ports should model I/O, not business logic.** If your new method is doing domain calculations, it belongs in `domain/` and the port should just expose the data the calculation needs.
- **Keep the method surface small.** Every port method is an integration-test burden. Prefer adding one general method over many specific ones (e.g. `getStatus(slug)` over `getStatusIfNotDormant(slug)`).
- **Don't leak implementation types.** If a port type references `Octokit` or `CopilotClient`, the abstraction leaks. Define a dedicated type in the port file.

## Related layers

- Implemented by → [`src/adapters/`](../adapters/README.md)
- Consumed by → [`src/activities/`](../activities/README.md), [`src/activity-lib/`](../activity-lib/README.md), [`src/entry/bootstrap.ts`](../entry/README.md)
- Wired in → [`src/worker/main.ts`](../worker/README.md)
