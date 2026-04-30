# `src/adapters/` — I/O Concretions

> Note: portions of this README reference predecessor code paths (kernel/loop/handlers). Current code structure is documented in [../../docs/architecture.md](../../docs/architecture.md). Full rewrite tracked separately.


> Every adapter implements a [port](../ports/README.md). Every file in this folder is allowed to do I/O; nothing outside this folder is.

## Role in the architecture

Adapters are the only place in the engine where filesystem, subprocess, git, GitHub API, or LLM SDK calls are legal. They translate port method calls into concrete operations — `StateStore.completeItem()` becomes a file write with a POSIX lock, `VersionControl.push()` becomes a `git` subprocess, `TriageLlm.classify()` becomes a Copilot SDK call.

Adapters are wired individually in [entry/main.ts](../entry/README.md); there is no factory aggregator. Each adapter stands alone and can be tested (or replaced) in isolation.

## Files

| File | Implements port | What it does |
|---|---|---|
| [json-file-state-store.ts](json-file-state-store.ts) | `StateStore` | Persists `PipelineState` to `.dagent/<slug>/_state.json` (nested layout) behind a POSIX `mkdirSync` lock ([file-state/lock.ts](file-state/lock.ts)). Also owns the invocation ledger (`state.artifacts`) and re-renders `_trans.md` on every write. |
| [file-state/](file-state/) | — | Internal helpers for `JsonFileStateStore`: `io.ts` (read/write), `lock.ts` (mkdir mutex), `init.ts` (state bootstrap from workflows.yml). |
| [git-shell-adapter.ts](git-shell-adapter.ts) | `VersionControl` | Runs `git` subprocesses via the `Shell` port. Never shells out directly; composes with `node-shell-adapter`. |
| [git-ops.ts](git-ops.ts) | — | Higher-level helpers (`createFeatureBranch`, branch checks) consumed by `GitShellAdapter` and the `create-branch` DAG node. |
| [github-ci-adapter.ts](github-ci-adapter.ts) | `CiGateway` | Polls GitHub Actions runs via `gh` CLI; tracks run status per SHA. |
| [shell-hook-executor.ts](shell-hook-executor.ts) | `HookExecutor` | Executes `.apm/hooks/*.sh` with orchestrator env + APM environment dict; captures stdout/stderr/exit. |
| [node-shell-adapter.ts](node-shell-adapter.ts) | `Shell` | Thin wrapper over `child_process.spawn` with timeout + stderr/stdout capture. Every subprocess in the engine transits this adapter. |
| [local-filesystem.ts](local-filesystem.ts) | `FeatureFilesystem` | Reads/writes feature-workspace files (`.dagent/`, `archive/`). |
| [apm-file-compiler.ts](apm-file-compiler.ts) | `ContextCompiler` | Runs the APM compiler against a given app root. Thin wrapper around `apm/compiler.ts`. |
| [jsonl-telemetry.ts](jsonl-telemetry.ts) | `Telemetry` | Appends structured events to JSONL log files per slug. |
| [copilot-session-runner.ts](copilot-session-runner.ts) | `CopilotSessionRunner` | Creates a Copilot SDK session, wires harness (tool logging, limits), sends prompt, waits for outcome. Owns SDK event plumbing. |
| [copilot-triage-llm.ts](copilot-triage-llm.ts) | `TriageLlm` | Dedicated short-prompt Copilot session for failure classification. |
| [file-triage-artifact-loader.ts](file-triage-artifact-loader.ts) | `TriageArtifactLoader` | Reads feature artifacts via [feature-paths.ts](feature-paths.ts) (kickoff `acceptance`, nested `_state.json`, per-invocation outputs/logs) and assembles the prior-cycle evidence bundle for triage. |
| [file-baseline-loader.ts](file-baseline-loader.ts) | `BaselineLoader` | Loads prior-pass baseline evidence used to skip nodes that are still green. |
| [subprocess-feature-runner.ts](subprocess-feature-runner.ts) | — | Spawns a child orchestrator for nested feature runs. Rarely used. |
| [session-circuit-breaker.ts](session-circuit-breaker.ts) | `CognitiveBreaker` | In-session tool-call counter. Injects soft-limit warnings, force-disconnects at hard limit. |
| [feature-paths.ts](feature-paths.ts) | — | Per-feature path resolver — the canonical translator from `(slug, itemKey, invocationId)` to `.dagent/<slug>/...` paths. Used by every adapter that touches feature artefacts. |
| [file-artifact-bus.ts](file-artifact-bus.ts) | `ArtifactBus` | Resolves declared `consumes_*` / `produces_artifacts`, copies upstream outputs into the next invocation's `inputs/`, and validates that produced artefacts match the catalogue before sealing. |
| [file-invocation-filesystem.ts](file-invocation-filesystem.ts) | `InvocationFilesystem` | Creates and reads the per-invocation `inputs/` / `outputs/` / `logs/` tree under `.dagent/<slug>/<nodeKey>/<invocationId>/`. |
| [file-invocation-logger.ts](file-invocation-logger.ts) | `InvocationLogger` | Writes the multiplexed log sinks (`events.jsonl`, `tool-calls.jsonl`, `messages.jsonl`, `stdout.log`, `stderr.log`) for one invocation. |
| [secret-redactor.ts](secret-redactor.ts) | — | Adapter-side redactor that strips known secret shapes (PATs, OIDC tokens, az/gh/aws CLI tokens) from telemetry and logs before they hit disk. |
| [index.ts](index.ts) | — | Barrel — instantiation is done by `main.ts`, not via a factory. |

