# Session 4 — Workflow Body & Periphery

> Phases 5 and 6. **Reversible** (legacy path still runs). Both code paths are now functional in parallel.

---

## Session Goal

Build the full pipeline workflow that replaces `pipeline-loop.ts` end-to-end, using `DagState` (Session 2) and the activities (Session 3). Replace JSONL telemetry with OpenTelemetry. Rewrite the reporting layer to read from Temporal queries. Rewrite the admin CLI as a Temporal client. At end of session: a real feature can run start-to-finish on Temporal, producing a PR identical to the legacy path. Both paths still coexist.

---

## Phases Included

- **Phase 5 — Implement Full Workflow Body**
- **Phase 6 — Replace Periphery (Reporting, Telemetry, CLI)**

---

## Pre-flight Checks

- [ ] Session 3 exit criteria all met
- [ ] All five activities snapshot-equivalent to legacy handlers
- [ ] Approval signal pattern proven
- [ ] OTLP target chosen (deferred from Session 1 if needed — must land here)
- [ ] Production Temporal cluster reachable
- [ ] Reference feature spec available for end-to-end testing

---

## Planning Agent Prompt

```
You are the Planning Agent for Session 4 of the Temporal migration. Your charter:

Phase 5 — Build the full pipeline workflow:
1. Author the workflow body that replaces src/loop/pipeline-loop.ts.
2. Wire signals (approve, reject, hold, resume, cancel) to DagState.
3. Wire queries (state, progress, next-batch, summary) to DagState.snapshot().
4. Implement the redev/triage cycle exactly as the legacy kernel does.
5. Run a real feature end-to-end on Temporal; produce a PR.

Phase 6 — Migrate the periphery:
6. Replace JSONL telemetry with OpenTelemetry across all activities + workflow.
7. Rewrite reporting/* to pull from Temporal queries instead of _state.json.
8. Rewrite admin CLI verbs as Temporal client calls (signals + queries + describe).
9. Update lifecycle hooks (preflight = pre-workflow client step; archive = final activity).

Invariants:
- Legacy `npm run agent:run` must continue to work throughout this session.
- Both paths produce identical PRs for identical specs (snapshot proof).
- No file under src/kernel/, src/loop/, src/handlers/, src/cli/ modified — those die in Session 5.
- All workflow code passes the determinism ESLint rule.
- Signal handlers are registered as the FIRST workflow lines (before any await).

Reference docs:
- 00-spec.md (Mapping table; Determinism Constraints)
- 03-approval-pattern.md (from Session 3)
- session-4-workflow-and-periphery.md (this file)

Stop and request human review if:
- Workflow body exceeds ~400 LOC (sign of insufficient extraction into helpers).
- Determinism violations appear during replay testing.
- OTel adoption surfaces telemetry incompatibilities with downstream consumers.
- Admin CLI feature parity gap blocks an existing operational workflow.

Exit gate: all exit criteria below pass. PR-equivalence proof is mandatory.
```

---

## Phase 5 Tasks — Workflow Body

Group A — Signals & Queries

| # | Task | Files |
|---|---|---|
| A1 | Define all signals: `approve`, `reject`, `hold`, `resume`, `cancel`, `resetScripts`, `resumeElevated`, `redevelopInfra` | `src/temporal/workflow/signals.ts` |
| A2 | Define all queries: `state`, `progress`, `nextBatch`, `summary`, `costSnapshot`, `flightData` | `src/temporal/workflow/queries.ts` |
| A3 | Helper: `attachHandlers(dagState)` registers all signal+query handlers in one call | `src/temporal/workflow/handlers.ts` |
| A4 | Tests using `TestWorkflowEnvironment` — every signal mutates state, every query returns expected snapshot | `src/temporal/workflow/__tests__/signals-queries.test.ts` |

Group B — Workflow Body

| # | Task | Files |
|---|---|---|
| B1 | `pipelineWorkflow(input: PipelineInput): Promise<PipelineResult>` | `src/temporal/workflow/pipeline.workflow.ts` |
| B2 | First lines: `setHandlers(dagState)` for signals/queries (per Temporal SDK ordering) | same |
| B3 | Main loop: `while (!dag.isComplete())` — getReady + parallel dispatch + applyResult + triage cycle | same |
| B4 | Approval gate: `await Workflow.condition(() => dag.isApproved())` with SLA timeout race via `Workflow.sleep()` | same |
| B5 | Hold/resume: `await Workflow.condition(() => !dag.isHeld())` at top of each loop iteration | same |
| B6 | Cancellation: handle `CancelledFailure` from worker; emit cancellation artifacts | same |
| B7 | Triage routing: on activity failure, dispatch `triageActivity`, apply returned commands | same |
| B8 | Cycle budget: terminate workflow with `{status: 'halted', reason: 'redev-cycle-limit'}` when budget exceeded | same |
| B9 | Continue-as-new safeguard: if workflow history > 8K events, `continueAsNew(currentState)` | same |
| B10 | Final activity: `archiveFeatureActivity` runs after `dag.isComplete()` returns true | same |

