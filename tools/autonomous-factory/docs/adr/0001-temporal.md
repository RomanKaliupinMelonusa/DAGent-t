# ADR 0001 — Adopt Temporal OSS as Orchestration Kernel

## Status

Accepted — 2026-04-30.

## Context

The orchestrator drives long-running, multi-step agentic pipelines that mix
LLM sessions, CI polling, and shell-script activities. Durability,
crash-recovery, and replay-based debugging are core requirements: a single
feature can run for hours and must survive worker restarts without losing
its place in the DAG.

Earlier iterations of this codebase used a hand-rolled, command-sourced
state machine that persisted to JSON files. It worked for single-tenant,
in-process use, but had known fragility around crash recovery, bespoke
resume logic, custom signal/query handling, and JSONL-only telemetry. For a
partner-readiness goal (Salesforce, Google Antigravity, etc.), durable
execution backed by an industry-standard engine is table stakes.

Build-constraint context (load-bearing for the rest of the codebase) is
documented in [Determinism constraints](#determinism-constraints) below.

## Decision

Use **Temporal OSS** (MIT licensed, self-hosted on Postgres) as the
orchestration kernel. Workflow code lives under `src/workflow/`, activities
under `src/activities/`, the worker entry under `src/worker/main.ts`, and
client surfaces under `src/client/`. Pure helpers shared by activities live
under `src/activity-lib/`.

All IP-bearing layers above the kernel — APM compiler, activity contracts,
triage classifier, artifact ledger, microkernel registries — sit on top of
the Temporal SDK and are deliberately portable.

## Consequences

| Positive | Negative |
|---|---|
| Durable execution with built-in crash recovery | Now requires a Temporal cluster + Postgres |
| Signals and queries as first-class primitives (clean human-in-the-loop) | Programming-model dependency on Temporal SDK |
| Replay-based debugging from production histories | Determinism constraints in workflow code (see below) |
| OpenTelemetry surface out of the box | Operational burden of running (or paying for) a Temporal cluster |
| Multi-feature concurrency on one cluster | Workers must run from compiled JS — no `tsx` runtime |

## Mapping — Predecessor Concept → Temporal Concept

The historical mapping table is kept verbatim because it is load-bearing
for anyone reading older commits, narrative essays, or the
session-by-session migration history in git log. **Names on the left no
longer appear in the codebase**; this column exists only to translate
external references back to the current code.

| Predecessor concept | Temporal concept |
|---|---|
| `PipelineKernel` class | Workflow execution + history |
| `_state.json` durable store | Workflow event history (Postgres-backed) |
| `Command` discriminated union | Workflow code body |
| `Effect` discriminated union | Activity invocations |
| `effect-executor.ts` | Direct `await activity()` calls |
| `KernelRules` port | Workflow code references domain functions directly |
| `pipeline-loop.ts` | Workflow `while` loop in `src/workflow/pipeline.workflow.ts` |
| `signal-handler.ts` (POSIX SIGINT) | Temporal cancellation |
| `dangling-invocations.ts` | Activity heartbeat + start-to-close timeout |
| `stall-detection.ts` | Activity timeouts |
| `JsonFileStateStore` adapter | Postgres (Temporal persistence backend) |
| `subprocess-feature-runner.ts` | Multiple workflow executions on one cluster |
| `NodeHandler` interface | `@temporalio/activity` exported function |
| `handlers/copilot-agent.ts` | `activities/copilot-agent.activity.ts` |
| `handlers/local-exec.ts` | `activities/local-exec.activity.ts` |
| `handlers/github-ci-poll.ts` | `activities/github-ci-poll.activity.ts` |
| `handlers/triage-handler.ts` | `activities/triage.activity.ts` |
| `handlers/approval.ts` | Temporal Signal + `Workflow.condition()` |
| Cycle counter | Workflow-local variable |
| `domain/scheduling.ts`, `dag-graph.ts`, `transitions.ts`, `failure-routing.ts`, `error-signature.ts`, `volatile-patterns.ts`, `pruning.ts`, `batch-interpreter.ts` | In-workflow functions (deterministic) |
| `domain/init-state.ts` | Factory that builds `DagState` |
| `domain/approval-sla.ts` | `Workflow.sleep()` + signal race |
| `domain/progress-tracker.ts` | Workflow query handler |
| `apm/compiler.ts`, `apm/context-loader.ts` | Pre-workflow compilation (client-side) |
| `triage/*` (retriever, classifier, llm-router) | Activity-internal code |
| Artifact ledger (`.dagent/<slug>/<inv>/`) | Activity outputs on shared FS |
| `_trans.md` projection | Workflow query result + on-demand renderer |
| Admin CLI (`cli/pipeline-state.ts`) | Temporal client (signals + queries + describe) |
| `lifecycle/preflight.ts` | Pre-workflow client-side check |
| `lifecycle/hooks.ts` | Activity invocations from workflow |
| `lifecycle/auto-skip.ts` | Workflow-side check at node-ready time |
| `lifecycle/archive.ts` | Final activity (or post-workflow client step) |
| `reporting/*` | Temporal queries + OTLP export |
| `telemetry/jsonl-telemetry.ts` | OpenTelemetry SDK |
| `harness/*` (RBAC, shell guards, outcome tool) | Activity-internal code |
| `harness/limits.ts` (cognitive circuit breaker) | Activity-internal + workflow retry policy |
| Ports (`src/ports/`) | Activity-internal abstractions |
| Adapters (`src/adapters/`) | Used inside activities |
| `entry/main.ts`, `watchdog.ts`, `supervise.ts` | Worker bootstrap + workflow client |
| `entry/bootstrap.ts` | Pre-workflow APM compile + workflow start |
| `.apm/workflows.yml` | Compiled into workflow input (unchanged) |
| `.apm/apm.yml` | Compiled into workflow input (unchanged) |
| `.apm/hooks/`, `.apm/triage-packs/` | Invoked from activities (unchanged) |

## Determinism constraints

Workflow code (everything under `src/workflow/`) must be **deterministic
across replays**. Forbidden:

- `Date.now()`, `new Date()` — use `workflowInfo().runStartTime` or
  `Workflow.now()` (Temporal time)
- `Math.random()` — use `Workflow.uuid4()` if randomness is needed
- `process.env` reads — pass env via workflow input
- `node:fs`, `node:child_process`, `node:net`, any I/O
- `setTimeout`, `setInterval` — use `Workflow.sleep()`,
  `Workflow.condition()`
- Direct adapter or port imports
- `import.meta.url`-based path resolution
- Imports from `@github/copilot-sdk` or any LLM SDK
- Async iterators not provided by Temporal SDK
- Any module with hidden global state (locales, regex caches sourced from
  Date, etc.)

Allowed:

- Pure functions from `src/activity-lib/` and in-tree workflow helpers
- Temporal SDK primitives: `proxyActivities`, `condition`, `sleep`,
  `setHandler`, `defineSignal`, `defineQuery`, `patched`
- `JSON.parse/stringify` on workflow inputs
- Standard ECMAScript collections, `structuredClone`

The ESLint scope rule for `src/workflow/**` enforces these constraints; the
`lint:workflow-version` script enforces the matching versioning policy
(bump `WORKFLOW_VERSION` or add `patched(<id>)` whenever workflow logic
changes shape).

## Build constraints

Two constraints baked into the codebase that newcomers must respect:

1. **Workers run from compiled JS, not `tsx`.** `@temporalio/worker`
   bundles workflow code via webpack; webpack's resolver is incompatible
   with `tsx`'s global `Module._resolveFilename` hook. Worker entry points
   run via `npm run temporal:build` (→ `dist/`) followed by
   `node dist/worker/main.js`. The `temporal:worker` npm script chains
   both. Activities and workflow code are still authored in TypeScript and
   unit-tested directly by Vitest — the constraint applies only to what
   the worker process actually executes.

2. **The `ajv` postinstall shim is workspace infrastructure.** The webpack
   chain inside `@temporalio/worker` requires `ajv@^8`; ESLint v9 demands
   `ajv@^6`. `scripts/postinstall-ajv-shim.mjs` deterministically nests
   `ajv@6` inside the relevant `node_modules/eslint/` paths. It runs
   automatically on `npm install`. CI images and devcontainer rebuilds
   must let the postinstall hook fire.
