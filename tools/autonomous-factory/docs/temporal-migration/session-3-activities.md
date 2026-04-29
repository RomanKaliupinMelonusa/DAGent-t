# Session 3 — Activities Port

> Phase 4. **Reversible.** Each `NodeHandler` is rewritten as a Temporal activity. Legacy handlers remain in place.

---

## Session Goal

Port all five handlers (`local-exec`, `github-ci-poll`, `triage`, `approval`, `copilot-agent`) to Temporal activities under `src/temporal/activities/`. Each activity must produce identical artifacts to its legacy handler given identical inputs. The `approval` handler is **replaced**, not ported — it becomes a workflow signal pattern. At end of session: a small reference workflow can dispatch each activity type and produce a real PR-grade artifact.

---

## Phases Included

- **Phase 4 — Convert Handlers to Activities** (sub-phases 4a–4e)

This is the largest single session. Recommended split: 4a–4d in the first half, 4e (`copilot-agent`) in the second half.

---

## Pre-flight Checks

- [ ] Session 2 exit criteria all met
- [ ] `DagState` class proven via parity tests
- [ ] Skeleton workflow runs on local + CI Temporal
- [ ] Legacy `npm run agent:run` still works on a reference feature
- [ ] No open PRs touching `src/handlers/`, `src/harness/`, `src/ports/`, `src/adapters/`

---

## Planning Agent Prompt

```
You are the Planning Agent for Session 3 of the Temporal migration. Your charter:

1. Port handlers to Temporal activities, in this order:
   4a. local-exec (simplest)
   4b. github-ci-poll (heartbeat-based polling)
   4c. approval (replace pattern entirely with Temporal Signals)
   4d. triage (LLM activity)
   4e. copilot-agent (long-running, hardest)

2. Each activity must:
   - Live under src/temporal/activities/
   - Accept NodeContext and APM compiled config as input
   - Return NodeResult (same shape as legacy handler return)
   - Use ports/adapters internally (those are kept as-is)
   - Emit OpenTelemetry spans + structured logs (escape activity boundary)
   - Configure RetryPolicy.maximumAttempts: 1 for non-deterministic LLM activities
     (workflow-level redev cycle handles retry)

3. Build a small "reference activity dispatch" workflow that exercises each activity
   in isolation. Full workflow body comes in Session 4.

Invariants:
- src/handlers/ is read-only this session.
- Legacy `npm run agent:run` must continue to work.
- Each activity produces artifacts byte-identical to its legacy handler counterpart
  for the reference feature inputs (verified by snapshot diff).
- Cognitive circuit breaker stays activity-local; do NOT lift counters into workflow state.

Reference docs:
- 00-spec.md (Mapping table — handler rows)
- src/handlers/README.md
- src/handlers/types.ts
- session-3-activities.md (this file)

Stop and request human review if:
- copilot-agent activity cannot heartbeat reliably from inside an active LLM session.
- Streaming tool-call telemetry cannot be coerced through OTel without rewriting harness.
- Snapshot diffs reveal non-trivial behaviour drift between legacy and new path.

Exit gate: all exit criteria below pass.
```

---

## Sub-Phase 4a — `local-exec` Activity

**Effort: 1–2 days**

The simplest port. Pattern reference for all subsequent activities.

### Tasks
| # | Task | Files |
|---|---|---|
| 4a.1 | Create `src/temporal/activities/local-exec.activity.ts` | new |
| 4a.2 | Activity signature: `(ctx: NodeContext, apm: CompiledApm) => Promise<NodeResult>` | same |
| 4a.3 | Wire to existing `Shell` and `HookExecutor` ports unchanged | same |
| 4a.4 | Configure activity options: `startToCloseTimeout: '15m'`, no automatic retry | same |
| 4a.5 | Snapshot test: feed reference `push-app` input; assert output matches legacy handler byte-for-byte | `src/temporal/activities/__tests__/local-exec.test.ts` |

---

## Sub-Phase 4b — `github-ci-poll` Activity

**Effort: 2–3 days**

Replace the legacy polling loop with Temporal heartbeats.

### Tasks
| # | Task | Files |
|---|---|---|
| 4b.1 | Create `src/temporal/activities/github-ci-poll.activity.ts` | new |
| 4b.2 | Internal poll loop with `Context.current().heartbeat({ runStatus, lastSha })` every 30s | same |
| 4b.3 | Wire to `CiGateway` and `VersionControl` ports unchanged | same |
| 4b.4 | Activity options: `startToCloseTimeout: '2h'`, `heartbeatTimeout: '90s'` | same |
| 4b.5 | RetryPolicy: `maximumAttempts: 3` for transient gh CLI failures (network, rate limits) | same |
| 4b.6 | Snapshot test against captured CI fixtures | `src/temporal/activities/__tests__/github-ci-poll.test.ts` |

