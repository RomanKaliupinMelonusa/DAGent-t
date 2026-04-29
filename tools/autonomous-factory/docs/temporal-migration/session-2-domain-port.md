# Session 2 — Domain Port

> Phase 3. **Reversible.** Pure domain logic copied into workflow scope; legacy `domain/` untouched and still drives the legacy kernel.

---

## Session Goal

Port the deterministic parts of `src/domain/` into `src/temporal/workflow/` and consolidate them into a `DagState` class that will eventually drive the workflow body. Validate parity by running both the legacy `domain/` tests and the new `DagState` tests against identical fixtures. At end of session: a workflow can construct a `DagState`, call its methods, and complete trivially — but no real activities are dispatched yet.

---

## Phases Included

- **Phase 3 — Pure Domain Logic into Workflow Code**

---

## Pre-flight Checks

- [ ] Session 1 exit criteria all met
- [ ] Hello-world workflow and worker still functional after any rebases
- [ ] No open PRs touching `src/domain/`

---

## Planning Agent Prompt

```
You are the Planning Agent for Session 2 of the Temporal migration. Your charter:

1. Port pure domain functions from src/domain/ into src/temporal/workflow/.
2. Build a DagState class encapsulating in-workflow DAG state and transitions.
3. Validate behavioural parity: any test that passes against domain/transitions.ts
   must pass against the equivalent DagState method given the same input.

Invariants:
- src/domain/ is read-only this session — no edits, no deletions.
- All ported code must satisfy the workflow determinism ESLint rule (no I/O, no Date.now, no adapters).
- DagState methods must return new state objects (no in-place mutation), matching the
  immutability discipline of the existing transitions.
- This session does NOT touch handlers, activities, or the workflow body. Just DagState.

Reference docs:
- tools/autonomous-factory/docs/temporal-migration/00-spec.md (mapping table, sections "Mapping" and "Determinism Constraints")
- tools/autonomous-factory/src/domain/README.md
- This session doc.

Stop and request human review if:
- Any domain function turns out to have hidden non-determinism (Date, randomness, environment).
- DagState API surface diverges materially from the existing transition contract.
- Parity tests fail for a non-trivial reason.

Exit gate: all exit criteria below pass.
```

---

## Implementation Tasks

Group A — Copy-import pure functions

| # | Task | Source | Target | Notes |
|---|---|---|---|---|
| A1 | Port scheduling | `src/domain/scheduling.ts` | `src/temporal/workflow/domain/scheduling.ts` | Verbatim copy; verify no hidden I/O |
| A2 | Port DAG graph | `src/domain/dag-graph.ts` | `src/temporal/workflow/domain/dag-graph.ts` | Verbatim copy |
| A3 | Port failure routing | `src/domain/failure-routing.ts` | `src/temporal/workflow/domain/failure-routing.ts` | Verbatim copy |
| A4 | Port error signature | `src/domain/error-signature.ts` | `src/temporal/workflow/domain/error-signature.ts` | Verify hash function is deterministic |
| A5 | Port volatile patterns | `src/domain/volatile-patterns.ts` | `src/temporal/workflow/domain/volatile-patterns.ts` | Regex compile is input-deterministic |
| A6 | Port cycle counter | `src/domain/cycle-counter.ts` | `src/temporal/workflow/domain/cycle-counter.ts` | Verify no implicit time math |
| A7 | Port pruning | `src/domain/pruning.ts` | `src/temporal/workflow/domain/pruning.ts` | |
| A8 | Port batch interpreter | `src/domain/batch-interpreter.ts` | `src/temporal/workflow/domain/batch-interpreter.ts` | |
| A9 | Port init-state | `src/domain/init-state.ts` | `src/temporal/workflow/domain/init-state.ts` | Adapt to return DagState seed |
| A10 | **Skip** stall detection | `src/domain/stall-detection.ts` | (none) | Replaced by Temporal timeouts |
| A11 | **Skip** dangling invocations | `src/domain/dangling-invocations.ts` | (none) | Replaced by Temporal heartbeats |
| A12 | **Skip** approval SLA | `src/domain/approval-sla.ts` | Workflow-side (Session 4) | Uses `Workflow.sleep()` + signal race |
| A13 | **Skip** progress tracker | `src/domain/progress-tracker.ts` | Workflow-side (Session 4) | Becomes a query handler |

Group B — Build DagState class

