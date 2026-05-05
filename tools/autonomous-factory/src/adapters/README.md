# `src/adapters/` — I/O Concretions

Every adapter implements a [port](../ports/README.md). Every file in this
folder is allowed to do I/O; nothing outside this folder is.

See [Architecture overview](../../docs/architecture.md) for how adapters
slot into the worker-side activity stack.

## Role in the architecture

Adapters are the only place in the engine where filesystem, subprocess,
git, GitHub API, or LLM SDK calls are legal. They translate port method
calls into concrete operations — `VersionControl.commit()` becomes a `git`
subprocess, `TriageLlm.classify()` becomes a Copilot SDK call,
`ArtifactBus.materialize()` becomes a tree of file copies into
`<inv>/inputs/`.

Adapters are constructed inside [`src/worker/main.ts`](../worker/README.md)
and injected into activities via the per-activity dependency setters
(`setCopilotAgentDependencies`, `setTriageDependencies`, …). The
client-side bootstrap in [`src/entry/bootstrap.ts`](../entry/README.md)
also instantiates a small subset (the roam `CodeIndexer`, telemetry).
There is no factory aggregator — each adapter stands alone and can be
tested or replaced in isolation.

## Files

| File | Implements port | What it does |
|---|---|---|
| [git-shell-adapter.ts](git-shell-adapter.ts) | `VersionControl` | Runs `git` subprocesses via the `Shell` port. Never shells out directly; composes with `node-shell-adapter`. Includes the branch-management helpers (`createFeatureBranch`, `getCurrentBranch`, `syncBranch`, `pushWithRetry`) previously in `git-ops.ts`. |
| [github-ci-adapter.ts](github-ci-adapter.ts) | `CiGateway` | Polls GitHub Actions runs via `gh` CLI; tracks run status per SHA. Used by the `github-ci-poll` activity. |
| [shell-hook-executor.ts](shell-hook-executor.ts) | `HookExecutor` | Executes `.apm/hooks/*.sh` with orchestrator env + APM environment dict; captures stdout/stderr/exit. |
| [node-shell-adapter.ts](node-shell-adapter.ts) | `Shell` | Thin wrapper over `child_process.spawn` with timeout + stderr/stdout capture. Every subprocess in the engine transits this adapter. |
| [local-filesystem.ts](local-filesystem.ts) | `FeatureFilesystem` | Reads/writes feature-workspace files (`.dagent/`, `archive/`). |
| [apm-file-compiler.ts](apm-file-compiler.ts) | `ContextCompiler` | Runs the APM compiler against a given app root. Thin wrapper around `apm/compiler.ts`. |
| [copilot-session-runner.ts](copilot-session-runner.ts) | `CopilotSessionRunner` | Creates a Copilot SDK session, wires harness (tool logging, limits), sends prompt, waits for outcome. Owns SDK event plumbing. |
| [copilot-triage-llm.ts](copilot-triage-llm.ts) | `TriageLlm` | Dedicated short-prompt Copilot session for failure classification. |
| [file-triage-artifact-loader.ts](file-triage-artifact-loader.ts) | `TriageArtifactLoader` | Reads feature artifacts via [`paths/feature-paths.ts`](../paths/feature-paths.ts) (kickoff `acceptance`, `_state.json` projection, per-invocation outputs/logs) and assembles the prior-cycle evidence bundle for triage. |
| [file-baseline-loader.ts](file-baseline-loader.ts) | `BaselineLoader` | Loads prior-pass baseline evidence used to skip nodes that are still green. |
| [session-circuit-breaker.ts](session-circuit-breaker.ts) | `CognitiveBreaker` | In-session tool-call counter. Injects soft-limit warnings, force-disconnects at hard limit. |
| [file-artifact-bus.ts](file-artifact-bus.ts) | `ArtifactBus` | Resolves declared `consumes_*` / `produces_artifacts`, copies upstream outputs into the next invocation's `inputs/`, and validates that produced artefacts match the catalogue before sealing. |
| [file-invocation-filesystem.ts](file-invocation-filesystem.ts) | `InvocationFilesystem` | Creates and reads the per-invocation `inputs/` / `outputs/` / `logs/` tree under `.dagent/<slug>/<nodeKey>/<invocationId>/`. |
| [file-invocation-logger.ts](file-invocation-logger.ts) | `InvocationLogger` | Writes the multiplexed log sinks (`events.jsonl`, `tool-calls.jsonl`, `messages.jsonl`, `stdout.log`, `stderr.log`) for one invocation. |
| [roam-code-indexer.ts](roam-code-indexer.ts) | `CodeIndexer` | Runs `roam-code` to (re)build the structural-intelligence index agents query through MCP. |
| [index.ts](index.ts) | — | Barrel re-exports — instantiation happens at the worker bootstrap, not via a factory. |