Group C — Activity proxies

| # | Task | Files |
|---|---|---|
| C1 | Workflow-side proxy declarations using `proxyActivities<typeof activities>()` with per-activity options | `src/temporal/workflow/activity-proxies.ts` |
| C2 | Map handler key → activity proxy; route `dispatchNode` through this map | same |

Group D — End-to-end test

| # | Task | Files |
|---|---|---|
| D1 | Reference feature: pick a small, deterministic spec from existing test fixtures | `tools/autonomous-factory/test-fixtures/temporal-reference-feature/` |
| D2 | Test: run feature on legacy path → capture PR diff | `temporal-reference-feature/legacy.snapshot.json` |
| D3 | Test: run same feature on Temporal path → capture PR diff | `temporal-reference-feature/temporal.snapshot.json` |
| D4 | Assert: PR diffs identical (file list, line-level diff, commit messages, artifact contents) | `src/temporal/__tests__/pr-equivalence.test.ts` |
| D5 | Crash recovery test: kill worker mid-feature, restart, feature resumes; verify final PR identical | same |

---

## Phase 6 Tasks — Periphery

Group E — OpenTelemetry adoption

| # | Task | Files |
|---|---|---|
| E1 | Add OTel deps: `@opentelemetry/api`, `@opentelemetry/sdk-node`, OTLP exporter | `tools/autonomous-factory/package.json` |
| E2 | OTel bootstrap module — initializes tracer, configures OTLP exporter from env | `src/temporal/telemetry/otel-init.ts` |
| E3 | Instrument every activity: span per activity invocation with attributes (`slug`, `itemKey`, `attempt`, `cycleIndex`) | within each activity file |
| E4 | Instrument workflow: span per `dispatchNode` call (workflow-side spans use `inWorkflowContext`) | `pipeline.workflow.ts` |
| E5 | Replace `jsonl-telemetry.ts` consumers with OTel calls (where consumers live in code that survives the migration) | various |
| E6 | Document OTLP target in runbook | `tools/autonomous-factory/docs/temporal-migration/06-observability.md` |

Group F — Reporting

| # | Task | Files |
|---|---|---|
| F1 | Reporting layer pulls workflow state via Temporal client `describe` + queries | `src/temporal/reporting/` (new dir) |
| F2 | `_trans.md` regenerated on demand from query snapshot (or deprecated entirely if Temporal Web UI suffices) | `src/temporal/reporting/trans-md.ts` |
| F3 | Cost summary projection from workflow event history + activity OTel spans | `src/temporal/reporting/cost.ts` |
| F4 | Flight data projection — currently per-feature, now per-workflow-execution | `src/temporal/reporting/flight-data.ts` |

Group G — Admin CLI

| # | Task | Files |
|---|---|---|
| G1 | Inventory legacy CLI verbs (run `npm run pipeline:--help` and document each) | doc |
| G2 | New CLI: `tools/autonomous-factory/src/temporal/cli/pipeline.ts` with verb→Temporal-client mapping | new |
| G3 | `pipeline:status` → `temporal workflow describe` + query `state` | same |
| G4 | `pipeline:next` → query `nextBatch` | same |
| G5 | `pipeline:resume` → signal `resume` | same |
| G6 | `pipeline:reset-scripts` → signal `resetScripts` | same |
| G7 | `pipeline:recover-elevated` → signal `resumeElevated` | same |
| G8 | `pipeline:approve` (new) → signal `approve` | same |
| G9 | `pipeline:hold` / `pipeline:cancel` (new) → signals | same |
| G10 | `pipeline:lint` (workflows.yml validation) — reuses existing logic | same |
| G11 | New npm scripts: `pipeline:*:temporal` aliases (legacy `pipeline:*` still works against legacy state) | `package.json` |

Group H — Lifecycle migration

| # | Task | Files |
|---|---|---|
| H1 | `lifecycle/preflight.ts` — invoked client-side before `client.workflow.start()` | adapt; no longer in workflow scope |
| H2 | `lifecycle/auto-skip.ts` — moves to workflow code; runs at node-ready time | adapt to deterministic shape |
| H3 | `lifecycle/archive.ts` — becomes a final activity invoked at workflow end | `src/temporal/activities/archive.activity.ts` |
| H4 | `lifecycle/hooks.ts` — invoked from activities (already abstracted via `HookExecutor` port) | minimal changes |

Group I — New entry points