| # | Task | Files | Done when |
|---|---|---|---|
| B1 | Define `DagState` class skeleton with constructor accepting compiled workflow | `src/temporal/workflow/dag-state.ts` | Constructor instantiates from `CompiledWorkflowDef` |
| B2 | Implement `getReady(): readonly ReadyItem[]` | same | Delegates to ported `schedule()` |
| B3 | Implement `applyResult(itemKey, result): void` (in-place on `this`, but state is a workflow-local object) | same | Delegates to ported transitions; bumps cycle counter |
| B4 | Implement `applyTriage(commands: DagCommand[]): void` | same | Resets nodes per triage; cascades barriers |
| B5 | Implement `isComplete(): boolean` | same | True when all items are `done`/`na`/`dormant` |
| B6 | Implement `hasFailed(): boolean` and `lastFailure(): FailureInfo \| null` | same | Returns most recent failure for triage |
| B7 | Implement `cycleBudgetExceeded(): boolean` | same | Wraps cycle counter |
| B8 | Implement `snapshot(): DagSnapshot` for query handlers | same | Returns frozen, serializable copy |
| B9 | Implement `markApprovalReceived/Held/Resumed` for Session 4 | same | Stub-state flags; signal handlers will drive |
| B10 | Add comprehensive unit tests | `src/temporal/workflow/__tests__/dag-state.test.ts` | Mirror coverage of `domain/__tests__/transitions.test.ts` and `scheduling.test.ts` |

Group C — Parity validation

| # | Task | Files | Done when |
|---|---|---|---|
| C1 | Identify the 5–10 highest-value parity scenarios from existing domain tests | doc-only or test fixture file | List committed |
| C2 | Run each scenario through both code paths (legacy `domain/` and new `DagState`) | `src/temporal/workflow/__tests__/parity.test.ts` | Outputs identical for all scenarios |
| C3 | Document any intentional behaviour deltas (there should be none for Session 2) | `tools/autonomous-factory/docs/temporal-migration/02-parity-notes.md` | Empty doc shipped if no deltas, with explicit "no deltas observed" |

Group D — Smoke workflow

| # | Task | Files | Done when |
|---|---|---|---|
| D1 | Replace hello-world workflow with a "skeleton pipeline" workflow that constructs a `DagState` from a fixture, runs `getReady()` once, then completes | `src/temporal/workflow/skeleton-pipeline.workflow.ts` | Workflow runs on local Temporal; emits expected history |
| D2 | Workflow does NOT dispatch any activities — it just verifies DagState wiring | same | History shows workflow start, log, complete |

---

## Files Affected

**Created:**
- `tools/autonomous-factory/src/temporal/workflow/domain/` — 9 ported files + tests
- `tools/autonomous-factory/src/temporal/workflow/dag-state.ts`
- `tools/autonomous-factory/src/temporal/workflow/skeleton-pipeline.workflow.ts`
- `tools/autonomous-factory/src/temporal/workflow/__tests__/dag-state.test.ts`
- `tools/autonomous-factory/src/temporal/workflow/__tests__/parity.test.ts`
- `tools/autonomous-factory/docs/temporal-migration/02-parity-notes.md`

**Modified:**
- `tools/autonomous-factory/src/temporal/worker/main.ts` — register `skeleton-pipeline` workflow
- `tools/autonomous-factory/package.json` — add `temporal:skeleton` script

**Deleted:**
- `tools/autonomous-factory/src/temporal/workflow/hello.workflow.ts` — superseded by skeleton (or kept as dev fixture; agent's call)

**Untouched (read-only):**
- `tools/autonomous-factory/src/domain/` — entire directory
- `tools/autonomous-factory/src/kernel/`, `loop/`, `handlers/`, `adapters/`, `ports/`

---

## Test Strategy

1. **Direct unit tests** — every `DagState` method has tests mirroring the existing `domain/` test coverage.
2. **Parity tests** — `parity.test.ts` runs identical fixtures through both `domain/transitions.ts` and `DagState`, asserts deep equality.
3. **Determinism check** — ESLint rule from Session 1 must pass against all new files.
4. **Smoke workflow** — `npm run temporal:skeleton` runs end-to-end against local Temporal.
5. **Legacy regression** — full existing test suite remains green.

---

## Exit Criteria

- [ ] All Group A copy-imports complete with no hidden I/O / time / random dependencies
- [ ] `DagState` class fully implements the methods listed above
- [ ] Unit test coverage on `DagState` ≥ 90% line coverage
- [ ] Parity tests pass for at least 10 scenarios spanning: complete-item, fail-item, reset-nodes (single + cascading), salvage-for-draft, cycle-budget exhaustion
- [ ] Skeleton workflow runs on local Temporal and on CI Temporal
- [ ] No file under `src/domain/` modified (verify via `git diff main -- src/domain`)
- [ ] ESLint workflow-determinism rule passes against every new file
- [ ] Documentation map updated: link to ported domain files in `src/temporal/workflow/domain/README.md`

---

## Rollback Plan

Same as Session 1 — purely additive. Revert PRs, no data migration. The legacy domain layer continues serving the legacy kernel unchanged.

---

## Estimated Effort

- **Session total: 4–5 working days**

This is a low-risk session if Session 1 went well. The work is mostly mechanical translation; the only real engineering judgement is in the `DagState` API design.

---

## Hand-off to Session 3

When this session exits, the next Planning Agent receives:

- A `DagState` class that encapsulates all in-workflow state transitions
- Parity proof that `DagState` behaves identically to legacy `domain/` for the same inputs
- A skeleton workflow ready to start dispatching real activities

Session 3 begins with: "Port each handler to a Temporal activity, starting with the easy ones."