## Public interface

Every adapter is a class or factory fn that returns an object matching its port. Construct in `main.ts`:

```ts
const stateStore = new JsonFileStateStore(path.join(appRoot, ".dagent"));
const vcs = new GitShellAdapter(new NodeShellAdapter({ cwd: repoRoot }));
const ci = new GithubCiAdapter({ shell, repoRoot });
const hookExec = new ShellHookExecutor({ shell, appRoot, repoRoot });
```

## Invariants & contracts

1. **I/O is confined here.** Grep for `node:fs` / `node:child_process` / `@github/copilot-sdk` outside `adapters/` (plus `entry/`) — any hit is a layering violation.
2. **One adapter, one port.** Adapters may use helper modules (`file-state/`, `git-ops.ts`) but must not compose multiple ports.
3. **Adapters may depend on other adapters only via ports.** `GitShellAdapter` depends on `Shell`, not on `NodeShellAdapter` directly — this is why they compose cleanly in tests.
4. **Errors are typed and propagated.** `ShellExecError` carries exit code + stderr; `JsonFileStateStore` lock errors are structured. Do not silently swallow I/O failures.
5. **No state between calls** other than the explicit instance fields (cache, lock handle, SDK client). No module-level globals.

## How to extend

**Swap an adapter** (e.g. SQLite-backed state store):

1. Create `adapters/sqlite-file-state-store.ts` implementing `StateStore`.
2. Change the instantiation in [entry/main.ts](../entry/main.ts).
3. Run the full test suite; ports do not care about the concrete implementation.

**Add a new adapter for a new port:**

1. Implement the port in a new file.
2. Export it from [index.ts](index.ts) (optional — `main.ts` may import directly).
3. Wire in `main.ts`.
4. Add integration tests under `__tests__/` — unit tests of adapters benefit from mocking at the `Shell` port, not at `child_process`.

**Replace the CI provider** (e.g. GitLab CI):

1. Implement `CiGateway` in `adapters/gitlab-ci-adapter.ts` — poll via `glab` CLI or the GitLab REST API.
2. Also consider writing a `ScmProvider` port if you want to stop shelling to `gh` in publish scripts (currently coupled — see AF README tech-debt).

## Gotchas

- **File-state lock is a directory, not a file.** `mkdirSync` is atomic; `writeFileSync` with `{ flag: "wx" }` is not portable enough. See [file-state/lock.ts](file-state/lock.ts).
- **`gh` CLI version drift.** `github-ci-adapter` parses `gh run view --json` output; field names have changed across `gh` versions. Pin in CI.
- **Copilot SDK event ordering is not guaranteed.** `copilot-session-runner` assumes `tool.execution_start` arrives before `tool.execution_complete` for a given tool id — true in practice, not documented as contractual.
- **`shell-hook-executor` trusts the hook script.** Hooks run with the orchestrator's privileges. The script path is validated against the `.apm/hooks/` directory but the contents are not sandboxed.
- **Multiple adapters instantiated per run.** `main.ts` builds one instance of each; tests mock at the port level, not by re-instantiating adapters.

## Related layers

- Implements → [src/ports/](../ports/README.md)
- Wired in → [src/entry/main.ts](../entry/README.md)
- Called from → [src/kernel/effect-executor.ts](../kernel/) (for effects) and [src/handlers/](../handlers/README.md) (via `NodeContext`)
