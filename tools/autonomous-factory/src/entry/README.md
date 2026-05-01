# `src/entry/` — Client-side Bootstrap

> Composition for the **client side** of the engine — preflight checks, APM
> compilation, and CLI parsing — invoked by [`src/client/run-feature.ts`](../client/README.md)
> before it asks Temporal to start a pipeline workflow. The worker process
> has its own composition root in [`src/worker/main.ts`](../worker/README.md).

See [Architecture overview](../../docs/architecture.md) for how the worker,
client, and Temporal cluster fit together.

## Files

| File | Role |
|---|---|
| [bootstrap.ts](bootstrap.ts) | `bootstrap(cli)` — runs every preflight check (GitHub auth, Copilot login, preflight cloud-auth hook, junk-file scan, in-progress artifact scan, port-3000 check, tool-limits hygiene, APM compile + budget validation, environment resolution via `.apm/hooks/resolve-environment.sh`, dependency pinning, baseline + roam-index loads), then returns a `BootstrapResult` (extended `PipelineRunConfig` plus baseline + roam indexer + telemetry). Throws `BootstrapError` / `ApmCompileError` / `ApmBudgetExceededError` on fatal failures — never calls `process.exit`. |
| [cli.ts](cli.ts) | Argv parsing. Returns a typed `CliArgs` (feature slug, app path, `--workflow` name, `--spec-file` path, base branch, flags). Validates the spec file exists before bootstrap runs. |
| [resolve-volatile-patterns.ts](resolve-volatile-patterns.ts) | Pure helper that compiles the merged volatile-pattern set from the APM manifest. Used by bootstrap to seed the error-fingerprint configuration that the workflow consumes. |

There is no `main.ts`, `watchdog.ts`, or `supervisor.ts` in this folder — the
predecessor in-process pipeline loop is gone. Pipeline execution lives in the
Temporal workflow under [`src/workflow/`](../workflow/README.md), driven by
the worker.

## Public interface

```ts
import { parseArgs } from "./entry/cli.js";
import { bootstrap } from "./entry/bootstrap.js";

const cli = parseArgs(process.argv.slice(2));
const boot = await bootstrap(cli);
//   → BootstrapResult: PipelineRunConfig + apmContext + baseline + telemetry
//
// run-feature.ts then maps boot.apmContext.workflows[name].nodes
// into PipelineNodeSpec[] and calls client.workflow.signalWithStart(...).
```

## Invariants & contracts

1. **Bootstrap is a pure preparation step.** It does not start a pipeline,
   touch Temporal, or open Copilot SDK sessions — those live in the Temporal
   client (`src/client/run-feature.ts`) and in activities respectively.
2. **Preflight failures are fatal and typed.** `BootstrapError`,
   `ApmCompileError`, `ApmBudgetExceededError`. Callers match on type; no
   string scraping.
3. **State seeding is the workflow's job.** Bootstrap no longer writes
   `_STATE.json`; the Temporal workflow owns the DAG state (see ADR
   [0001](../../docs/adr/0001-temporal.md)). Bootstrap just hands the client
   the inputs needed to `signalWithStart`.
4. **Branch creation is a DAG node, not a preflight.** `create-branch` runs
   `agent-branch.sh create-feature` as the first workflow node;
   `stage-spec` materializes `--spec-file` into `_kickoff/spec.md`.
   Bootstrap does not shell out to `agent-branch.sh`.

## How to extend

**Add a new preflight check:**

1. Add the check function to [`src/lifecycle/preflight.ts`](../lifecycle/README.md).
2. Call it from [bootstrap.ts](bootstrap.ts) in phase order
   (auth → APM → env → state-shape → junk → roam).
3. If it's fatal, throw a `BootstrapError` (or a new typed subclass).

**Add a new CLI flag:**

1. Extend `CliArgs` and parsing in [cli.ts](cli.ts).
2. Thread through `PipelineRunConfig` and on into the workflow's
   `PipelineInput` (declared in [`src/workflow/index.ts`](../workflow/README.md)).
3. Consume in the workflow or activities — never via `process.argv` outside
   this folder.

## Gotchas

- **Bootstrap does a lot.** Ten-plus checks run sequentially. Keep new
  checks fast; anything > 5s should be optional or parallelised.
- **`repoRoot` is computed relative to `import.meta.dirname`.** The
  `"../../../.."` hop count is brittle — moving this file breaks that path.
- **The roam index build is non-fatal.** If roam-code bootstrap fails, the
  run continues without structural intelligence. Watch for this in logs if
  agents start behaving like it's 2024.

## Related layers

- Consumed by → [`src/client/run-feature.ts`](../client/README.md)
- Uses → [`src/apm/context-loader.ts`](../apm/README.md) for APM compile/load
- Uses → [`src/lifecycle/preflight.ts`](../lifecycle/README.md) and
  [`src/lifecycle/dependency-pinning.ts`](../lifecycle/README.md)
- Uses → [`src/adapters/roam-code-indexer.ts`](../adapters/README.md) (the
  `CodeIndexer` adapter constructed at boot)
