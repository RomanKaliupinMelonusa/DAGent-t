# `src/workflow/` — Pipeline Workflow

Deterministic Temporal workflow code. Runs inside Temporal's replay
sandbox; ESLint enforces the determinism rules.

## Role in the architecture

This layer **owns pipeline state**. The workflow under
[`pipeline.workflow.ts`](pipeline.workflow.ts) is the only writer of
`DagState`. Activities (`src/activities/`) return `NodeResult` payloads;
the workflow folds them into the DAG and decides what runs next.

External actors (operators, CI, ChatOps) read state via **queries**
([queries.ts](queries.ts)) and mutate state via **signals**
([signals.ts](signals.ts)) and **updates** ([updates.ts](updates.ts)) —
never by editing files on disk.

For the "why Temporal" decision and migration mapping see
[ADR 0001](../../docs/adr/0001-temporal.md).

## Files

| File | Role |
|---|---|
| [pipeline.workflow.ts](pipeline.workflow.ts) | Workflow body — top-level `while` loop. Wires sibling modules. |
| [pipeline-types.ts](pipeline-types.ts) | `PipelineInput` / `PipelineFinalStatus` / `PipelineResult` shapes. |
| [dag-state.ts](dag-state.ts) | `DagState` class — DAG snapshot + transition methods. |
| [domain/](domain/) | Workflow-VM-safe twin of `src/domain/` (no `node:crypto`, no I/O). |
| [signal-wiring.ts](signal-wiring.ts) | Installs all signal/query/update handlers in a single synchronous call. |
| [signals.ts](signals.ts) | `cancelPipelineSignal`. |
| [queries.ts](queries.ts) | `stateQuery`, `progressQuery`, `nextBatchQuery`, `summaryQuery`, `pendingApprovalsQuery`. |
| [updates.ts](updates.ts) | `resetScriptsUpdate`, `resumeAfterElevatedUpdate`, `recoverElevatedUpdate`. |
| [batch-dispatcher.ts](batch-dispatcher.ts) | Dispatches the ready batch in parallel; folds `NodeResult` into `DagState`. |
| [dispatch-node.ts](dispatch-node.ts) | Per-node dispatch — picks the activity proxy, builds `NodeContext`, applies result. |
| [activity-proxies.ts](activity-proxies.ts) | `proxyActivities<typeof activities>()` declarations + per-activity timeouts. |
| [activity-input.ts](activity-input.ts) | Builds the `ActivityInput` envelope from `DagState` + node spec. |
| [triage-driver.ts](triage-driver.ts) | Drives the triage cascade for newly-failed items. |
| [triage-cascade.ts](triage-cascade.ts) | Pure cascade reducer — fold triage verdicts into `DagState`. |
| [continue-as-new-controller.ts](continue-as-new-controller.ts) | Bumps a fresh workflow execution before the history grows past Temporal's limit. |
| [version.ts](version.ts) | `WORKFLOW_VERSION` constant — bump or `patched()` on any logic change. |
| [iso-time.ts](iso-time.ts) / [clock.ts](clock.ts) / [invocation-id.ts](invocation-id.ts) | Deterministic time + ID helpers (Workflow.now, Workflow.uuid4 wrappers). |
| [hello.workflow.ts](hello.workflow.ts) / [skeleton-pipeline.workflow.ts](skeleton-pipeline.workflow.ts) / [single-activity.workflow.ts](single-activity.workflow.ts) | Smoke-test workflows registered by the worker for replay tests. |
| [index.ts](index.ts) | Barrel — what the worker bundles. |

The `__fixtures__/` directory is **exempt** from the determinism lint rule
because it deliberately violates it for the lint regression test.

## Public interface

The workflow body itself is `pipelineWorkflow(input: PipelineInput)`.
Everything else external code can do is via the typed signal/query/update
constants exported from [signals.ts](signals.ts), [queries.ts](queries.ts),
and [updates.ts](updates.ts).

