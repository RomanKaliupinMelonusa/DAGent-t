# `src/client/` — Temporal Client Surfaces

One-shot scripts that act as Temporal clients — start workflows, send
signals, query state, run updates, tear down stuck runs. Each script
exits cleanly when its operation completes.

## Role in the architecture

Operators talk to a running pipeline through this layer. Two binaries
ship from here:

- `dagent-admin` ([admin.ts](admin.ts)) — verb dispatcher for the
  running-workflow surface (cancel, status, progress, summary, updates,
  nuke).
- `agent:run` (`run-feature.ts`) — feature-start CLI: compile APM
  context → start workflow execution.

Plus three smoke-test runners (`run-hello.ts`, `run-skeleton.ts`,
`run-single-activity.ts`) that the orchestrator's `temporal:hello` /
`temporal:skeleton` / `temporal:dispatch` npm scripts target.

## Files

| File | Role |
|---|---|
| [admin.ts](admin.ts) | `dagent-admin` verb dispatcher. Maps each verb to a signal/query/update/nuke. Owns the `--help` text. |
| [admin-parse.ts](admin-parse.ts) | Pure CLI argument parser. Returns a typed `ParsedArgs` or invokes the failure callback. Unit-testable without process exit. |
| [run-feature.ts](run-feature.ts) | `agent:run` entry — preflight + APM compile + `client.workflow.start(pipelineWorkflow, …)`. |
| [nuke.ts](nuke.ts) | Implementation of the `nuke` verb — terminate workflow, optionally delete branch, flush per-feature workspace. Outer `flushFeatureBranch` finally so the workspace is cleaned up even when terminate fails. |
| [run-hello.ts](run-hello.ts) | Smoke runner for `helloWorkflow`. |
| [run-skeleton.ts](run-skeleton.ts) | Smoke runner for `skeletonPipelineWorkflow`. |
| [run-single-activity.ts](run-single-activity.ts) | Smoke runner — dispatches a single activity through Temporal. |

The companion [`__tests__/`](__tests__/) directory exercises the parser
and the nuke-flow against in-memory Temporal fixtures.

## Public interface

Each file is a `#!/usr/bin/env node` script with a `main()` body. There
is no exported API for outside callers — the layer is invoked as a
process, never imported.

`dagent-admin --help` prints the canonical verb reference; see
[the operational hub](../../../.github/AGENTIC-WORKFLOW.md#pipeline-commands)
for the rendered version.

## Invariants & contracts

1. **No state mutation outside the workflow.** Admin scripts use
   signals (`cancelPipelineSignal`), updates
   (`resetScriptsUpdate`/`resumeAfterElevatedUpdate`/`recoverElevatedUpdate`),
   and queries — never reach into Temporal's history or write to disk
   on behalf of the workflow.
2. **Workflow ID convention.** `dagent-<workflowName>-<slug>`. Both
   `run-feature.ts` and `admin.ts` derive it the same way; the
   `--workflow` flag must match what the worker expects (default
   `storefront`).
3. **Exit-code contract** (used by CI scripts):
   - `0` — success.
   - `1` — invocation error or workflow not found.
   - `2` — update succeeded but reducer reports `halted: true` (cycle
     budget exhausted).
4. **Pretty-printable JSON to stdout.** Queries and update results print
   `JSON.stringify(value, null, 2)` so operators can pipe through `jq`.
   Signals print a one-line `✓ …` confirmation.
5. **`nuke` is destructive.** Without `--confirm` the script prints the
   plan and exits non-zero (safe dry-run). With `--confirm` it
   terminates the workflow, removes `.dagent/<slug>/`, and optionally
   deletes the local + remote feature branch.
6. **Outer `finally` for branch flush.** [nuke.ts](nuke.ts) wraps the
   terminate-and-flush flow so partial failures don't leave the
   workspace in a half-cleaned state.

## How to extend

**Add a new admin verb:**

1. Decide whether it's a signal, query, or update. State mutations
   must be updates (so the workflow reducer's `halted` flag can flow
   back to the operator).
2. Define the primitive in `src/workflow/{signals,queries,updates}.ts`.
3. Install a handler in `src/workflow/signal-wiring.ts`.
4. Bump `WORKFLOW_VERSION`.
5. Add the verb branch to [admin.ts](admin.ts) and update `VERB_HELP`.
6. Extend [admin-parse.ts](admin-parse.ts) with any new flags.

**Add a new smoke runner:**

1. Create `src/client/run-<thing>.ts` that calls `client.workflow.start`
   on the target workflow.
2. Add a `temporal:<thing>` script to
   [`tools/autonomous-factory/package.json`](../../package.json).
3. Add a replay-test fixture under
   [`src/__tests__/replay/`](../__tests__/replay/) so the workflow
   stays replay-safe.

## Gotchas

- **Don't add a `start` verb to `dagent-admin`.** Workflow start is
  `run-feature.ts`'s job — it does the APM compile + preflight first.
  Mixing both surfaces blurs the contract.
- **`reset-scripts` etc. exit code 2 is intentional.** Operators piping
  these into shell pipelines want the cycle-budget exhaustion to be
  detectable without parsing JSON.
- **`TEMPORAL_ADDRESS` and `TEMPORAL_NAMESPACE` are the only
  environment knobs.** Everything else flows through CLI flags so a
  shell history is sufficient to reproduce a run.
- **`nuke` resolves the repo root four levels up from the compiled
  file.** If the build layout changes
  (`<repo>/tools/autonomous-factory/dist/client/admin.js`), update the
  `import.meta.dirname` arithmetic.

## Related layers

- Calls → [`src/workflow/`](../workflow/README.md) signals/queries/updates
- Used by → operators (humans + CI workflows)
- Bootstrapped via → [`src/entry/`](../entry/README.md) (`bootstrap.ts`
  is reused by `run-feature.ts`)
- Talks to → Temporal cluster on `TEMPORAL_ADDRESS:7233` (the worker
  also connects there)
