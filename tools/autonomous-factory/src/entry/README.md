# `src/entry/` — Composition Root & Bootstrap

> The only place where adapters are constructed and wired. Every other layer depends on ports, not concretions.

## Role in the architecture

`entry/` is where the engine turns from a pile of pure logic + interfaces into a running program. It parses CLI args, runs preflight checks, compiles APM, instantiates adapters, constructs the `PipelineKernel`, and hands off to the loop.

Two CLI shapes are supported:

- **Single feature** (`npm run agent:run`) — [watchdog.ts](watchdog.ts) → [bootstrap.ts](bootstrap.ts) → [main.ts](main.ts). One feature per process.
- **Multi-feature supervisor** (`npm run agent:supervise`) — [supervise.ts](supervise.ts) → [supervisor.ts](supervisor.ts) fans out one child `agent:run` per feature via [SubprocessFeatureRunner](../adapters/subprocess-feature-runner.ts) with bounded parallelism.

## Files

| File | Role |
|---|---|
| [watchdog.ts](watchdog.ts) | Process entry point. Parses CLI via `cli.ts`, calls `bootstrap()`, creates a `CopilotClient`, starts the SDK, calls `runWithKernel()`, handles SIGINT for graceful shutdown. |
| [cli.ts](cli.ts) | Argv parsing. Returns a typed `CliArgs` (feature slug, app path, `--workflow` name, `--spec-file` path, base branch, flags). Validates that the spec file exists before bootstrap runs. |
| [bootstrap.ts](bootstrap.ts) | Runs every preflight check in order: GitHub auth, preflight cloud auth hook, APM compile + validation, workflow lookup, state seeding (when `_STATE.json` is absent) or schema/workflow drift check (when resuming), junk-file scan, .dagent artifact scan, roam index build, baseline load. Feature-branch creation is **not** a preflight step — it is a DAG node (`create-branch`). Returns a fully-assembled `PipelineRunConfig` + `baseTelemetry`. Throws `FatalPipelineError` subtypes on failure (no `process.exit`). |
| [main.ts](main.ts) | Composition root. Constructs all adapters, the `PipelineKernel`, `RegistryHandlerResolver`, `LoopLifecycle`, and calls `runPipelineLoop()`. |
| [supervise.ts](supervise.ts) | Multi-slug supervisor CLI (`npm run agent:supervise`). Parses an intake JSON of `{ slug, app }` entries and delegates to `runSupervisor()`. Used by [.github/workflows/agentic-supervisor.yml](../../../../.github/workflows/agentic-supervisor.yml). |
| [supervisor.ts](supervisor.ts) | Supervisor engine. `runSupervisor(intake, runner, { maxConcurrent })` drives a bounded-parallel scheduler over features, each executed by a `FeatureRunner` (typically [SubprocessFeatureRunner](../adapters/subprocess-feature-runner.ts) — one child `agent:run` per feature so `APP_ROOT` and the middleware registry stay isolated). |

## Public interface

From the command line:

```bash
npm run agent:run -- --app apps/sample-app --workflow full-stack --spec-file /tmp/spec.md my-feature
#   → watchdog.ts → bootstrap() → runWithKernel()
```

Programmatically (used by tests and nested feature runs):

```ts
import { bootstrap } from "./entry/bootstrap.js";
import { runWithKernel } from "./entry/main.js";

const { config, baseTelemetry } = await bootstrap(cliArgs);
const result = await runWithKernel(config, client, logger, baseTelemetry);
```

## Invariants & contracts

1. **`main.ts` is the only place adapters are instantiated.** Every other file depends on ports.
2. **Preflight failures are fatal and typed.** `BootstrapError`, `ApmCompileError`, `ApmBudgetExceededError`. Callers match on type; no string scraping.
3. **SDK client lifecycle is owned by `watchdog.ts`.** Exactly one `CopilotClient` per run; `client.stop()` on SIGINT with a 10-second timeout to avoid hanging on stale connections.
4. **Composition is synchronous.** All adapter constructors are non-async; async work (APM compile, auth checks) happens in `bootstrap.ts` before composition.
5. **Config is immutable after bootstrap.** `PipelineRunConfig` is passed by value; no layer reaches back up to mutate it.

## How to extend

**Add a new preflight check:**

1. Add the check function to [src/lifecycle/preflight.ts](../lifecycle/preflight.ts).
2. Call it from [bootstrap.ts](bootstrap.ts) in the right phase order (auth → APM → state → junk → roam). Scaffolding work that needs to run per-feature (branch creation, spec staging) belongs in the DAG, not here.
3. If it's fatal, throw a `BootstrapError` (or a new typed subclass).

**Swap an adapter implementation:**

1. Change the instantiation line in [main.ts](main.ts).
2. Everything downstream keeps working because it depends on the port.

**Add a new CLI flag:**

1. Extend `CliArgs` and parsing in [cli.ts](cli.ts).
2. Thread through `PipelineRunConfig` in [bootstrap.ts](bootstrap.ts) and [app-types.ts](../app-types.ts).
3. Consume wherever needed — never via `process.argv` outside this folder.

**Change loop lifecycle** (e.g. pre/post-run hooks):

1. Edit the `LoopLifecycle` assembly in [main.ts](main.ts).
2. The loop ([src/loop/pipeline-loop.ts](../loop/)) calls lifecycle methods at documented points.

## Gotchas

- **Two entry points, two scopes.** [watchdog.ts](watchdog.ts) runs one feature per process. [supervise.ts](supervise.ts) + [supervisor.ts](supervisor.ts) run many features in parallel by spawning child `agent:run` processes via [SubprocessFeatureRunner](../adapters/subprocess-feature-runner.ts). They are not redundant — each has a distinct CLI (`agent:run` vs `agent:supervise`) and workflow consumer.
- **`repoRoot` is computed relative to `import.meta.dirname`.** The `"../../../.."` hop count is brittle — moving this file breaks that path.
- **Bootstrap does a lot.** Ten-plus checks run sequentially. Keep new checks fast; anything > 5s should be optional or parallelised.
- **Branch creation is a DAG node, not a preflight.** `create-branch` runs `agent-branch.sh create-feature` as the first workflow node; `stage-spec` materializes `--spec-file` into `_kickoff/spec.md`. Bootstrap no longer shells out to `agent-branch.sh`.
- **The roam index build is non-fatal.** If roam-code bootstrap fails, the run continues without structural intelligence. Watch for this in logs if agents start behaving like it's 2024.

## Related layers

- Wires → [src/adapters/](../adapters/README.md) against [src/ports/](../ports/README.md)
- Constructs → [src/kernel/PipelineKernel](../kernel/README.md) with `DefaultKernelRules`
- Calls → [src/loop/pipeline-loop.ts](../loop/) via `runPipelineLoop()`
- Uses → [src/apm/context-loader.ts](../apm/README.md) for APM compile/load
- Uses → [src/lifecycle/preflight.ts](../lifecycle/) for preflight checks
