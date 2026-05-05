# ADR 0002 — Pipeline State Lives in Temporal Event History

## Status

Accepted — 2026-04-30. Adopted alongside [ADR 0001](0001-temporal.md).

## Context

The predecessor orchestrator persisted pipeline state to two on-disk
files per feature: `<slug>_STATE.json` (machine-readable DAG snapshot)
and `<slug>_TRANS.md` (human-readable transition log). Both were
managed by `JsonFileStateStore` under a POSIX advisory lock; the
`PipelineKernel` was the sole writer.

This worked for single-tenant, in-process use. Production exposed
several friction points:

- **Crash recovery was bespoke.** Every recovery scenario (dangling
  invocations, half-applied effects, stuck approval gates) had its
  own reducer.
- **No replay-based debugging.** A failed run could only be
  reconstructed from `_TRANS.md` + telemetry; there was no canonical
  "play this back through the same logic" capability.
- **Operator surface was disjoint.** Status was a JSON dump; signals
  were SIGINT/SIGTERM; mutate-and-return verbs (`reset-scripts`,
  `recover-elevated`) bypassed the kernel and edited state directly.
- **Concurrency required care.** POSIX locks on a JSON file work in
  practice but don't scale to multiple workers or remote operators.

## Decision

Pipeline state moves into the **Temporal workflow event history**
(Postgres-backed). The workflow body is the only writer of `DagState`;
activities return `NodeResult` payloads that the workflow folds in.
Operators read state via Temporal queries (`stateQuery`,
`progressQuery`, `nextBatchQuery`, `summaryQuery`,
`pendingApprovalsQuery`) and mutate it via signals
(`cancelPipelineSignal`) and updates (`resetScriptsUpdate`,
`resumeAfterElevatedUpdate`, `recoverElevatedUpdate`).

The on-disk artefacts under `<app>/.dagent/<slug>/` (specs, kickoffs,
agent inputs/outputs, screenshots, JSONL telemetry) become **advisory**
— produced for humans to review, never read back by the engine.

## Consequences

| Positive | Negative |
|---|---|
| Crash recovery is free — Temporal replays the workflow from history. | Adds Postgres + Temporal cluster to the runtime footprint. |
| Replay-based debugging from production histories. | Workflow code must be replay-deterministic (lint-enforced; see ADR 0001). |
| Operator surface is the typed signal/query/update set; uniform shape. | Operators no longer cat a state file; tooling must use `dagent-admin`. |
| Multi-feature concurrency is one task queue; no lock files. | Histories grow with cycle counts → continue-as-new threshold required. |
| `_TRANS.md` rendering becomes a derived artefact (or skipped entirely). | Existing humans expecting `_TRANS.md` see only `dagent-admin status` JSON. |

## Read-back rule

If the engine reads its own state from disk after writing it, that's a
bug. The exception is per-invocation artefact materialisation — the
artifact bus copies declared `produces_artifacts` from upstream
`outputs/` into downstream `inputs/`. Those are agent-facing files,
not engine state.

## Migration mapping

See [ADR 0001](0001-temporal.md) for the full predecessor → Temporal
mapping table. The two rows specifically about state are:

| Predecessor | Temporal |
|---|---|
| `JsonFileStateStore` adapter | Postgres (Temporal persistence backend) |
| `_state.json` durable store | Workflow event history |
