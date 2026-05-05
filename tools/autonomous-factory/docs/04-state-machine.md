# State Machine

How the workflow models pipeline state, what's authoritative vs
advisory, and how operators read and mutate a running run.

## Context

A pipeline is a state machine. Done badly, "state" is sprinkled across
files (`_STATE.json`), in-memory variables (the orchestrator process),
disk artefacts (per-invocation outputs), git (the feature branch), and
the operator's terminal scrollback. Crash recovery is impossible;
operator intervention is brittle.

DAGent's answer: **a single owner per state taxonomy**. The Temporal
workflow event history is the only authoritative source for pipeline
state. Per-feature artefacts under `<app>/.dagent/<slug>/` are
**advisory** — they exist for humans to review, not for the engine to
read back.

## State taxonomies

| What | Where | Authoritative? |
|---|---|---|
| Pipeline state (DAG, attempts, cycles, gates) | Temporal event history (Postgres) | Yes |
| Per-feature artefacts (specs, kickoffs, agent outputs, screenshots) | `apps/<app>/.dagent/<slug>/` on the shared FS | Advisory |
| Telemetry (events, structured logs) | `apps/<app>/.dagent/<slug>/_LOG.jsonl` + console mirror | Advisory |
| Code state (feature branches, PR diffs) | Git remote (GitHub) | Yes — for code; orchestrator only mediates |

`_trans.md` and `_state.json` are not used by the engine. Operators
read state via `dagent-admin status|progress|summary|next`, which call
the workflow's queries directly.

## DagState — the core shape

[`src/workflow/dag-state.ts`](../src/workflow/dag-state.ts) exports a
`DagState` class that wraps an immutable `PipelineState`. It is built
once per workflow execution and folded forward by every batch.

```ts
class DagState {
  static fromInit(args: InitArgs): DagState;            // fresh start
  static fromSnapshot(snap: Snapshot): DagState;        // post-continue-as-new

  getReady(): { kind: "items"; items } | { kind: "complete" } | { kind: "blocked" };
  bumpBatch(): void;
  completeItem(key: string): void;
  failItem(key: string, error: string, ceiling: number): { halted: boolean };
  resetNodes(seed: string, reason: string, max: number): { halted: boolean; cycleCount: number };
  salvageForDraft(...): void;
  resumeAfterElevated(...): { halted: boolean };

  isCancelled(): boolean;
  snapshot(): Snapshot;
}
```

Every mutator returns to immutable internal storage; callers folded the
result into the next iteration. Pure transition algorithms live in
[`src/domain/transitions.ts`](../src/domain/transitions.ts) and
[`src/domain/scheduling.ts`](../src/domain/scheduling.ts) — these are
workflow-VM-safe (no I/O, no clocks, no randomness) so the workflow can
import them directly.

## Node lifecycle

Each node moves through a small state lattice:

```
       ┌──────────┐    deps satisfied   ┌──────────┐    dispatch   ┌────────────┐
       │ pending  │ ─────────────────▶  │ ready    │ ────────────▶ │ in-flight  │
       └──────────┘                     └──────────┘               └─────┬──────┘
            ▲                                                            │
            │ resetNodes()                                                │ NodeResult
            │                                                            ▼
       ┌──────────┐                                                  ┌──────┴──────┐
       │ dormant  │                                                  │ done │ failed │
       └──────────┘                                                  └──────┴──────┘
```

- **dormant** — pruned at init via
  [`src/domain/pruning.ts`](../src/domain/pruning.ts) when the workflow
  type elides the node (e.g. `frontend-dev` is dormant in a
  backend-only workflow).
- **na** — node legitimately doesn't run (workflow shape elision); kept
  in state for retrospective tooling so `naByType` is queryable.
- **failed** — terminal for that attempt. `failItem` increments the
  per-node attempt counter; the workflow halts when it exceeds the
  ceiling (default 5, postmortem in
  [`/memories/repo/dagent-runaway-retry-postmortem.md`]).

## Scheduling

[`src/domain/scheduling.ts`](../src/domain/scheduling.ts)
implements `schedule(items, deps)`. It walks the dependency graph and
returns:

- `{ kind: "items", items }` — ready batch.
- `{ kind: "complete" }` — every item is in a terminal state.
- `{ kind: "blocked" }` — at least one non-terminal item exists, but
  none are ready (typically a held gate or a cycle in dormancy
  promotion).

The workflow body dispatches the batch in parallel via
[`batch-dispatcher.ts`](../src/workflow/batch-dispatcher.ts), folds
results back, and loops.

## Transitions

