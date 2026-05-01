# Architecture

The orchestrator is a Temporal-based agentic pipeline engine. A single
worker process executes activities for a DAG-shaped workflow that walks a
feature spec from kickoff to PR.

## Topology

Operators interact with the system through `dagent-admin` (a Temporal
client) and `dagent-worker` (a Temporal worker that executes the pipeline
workflow and its activities). The Temporal cluster — frontend / history /
matching services backed by Postgres — owns durable state. Telemetry is
written as JSONL plus a console mirror under each feature workspace.

```
                 +-------------------+
                 |   dagent-admin    |   start <slug> | cancel |
                 |  (Temporal client)|   status | progress | summary
                 +---------+---------+
                           |
                           | gRPC :7233
                           v
        +--------------------------------------+
        |          Temporal Cluster            |
        |  frontend  +  history  +  matching   |
        |       (Postgres-backed history)      |
        +------+----------------------+--------+
               |                      ^
        polls  |                      | activity
        task   |                      | results +
        queue  v                      | heartbeats
        +----------------------+      |
        |    dagent-worker     |------+
        |  (workflow + activities)
        |                      |--> .dagent/<slug>/_LOG.jsonl + console
        +----------+-----------+
                   |
                   | shell exec / git / gh / Copilot SDK
                   v
            local FS + GitHub + LLM providers
```

Data flow for a feature run:

1. Operator runs `dagent-admin start <slug>` (or `npm run agent:run`,
   which delegates to `src/client/run-feature.ts`).
2. The client compiles APM context, then asks Temporal to start the
   pipeline workflow with that input.
3. The worker polls the task queue, schedules ready DAG nodes, and invokes
   activities for each node.
4. Activities emit JSONL telemetry events, write artifacts under
   `apps/<app>/.dagent/<slug>/`, and return `NodeResult` payloads.
5. The workflow advances the DAG, persists state to Temporal history, and
   continues until the pipeline reaches a terminal state.

## State taxonomy

| What | Where | Authoritative? |
|---|---|---|
| Pipeline state (DAG, attempts, cycles, gates) | Temporal event history (Postgres) | Yes — single source of truth |
| Per-feature artifacts (specs, kickoffs, agent outputs) | `apps/<app>/.dagent/<slug>/` on shared FS | Advisory — activities write here for review |
| Telemetry (events, structured logs) | `apps/<app>/.dagent/<slug>/_LOG.jsonl` + console | Advisory — observability only |
| Code state (feature branches, PR diffs) | Git remote (GitHub) | Yes — for code; orchestrator only mediates |

Anything not listed above is derived: `_trans.md` is a projection rendered
on demand from a workflow query, and `dagent-admin status` is just a
formatted dump of `stateQuery()`.

## Workflows + activities catalog

- [src/workflow/](../src/workflow/) — pipeline workflow,
  `DagState`, signal/query/update handlers, activity proxy declarations,
  `WORKFLOW_VERSION`. Deterministic; lint-enforced.
- [src/activities/](../src/activities/) — six activities the workflow
  invokes:
  - `local-exec.activity.ts` — runs shell commands (push, publish, tests,
    builds), with optional `pre`/`post` hooks.
  - `github-ci-poll.activity.ts` — polls a GitHub Actions run via
    heartbeats until it terminates.
  - `copilot-agent.activity.ts` — drives an LLM session via
    `@github/copilot-sdk` with cognitive-circuit-breaker limits.
  - `triage.activity.ts` — classifies failures and returns redev routing.
  - `archive.activity.ts` — finalizes feature workspace at terminal
    states.
  - `hello.activity.ts` — smoke-test activity, kept for replay tests.
- [src/activities/support/](../src/activities/support/) — pure helpers shared by
  multiple activities (no Temporal SDK imports; safe to unit-test
  directly).
- [src/worker/main.ts](../src/worker/main.ts) — worker entry point.
  Registers workflows + activities and starts polling.
- [src/client/admin.ts](../src/client/admin.ts) — admin CLI surface.
- [src/client/run-feature.ts](../src/client/run-feature.ts) — feature
  start CLI; compiles APM context then starts the pipeline workflow.
- [src/telemetry/](../src/telemetry/) — JSONL pipeline-logger + console
  rendering helpers.

## Admin CLI verbs

Verbatim output of `dagent-admin --help`:

```
Usage: agent:admin:temporal <verb> <slug> [options]

Verbs:
  Signals:
    cancel    <slug> [--reason <s>]                 — terminal halt with reason

  Updates (admin mutate-and-return):
    reset-scripts <slug> --category <c> [--max-cycles N]
                                                    — reset script nodes for re-push (default max 10)
    resume-after-elevated <slug> [--max-cycles N]
                                                    — resume after elevated apply (default max 5)
    recover-elevated <slug> --error <msg> [--max-fail-count N] [--max-dev-cycles N]
                                                    — recover after elevated apply failure (defaults 10/5)

  Queries:
    status    <slug>                                — full StateSnapshot (JSON)
    progress  <slug>                                — count summary + percent
    next      <slug>                                — ready-to-dispatch batch
    summary   <slug>                                — terminal summary snapshot

Common options:
  --workflow <name>      Workflow name (default: storefront)
  --reason <text>        Human reason (cancel only)
  --category <c>         Script-node category (reset-scripts only)
  --error <msg>          Elevated-apply error message (recover-elevated only)
  --max-cycles N         Cycle budget override (reset-scripts, resume-after-elevated)
  --max-fail-count N     Fail-count budget override (recover-elevated)
  --max-dev-cycles N     Dev-cycle budget override (recover-elevated)

Environment:
  TEMPORAL_ADDRESS    Temporal frontend gRPC address (default localhost:7233)
  TEMPORAL_NAMESPACE  Namespace (default default)

Exit codes:
  0  success
  1  invocation error or workflow not found
  2  update succeeded but reducer reports halted=true (cycle budget exhausted)
```

## Versioning policy

Bump `WORKFLOW_VERSION` (in [src/workflow/version.ts](../src/workflow/version.ts))
or wrap newly-introduced branches with `patched(<id>)` whenever workflow
logic changes shape. The `lint:workflow-version` script in CI fails the
build if a `src/workflow/**` change lands without one of those updates.
The "why" — Temporal replay determinism — is in
[ADR 0001](adr/0001-temporal.md).