```ts
// Client side (src/client/admin.ts):
await handle.signal(cancelPipelineSignal, "operator-cancelled");
const snapshot = await handle.query(stateQuery);
const result = await handle.executeUpdate(resetScriptsUpdate, { args: [{ category: "deploy" }] });
```

## Invariants & contracts

1. **No I/O, no time, no randomness.** Workflow code may not import
   `adapters/`, `ports/`, `domain/` (use [`./domain/`](domain/) instead),
   `kernel/`, `loop/`, `handlers/`, or any LLM SDK. No `Date`,
   `Date.now()`, `Math.random()`, `setTimeout`, `setInterval`,
   `node:fs`, `node:child_process`, network, `process.env`, or
   `import.meta.url` path resolution. Bans enforced by
   [`eslint.config.js`](../../eslint.config.js).
2. **Activities are reached only via `proxyActivities<typeof activities>()`.**
   Direct activity-file imports break the worker bundle.
3. **Handlers are installed synchronously, before any `await`.** Signals
   delivered to a workflow before its handlers register are buffered
   only when registration happens in the workflow's first task. See
   [`signal-wiring.ts`](signal-wiring.ts).
4. **Versioning policy.** Bump `WORKFLOW_VERSION` (in
   [version.ts](version.ts)) or wrap newly introduced branches with
   `patched(<id>)` whenever workflow logic changes shape.
   `npm run lint:workflow-version` fails CI otherwise.
5. **`continue-as-new`.** When the event history grows past the
   continue-as-new threshold, the controller starts a fresh workflow
   execution carrying `priorSnapshot` + `priorAttemptCounts`. Approvals
   block continue-as-new so handlers stay bound while the gate is open.
6. **Absolute retry ceiling.** Per-node attempt counts are tracked
   in-workflow; exceeding the configured ceiling (default 5) halts the
   pipeline regardless of triage verdicts. See the postmortem in
   [`/memories/repo/dagent-runaway-retry-postmortem.md`].

## How to extend

**Add a new query:**

1. Add the type + `defineQuery<…>("<name>")` to
   [queries.ts](queries.ts).
2. Install a handler in [signal-wiring.ts](signal-wiring.ts):
   `setHandler(myQuery, () => projectMyThing(dag))`.
3. Add a verb to `src/client/admin.ts`.
4. Bump `WORKFLOW_VERSION` (handler set changed shape).

**Add a new signal:**

1. `defineSignal<[…]>("…")` in [signals.ts](signals.ts).
2. Install a handler in [signal-wiring.ts](signal-wiring.ts).
3. Wire client-side in `src/client/admin.ts`.
4. `WORKFLOW_VERSION` bump.

**Add a new node-type behaviour:**

Most node-type logic lives in
[`dispatch-node.ts`](dispatch-node.ts) and the activity proxies. Add a
new branch there, register the activity in
[`activity-proxies.ts`](activity-proxies.ts), and add the activity to
[`src/activities/`](../activities/README.md).

## Gotchas

- **`patched(<id>)` IDs are forever.** Once you ship one, never
  rename it — replays of older histories key on the exact string.
- **`structuredClone` is allowed.** `JSON.parse(JSON.stringify(x))` is
  also allowed and is sometimes the only way to satisfy the SDK's
  payload-encoder determinism check.
- **Continue-as-new with a pending approval is unsafe.** The
  controller checks `pendingApprovalsRegistry.size === 0` before
  triggering. Don't bypass.
- **`absoluteAttemptCeiling` is a hard floor.** Even if triage routes
  the failure cleanly, exceeding the ceiling halts the run. The
  ceiling defaults to 5 but is wired through `PipelineInput` so tests
  can lower it.

## Related layers

- Reads from → [`src/apm/`](../apm/README.md) (compiled context comes
  in as `PipelineInput`)
- Calls → [`src/activities/`](../activities/README.md) via activity
  proxies
- Read by → [`src/client/admin.ts`](../client/README.md) (queries +
  signals + updates)
- Twin of → [`src/domain/`](../domain/README.md) — same shapes, same
  algorithms, but workflow-VM-safe code under [`./domain/`](domain/)