| Transition | Trigger | Effect |
|---|---|---|
| `completeItem(key)` | Activity returns `status: "complete"` | Node → done; downstream may become ready. |
| `failItem(key, error)` | Activity returns `status: "failed"` (or throws) | Node → failed; attempt counter ++; halts if counter > ceiling. |
| `resetNodes(seed, reason, max)` | Triage verdict | `seed` and its declared cascade reset to pending; cycle counter ++; halts at `max`. |
| `salvageForDraft(...)` | Workflow detects an unrecoverable wedge | Demotes blocking nodes to "salvaged" so a draft PR can ship. |
| `resumeAfterElevated(...)` | `dagent-admin resume-after-elevated` | Re-enables salvaged items + standard CI poll after manual elevated apply. |

A salvage post-condition runs at workflow termination: a run that
demoted nodes via `salvageForDraft` AND produced zero `done` dev nodes
is reclassified `failed` instead of `complete`. Wrapped with
`patched("salvage-postcondition")` so older histories still terminate
the same way on replay.

## Cycle counting

Two budgets, both bounded:

- **Per-node retry budget** — `failItem`'s ceiling. Default 5.
- **Per-feature redev cycle** — `resetForDev` ceiling. Default 5
  cycles of (post-deploy failure → triage → reset upstream dev).
  Override per-call via `recover-elevated --max-dev-cycles`.

The identical-error circuit breaker
([`src/domain/cycle-counter.ts`](../src/domain/cycle-counter.ts) +
[`src/domain/error-signature.ts`](../src/domain/error-signature.ts))
counts identical fingerprints separately and halts at
`max_redeploy_cycles` (default 3) regardless of the per-node budget.

## Signals, queries, updates

Three Temporal primitives expose state to operators:

| Primitive | Files | Purpose |
|---|---|---|
| **Signals** | [`src/workflow/signals.ts`](../src/workflow/signals.ts) | Fire-and-forget. `cancelPipeline(reason)` is the only spine signal. |
| **Queries** | [`src/workflow/queries.ts`](../src/workflow/queries.ts) | Read state without mutating. `state`, `progress`, `nextBatch`, `summary`, `pendingApprovals`. |
| **Updates** | [`src/workflow/updates.ts`](../src/workflow/updates.ts) | Mutate-and-return. `resetScripts`, `resumeAfterElevated`, `recoverElevated`. Each returns `{halted, cycleCount, …}` so the CLI can exit code 2 on budget exhaustion. |

All three are installed in a single synchronous call to `installHandlers`
at the top of the workflow, before any `await` — Temporal only buffers
signals delivered before handler registration when registration happens
in the workflow's first task.

## Workflow versioning

Pipeline state shape is part of the contract. Whenever workflow logic
changes shape (a new branch, a new transition, a new query handler),
one of two things must happen:

1. **Bump `WORKFLOW_VERSION`**
   ([`src/workflow/version.ts`](../src/workflow/version.ts)). Forces a
   fresh execution for new starts.
2. **Wrap the new branch with `patched("<id>")`**. Older histories
   replay through the unpatched branch; newer ones take the patched
   branch.

`npm run lint:workflow-version`
([`tools/autonomous-factory/scripts/lint-workflow-version.mjs`](../scripts/lint-workflow-version.mjs))
fails CI if `src/workflow/**` changed without one of those updates.

## Operational levers

| Lever | Effect |
|---|---|
| `dagent-admin status <slug>` | Full `StateSnapshot` (JSON). |
| `dagent-admin progress <slug>` | Counts + percent. |
| `dagent-admin next <slug>` | Currently-ready batch. |
| `dagent-admin summary <slug>` | One-line operational summary. |
| `dagent-admin cancel <slug> --reason "<text>"` | Sets the cancel flag; workflow returns `{ status: "cancelled", reason }`. |
| `dagent-admin reset-scripts <slug> --category <c> [--max-cycles N]` | Re-enables script nodes for re-push. |
| `dagent-admin nuke <slug> --confirm [--delete-branch]` | Terminate workflow + flush workspace + optionally delete branch. |
| Continue-as-new threshold | Tunable in
[`continue-as-new-controller.ts`](../src/workflow/continue-as-new-controller.ts) — bumps a fresh execution before history grows too large. |

## Where to look in code

- Workflow body → [`src/workflow/pipeline.workflow.ts`](../src/workflow/pipeline.workflow.ts)
- DagState class → [`src/workflow/dag-state.ts`](../src/workflow/dag-state.ts)
- Pure transitions → [`src/domain/transitions.ts`](../src/domain/transitions.ts)
- Pure scheduling → [`src/domain/scheduling.ts`](../src/domain/scheduling.ts)
- Cycle counter → [`src/domain/cycle-counter.ts`](../src/domain/cycle-counter.ts)
- Error fingerprint → [`src/domain/error-signature.ts`](../src/domain/error-signature.ts)
- Signal/query/update handlers → [`src/workflow/signal-wiring.ts`](../src/workflow/signal-wiring.ts)
- Layer README → [`src/workflow/README.md`](../src/workflow/README.md)
- Migration mapping (predecessor → Temporal) → [ADR 0001](adr/0001-temporal.md)