---

## Sub-Phase 4c — `approval` (Replace, Not Port)

**Effort: 1–2 days**

This is **not a 1:1 port**. Approval becomes a workflow-level signal pattern.

### Tasks
| # | Task | Files |
|---|---|---|
| 4c.1 | Define signal: `defineSignal('approve')`, `defineSignal('reject')` | `src/temporal/workflow/signals.ts` |
| 4c.2 | Define query: `defineQuery('approvalStatus')` | same |
| 4c.3 | Add `markApprovalReceived/Rejected` methods to `DagState` (already stubbed in Session 2) | `src/temporal/workflow/dag-state.ts` |
| 4c.4 | Add helper `awaitApproval(timeout)` using `Workflow.condition()` + `Workflow.sleep()` | `src/temporal/workflow/approval-pattern.ts` |
| 4c.5 | Document the new admin-side flow: `temporal workflow signal --workflow-id=<slug> --name=approve` | `tools/autonomous-factory/docs/temporal-migration/03-approval-pattern.md` |
| 4c.6 | Replace ChatOps `dagent-chatops.yml` flow design (don't implement yet — Session 4) | doc-only |
| 4c.7 | Unit test the `awaitApproval` helper using `TestWorkflowEnvironment` | `src/temporal/workflow/__tests__/approval-pattern.test.ts` |

**Note:** The legacy `approval` handler can be deleted in Session 5. For Session 3, leave it in place.

---

## Sub-Phase 4d — `triage` Activity

**Effort: 2–3 days**

Wrap the existing triage classifier in a Temporal activity.

### Tasks
| # | Task | Files |
|---|---|---|
| 4d.1 | Create `src/temporal/activities/triage.activity.ts` | new |
| 4d.2 | Activity wraps existing `src/triage/` retriever + classifier + handoff-builder | same |
| 4d.3 | Input: failure record + workflow YAML; Output: `DagCommand[]` (reset-nodes, etc.) | same |
| 4d.4 | Wire to `TriageLlm`, `TriageArtifactLoader`, `BaselineLoader` ports unchanged | same |
| 4d.5 | Activity options: `startToCloseTimeout: '5m'` (LLM round-trip) | same |
| 4d.6 | RetryPolicy: `maximumAttempts: 2` (LLM transient failure) | same |
| 4d.7 | Emit triage decision as OTel span with classification + cycle index | same |
| 4d.8 | Snapshot test against captured failure fixtures | `src/temporal/activities/__tests__/triage.test.ts` |

---

## Sub-Phase 4e — `copilot-agent` Activity (HARDEST)

**Effort: 4–5 days**

The LLM session activity. Several non-trivial design decisions.

### Design decisions

| Decision | Resolution |
|---|---|
| Activity duration | `startToCloseTimeout: '4h'`; heartbeat every 30s |
| Auto-retry on failure | `RetryPolicy.maximumAttempts: 1` — never auto-retry; workflow's redev cycle decides |
| Streaming telemetry | OTel spans + JSONL logs from inside activity; Temporal records only final `NodeResult` |
| Tool-call events | Emit via existing `InvocationLogger` port; don't try to stream through Temporal |
| Cognitive circuit breaker | Activity-local; resets if activity is replayed (acceptable per R8 in 00-spec.md) |
| Cancellation | Listen for cancellation signal; gracefully terminate Copilot session |
| Worker crash mid-session | Loss of in-flight session is acceptable; workflow sees activity failure → triage |

### Tasks

| # | Task | Files |
|---|---|---|
| 4e.1 | Create `src/temporal/activities/copilot-agent.activity.ts` | new |
| 4e.2 | Wrap existing `CopilotSessionRunner` adapter unchanged | same |
| 4e.3 | Implement heartbeat loop — emit progress every 30s with current tool-call count | same |
| 4e.4 | Wire `ContextCompiler`, `CognitiveBreaker`, `ArtifactBus`, `InvocationLogger` ports unchanged | same |
| 4e.5 | Honor cancellation: if `Context.current().cancellationSignal` fires, abort session cleanly and emit partial artifacts | same |
| 4e.6 | Activity options as above | same |
| 4e.7 | OTel instrumentation for tool calls (lightweight — full streaming stays in JSONL) | same |
| 4e.8 | Reference test: run `backend-dev` activity against a sandbox feature; verify produces artifacts match legacy | `src/temporal/activities/__tests__/copilot-agent.integration.test.ts` |
| 4e.9 | Stress test: kill worker mid-activity; verify workflow sees ApplicationFailure + advances to triage | `src/temporal/activities/__tests__/copilot-agent.crash.test.ts` |
| 4e.10 | Document the "harness in activity" pattern — RBAC / shell guards / outcome tool unchanged but invoked from activity context | `tools/autonomous-factory/docs/temporal-migration/04-copilot-activity-design.md` |

---

## Reference Activity Dispatch Workflow

After all five sub-phases complete, build a minimal workflow that dispatches each activity in isolation:

| # | Task | Files |
|---|---|---|
| RD1 | Workflow that takes `{activityKey, nodeContext}` and dispatches that activity once | `src/temporal/workflow/single-activity.workflow.ts` |
| RD2 | CLI command `npm run temporal:dispatch -- --activity=local-exec --slug=<slug>` for manual smoke testing | `src/temporal/client/dispatch-single.ts` |
| RD3 | End-to-end snapshot test: dispatch each activity type against a reference fixture; assert artifacts match legacy | `src/temporal/__tests__/activities-e2e.test.ts` |

This proves all five activities are callable from a workflow context before Session 4 builds the full orchestration loop.

---

## Files Affected

**Created:**
- `tools/autonomous-factory/src/temporal/activities/local-exec.activity.ts`
- `tools/autonomous-factory/src/temporal/activities/github-ci-poll.activity.ts`
- `tools/autonomous-factory/src/temporal/activities/triage.activity.ts`
- `tools/autonomous-factory/src/temporal/activities/copilot-agent.activity.ts`
- `tools/autonomous-factory/src/temporal/activities/index.ts` (registry)
- `tools/autonomous-factory/src/temporal/activities/__tests__/` (5 test files)
- `tools/autonomous-factory/src/temporal/workflow/signals.ts`
- `tools/autonomous-factory/src/temporal/workflow/approval-pattern.ts`
- `tools/autonomous-factory/src/temporal/workflow/single-activity.workflow.ts`
- `tools/autonomous-factory/src/temporal/client/dispatch-single.ts`
- 3 design docs: `03-approval-pattern.md`, `04-copilot-activity-design.md`, `05-activity-registry.md`

**Modified:**
- `tools/autonomous-factory/src/temporal/worker/main.ts` — register all 4 activities + 2 workflows
- `tools/autonomous-factory/package.json` — add `temporal:dispatch` script
- `tools/autonomous-factory/src/temporal/workflow/dag-state.ts` — finalize approval methods (already stubbed in Session 2)

**Untouched (read-only):**
- `src/handlers/` — entire directory
- `src/harness/`, `src/ports/`, `src/adapters/`
- Legacy kernel, loop, domain

---

## Test Strategy

1. **Per-activity unit tests** — using `MockActivityEnvironment` from Temporal SDK
2. **Per-activity snapshot tests** — fed identical inputs to legacy handler + new activity; deep-diff outputs
3. **Integration tests** — each activity dispatched via `single-activity.workflow.ts` against ephemeral Temporal in CI
4. **Crash test** for `copilot-agent` — kill worker mid-activity; verify clean workflow failure
5. **Approval flow test** — workflow blocks; signal arrives; workflow unblocks
6. **Regression** — legacy `npm run agent:run` still produces identical PR

---

## Exit Criteria

- [ ] All five activities implemented
- [ ] Each activity passes snapshot diff against its legacy handler counterpart
- [ ] Reference single-activity workflow dispatches each type successfully
- [ ] Approval signal pattern proven via `TestWorkflowEnvironment`
- [ ] `copilot-agent` heartbeats reliably for at least one full reference session (≥10 minutes)
- [ ] `copilot-agent` crash test passes (worker killed → workflow sees failure cleanly)
- [ ] OTel spans visible in chosen backend for each activity type
- [ ] No file under `src/handlers/` modified
- [ ] Legacy `npm run agent:run` still works
- [ ] Documentation: 3 design docs merged

---

## Rollback Plan

Still reversible: revert PRs, legacy handlers remain functional. The new activity files exist alongside the old, neither path was deleted.

---

## Estimated Effort

- 4a (`local-exec`): 1–2 days
- 4b (`github-ci-poll`): 2–3 days
- 4c (`approval` replacement): 1–2 days
- 4d (`triage`): 2–3 days
- 4e (`copilot-agent`): 4–5 days
- Reference workflow + e2e tests: 1–2 days
- **Session total: 11–17 working days** (call it 12–14)

This is the longest session. Consider splitting into Session 3a (sub-phases 4a–4d) and Session 3b (sub-phase 4e + reference workflow) if a single Planning Agent supervision window is too long. The doc structure is identical either way.

---

## Hand-off to Session 4

When this session exits, the next Planning Agent receives:

- Five working Temporal activities producing legacy-equivalent artifacts
- Approval signal pattern proven
- A reference workflow capable of dispatching each activity type
- Heartbeat + cancellation patterns established for long-running LLM sessions

Session 4 begins with: "Build the full pipeline workflow body — DAG loop, signals, queries, triage cycle. Then replace telemetry with OpenTelemetry and rewrite the admin CLI as a Temporal client."