Pipeline state lives in Temporal event history (Postgres-backed), so there
is no `StateStore` adapter or `_STATE.json` writer here. Operators read the
current state of a run via the `dagent-admin status|progress|summary`
verbs, which call workflow queries declared in
[`src/workflow/queries.ts`](../workflow/queries.ts).

## Public interface

Each adapter is a class or factory fn returning an object matching its
port. Construction happens in [`src/worker/main.ts`](../worker/README.md):

```ts
const shell = new NodeShellAdapter({ cwd: repoRoot });
const vcs = new GitShellAdapter(shell);
const ci = new GithubCiAdapter({ shell, repoRoot });
const hookExec = new ShellHookExecutor({ shell, appRoot, repoRoot });
const triageLlm = new CopilotTriageLlm({ … });
```

## Invariants & contracts

1. **I/O is confined here.** Grep for `node:fs` / `node:child_process` /
   `@github/copilot-sdk` outside `adapters/` (plus the `worker/`,
   `client/`, `lifecycle/`, `session/`, `telemetry/`, `harness/`,
   `activities/` layers that explicitly do I/O) — anything in
   `workflow/`, `domain/`, `ports/`, `apm/`, `triage/`, or
   `activities/support/` is a layering violation.
2. **One adapter, one port.** Adapters compose private helper functions in the same file rather than splitting them out as additional modules.
3. **Adapters may depend on other adapters only via ports.**
   `GitShellAdapter` depends on `Shell`, not on `NodeShellAdapter` directly
   — this is why they compose cleanly in tests.
4. **Errors are typed and propagated.** `ShellExecError` carries exit code
   + stderr; do not silently swallow I/O failures.
5. **No state between calls** other than the explicit instance fields
   (cache, SDK client). No module-level globals.

## How to extend

**Swap an adapter** (e.g. a different LLM provider for triage):

1. Create `adapters/anthropic-triage-llm.ts` implementing `TriageLlm`.
2. Change the instantiation in [`src/worker/main.ts`](../worker/README.md).
3. Run the full test suite; ports do not care about the concrete
   implementation.

**Add a new adapter for a new port:**

1. Implement the port in a new file.
2. Optionally export from [index.ts](index.ts) — `worker/main.ts` may
   import directly.
3. Wire in `worker/main.ts` and inject via the relevant activity's
   dependency setter.
4. Add integration tests under `__tests__/`. Unit tests benefit from
   mocking at the `Shell` port, not at `child_process`.

**Replace the CI provider** (e.g. GitLab CI):

1. Implement `CiGateway` in `adapters/gitlab-ci-adapter.ts` — poll via
   `glab` CLI or the GitLab REST API.
2. Also consider writing a `ScmProvider` port if you want to stop
   shelling to `gh` in publish scripts (currently coupled).

## Gotchas

- **`gh` CLI version drift.** `github-ci-adapter` parses
  `gh run view --json` output; field names have changed across `gh`
  versions. Pin in CI.
- **Copilot SDK event ordering is not guaranteed.**
  `copilot-session-runner` assumes `tool.execution_start` arrives before
  `tool.execution_complete` for a given tool id — true in practice, not
  documented as contractual.
- **`shell-hook-executor` trusts the hook script.** Hooks run with the
  worker's privileges. The script path is validated against the
  `.apm/hooks/` directory but the contents are not sandboxed.
- **One instance per worker, per port.** `worker/main.ts` builds one
  instance of each; tests mock at the port level, not by re-instantiating
  adapters.

## Related layers

- Implements → [`src/ports/`](../ports/README.md)
- Wired in → [`src/worker/main.ts`](../worker/README.md) (most adapters)
  and [`src/entry/bootstrap.ts`](../entry/README.md) (the
  `CodeIndexer` only)
- Called from → [`src/activities/`](../activities/README.md) via injected
  ports