| # | Task | Files |
|---|---|---|
| I1 | New `agent:run:temporal` script — APM compile + workflow start via Temporal client | `src/temporal/client/run-feature.ts` |
| I2 | Worker entry point with full activity registry | `src/temporal/worker/main.ts` (final form) |
| I3 | Document new operating commands | `tools/autonomous-factory/docs/temporal-migration/07-operating-commands.md` |

---

## Files Affected

**Created:**
- `src/temporal/workflow/pipeline.workflow.ts`
- `src/temporal/workflow/queries.ts`
- `src/temporal/workflow/handlers.ts`
- `src/temporal/workflow/activity-proxies.ts`
- `src/temporal/telemetry/otel-init.ts`
- `src/temporal/reporting/` (new dir, ~4 files)
- `src/temporal/cli/pipeline.ts`
- `src/temporal/client/run-feature.ts`
- `src/temporal/activities/archive.activity.ts`
- `tools/autonomous-factory/test-fixtures/temporal-reference-feature/`
- 2 design docs (`06-observability.md`, `07-operating-commands.md`)

**Modified:**
- `src/temporal/worker/main.ts` — final activity + workflow registration
- `src/temporal/workflow/dag-state.ts` — any final wiring discovered during workflow build
- `tools/autonomous-factory/package.json` — OTel deps + new scripts
- `tools/autonomous-factory/src/temporal/workflow/signals.ts` — finalised from Session 3 stub

**Untouched (read-only — die in Session 5):**
- `src/kernel/`
- `src/loop/`
- `src/handlers/`
- `src/cli/pipeline-state.ts`
- `src/entry/main.ts`, `watchdog.ts`, `supervise.ts`
- `src/adapters/json-file-state-store.ts`, `subprocess-feature-runner.ts`
- `src/adapters/jsonl-telemetry.ts`

---

## Test Strategy

1. **Workflow unit tests** — `TestWorkflowEnvironment` covers loop, signals, queries, triage cycle, cycle budget exhaustion, continue-as-new
2. **Activity proxy tests** — verify proxies dispatch with correct timeout/retry options
3. **PR equivalence test** — reference feature on legacy vs Temporal produces byte-identical PR
4. **Crash recovery test** — kill worker mid-feature, restart, complete; final PR identical
5. **Approval flow test** — full flow including SLA timeout + manual signal
6. **Triage cycle test** — induce a failure, verify triage activity routes correctly, redev cycle increments
7. **OTel smoke test** — spans flow to chosen backend; verify trace shape
8. **CLI feature parity test** — every legacy verb has a Temporal-based equivalent that produces semantically identical output
9. **Legacy regression** — full existing test suite green throughout

---

## Exit Criteria

- [ ] `pipelineWorkflow` runs the reference feature end-to-end on local + CI + non-prod Temporal
- [ ] PR equivalence proof: legacy and Temporal paths produce byte-identical PR for reference feature
- [ ] Crash recovery test passes (worker kill mid-feature)
- [ ] All signals/queries proven via `TestWorkflowEnvironment`
- [ ] OTel traces visible in chosen backend
- [ ] Admin CLI inventory complete; every verb has a Temporal-based replacement
- [ ] Reporting layer reads from Temporal; `_trans.md` projection optional or removed
- [ ] Workflow code passes determinism ESLint rule
- [ ] No file under `src/kernel/`, `src/loop/`, `src/handlers/`, `src/cli/pipeline-state.ts` modified
- [ ] Legacy `npm run agent:run` still works (smoke-tested at end of session)
- [ ] Both paths documented in [.github/AGENTIC-WORKFLOW.md](../../../../.github/AGENTIC-WORKFLOW.md)

---

## Rollback Plan

Still reversible. Both paths are functional. To roll back:

1. Revert PRs in reverse order
2. Tear down OTel exporter (no data loss — was never the only telemetry path)
3. Resume legacy CLI usage

The Temporal workflow + activities remain in code but unused.

---

## Estimated Effort

- Phase 5 (workflow body): 5–7 days
- Phase 6 (periphery): 4–6 days
- **Session total: 9–13 working days**

Phase 5 is the cognitively hard work. Phase 6 is mostly mechanical. They can run partly in parallel by two engineers (Phase 6's OTel + reporting can start once Phase 5's workflow body is roughly drafted).

---

## Hand-off to Session 5

When this session exits, the next Planning Agent receives:

- A fully functional Temporal-based pipeline producing legacy-equivalent PRs
- OpenTelemetry observability surface live
- Admin CLI rewritten as Temporal client
- Both legacy and Temporal paths green in CI
- Confidence (via PR equivalence + crash recovery proofs) that legacy is now redundant

Session 5 begins with: "Soak-test for one week, then delete the legacy kernel/loop/state-store and harden for production."
