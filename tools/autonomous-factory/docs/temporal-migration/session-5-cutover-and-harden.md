# Session 5 — Cutover & Hardening

> Phases 7 and 8. **IRREVERSIBLE.** Legacy kernel/loop/state-store deleted. Production-grade hardening lands.

---

## Session Goal

After a one-week soak test of Session 4's Temporal path, delete the legacy `PipelineKernel`, pipeline loop, JSON state store, and subprocess runner. Migrate any in-flight features. Land workflow versioning, multi-tenancy, replay testing, and disaster-recovery infrastructure. At end of session: Temporal is the only orchestration path; the system is partner-ready.

---

## Phases Included

- **Phase 7 — Cutover & Legacy Decommission**
- **Phase 8 — Hardening & Production Readiness**

---

## Phase 0 — Session 4 Pre-flight Closure (BLOCKERS)

The Session 4 doc lists these as soft gates; in this revision they are hard
blockers — Session 5 cannot start with any open. Each maps to a known stub or
deferral in the as-built code (`pipeline.workflow.ts` self-documents most of
these in its scope-notes header; the rest come from the Session 3 status
memo).

| # | Gate | Evidence required |
|---|---|---|
| P1 | Triage cascade no longer stubbed in `pipeline.workflow.ts` (currently records-but-does-not-route) | Workflow change + integration test that induces a `triage`-decorated failure and asserts the failed node reroutes |
| P2 | Continue-as-new at >8K events with a state-rehydration helper | Workflow change + replay test against a synthesized 8K-event history <br/>**Status (2026-04-30):** WIRED. `DagState.fromSnapshot()` rehydrates dynamic flags (held / cancelled / cancelReason / batchNumber / cycleCounters / approvals) that `fromState` would lose; `pipelineWorkflow` checks `workflowInfo().historyLength >= continueAsNewHistoryThreshold` (default 8000) at the top of each iteration and calls `continueAsNew` with `priorSnapshot` + `priorAttemptCounts` carried forward. Pending approvals block CAN to keep buffered signals stable. 7 round-trip tests in [dag-state.from-snapshot.test.ts](../../src/temporal/workflow/__tests__/dag-state.from-snapshot.test.ts). Full replay test against a synthesized 8K-event history still requires a Temporal cluster — covered by the integration suite, not unit tests.
| P3 | Cycle-budget exhaustion path verified end-to-end (`DagState.cycleBudgetExceeded()` is currently a no-op until reducers stamp `errorLog` entries) | Failing-feature integration test that exhausts the budget and asserts `{status: "halted", reason: "redev-cycle-limit"}` <br/>**Status (2026-04-30):** mechanism verified at the workflow-body level by [src/temporal/workflow/__tests__/cycle-budget.test.ts](../../src/temporal/workflow/__tests__/cycle-budget.test.ts) (5 tests; `applyTriageCommand` exported for testability; stale scope-note in `pipeline.workflow.ts` corrected). Full feature-level integration test still pending. |
| P4 | Admin CLI parity gap closed: `init`, `reset-scripts`, `recover-elevated`, `redevelop-infra` all map to signals (deferred from S4 by D-S4-4) | `src/temporal/client/admin.ts` extension + per-verb tests <br/>**Status (2026-04-30):** mutate-and-return verbs LANDED via Temporal **Updates** (not signals — Updates are the right primitive for "send command + get reducer result back"). New surface: [src/temporal/workflow/updates.ts](../../src/temporal/workflow/updates.ts) (3 update defs), `setHandler` wired in `pipeline.workflow.ts`, [src/temporal/client/admin.ts](../../src/temporal/client/admin.ts) gains `reset-scripts`, `resume-after-elevated`, `recover-elevated` verbs (exit code 2 on `halted=true` for shell-pipeline parity with legacy CLI), parser extracted to [admin-parse.ts](../../src/temporal/client/admin-parse.ts) for testability. 22 new tests (4 update-wire, 18 CLI parser). `init` is intentionally NOT a signal/update — workflow start (`agent:run`) is the Temporal-native equivalent. `recover-dangling` is N/A under Temporal (heartbeats + start-to-close timeouts). `redevelop-infra` not present in legacy CLI either; the doc reference is speculative. |
| P5 | OTel-emitting `PipelineLogger` adapter wired in worker bootstrap (replaces `NoopPipelineLogger`) | Adapter + smoke test against an OTLP collector <br/>**Status (2026-04-30):** LANDED. New adapter [src/temporal/telemetry/otel-pipeline-logger.ts](../../src/temporal/telemetry/otel-pipeline-logger.ts) implements `PipelineLogger` by emitting each `event(...)` as a span event on the active activity span (the span the `OpenTelemetryPlugin` opens per activity execution). `blob(...)` becomes a `blob:<label>` span event truncated at 8 KB. Worker bootstrap wires it via [logger-factory.ts](../../src/temporal/telemetry/logger-factory.ts) DI slot when `OTLP_ENDPOINT` is set; `buildNodeContext` consults the factory and falls back to `NoopPipelineLogger` when absent (preserves CI activity-smoke behaviour). 12 unit tests in [__tests__/otel-pipeline-logger.test.ts](../../src/temporal/telemetry/__tests__/otel-pipeline-logger.test.ts). Live OTLP-collector smoke test belongs to the soak window — emits to Tempo and asserts span events arrive.
| P6 | Production worker DI wired: `setTriageDependencies` + `setCopilotAgentDependencies` called at worker startup with real `TriageLlm` (Anthropic) + `CopilotSessionRunner` adapters | Worker bootstrap diff + integration test exercising the live SDK <br/>**Status (2026-04-30):** WIRED in [src/temporal/worker/main.ts](../../src/temporal/worker/main.ts) `wireActivityDependencies()`: gates on `APP_ROOT` + `WORKER_DISABLE_LLM`, lazily imports `CopilotClient` + `CopilotTriageLlm` + `NodeCopilotSessionRunner`, calls both setters before `worker.run()`. Live-SDK integration test runs in `temporal-it.yml` against a real Temporal cluster + Copilot SDK; not reproducible in unit-test scope.
| P7 | PR equivalence proof committed: reference feature on legacy → byte-identical PR on Temporal | Snapshot fixture + CI test |

If any P-gate is open, Session 5 cannot start. Each P-gate ships as its own
PR against `main` during the soak window.

---

## Pre-flight Checks — Mandatory soak window

Before Session 5 task work begins, ALL of the following must hold. The soak
gate is concrete and numeric, not subjective.

### Hard gates (sign-offable)

- [ ] Phase 0 P1–P7 all closed (PRs merged on `main`)
- [ ] Session 4 exit criteria all met
- [ ] **Soak window**: ≥7 calendar days during which:
  - [ ] ≥10 distinct features completed on Temporal
  - [ ] 100% PR-byte-equivalence for any feature also replayed on legacy (sample of ≥3 random features)
  - [ ] 0 unrecovered worker-restart-induced state losses
  - [ ] ≤1 production OTel-dashboard gap incident, fully RCA'd
- [ ] Crash-recovery test passes against production Temporal cluster
- [ ] Admin CLI feature parity confirmed by operations sign-off (every legacy `pipeline:*` verb has a `dagent` admin equivalent)
- [ ] Every legacy operational runbook has a Temporal equivalent merged
- [ ] All in-flight features on legacy path drained (see Phase 7 Group A)
- [ ] Disaster recovery runbook drafted (full drill is Phase 8 Group J)
- [ ] **ajv-shim survival check**: fresh `npm ci && npm run lint && npm run temporal:build` is clean (proves `scripts/postinstall-ajv-shim.mjs` is reproducible — see D5-5)
- [ ] Final go/no-go meeting held with engineering + operations; minutes archived

**This is the irreversible step.** Do not begin Phase 7 task work without all checkboxes.

---

## Planning Agent Prompt

```
You are the Planning Agent for Session 5 of the Temporal migration. This is the
IRREVERSIBLE cutover session. Treat all destructive operations with extreme care.

Your charter:

Phase 7 — Cutover:
1. Verify pre-flight soak-test gate is fully passed (mandatory).
2. Coordinate drain of any remaining legacy in-flight features.
3. Delete legacy kernel, loop, state-store, subprocess runner, old CLI.
4. Renumber documentation, update Documentation Map.
5. Verify zero references remain to deleted symbols.

Phase 8 — Hardening:
6. Workflow versioning policy + patched() guidance.
7. Multi-tenancy: namespaces, workflow ID prefixing, task queue isolation.
8. Replay testing in CI from captured production histories.
9. Worker fleet: Dockerfile, health checks, graceful shutdown, autoscaling.
10. Disaster recovery: full DR drill end-to-end.

Invariants:
- Do NOT delete legacy code until in-flight features are drained.
- Each delete is a separate PR with explicit reviewer sign-off.
- After cutover, every commit must run replay tests against captured histories.
- DR drill must succeed end-to-end before "production ready" is declared.

Reference docs:
- 00-spec.md (full mapping table)
- All prior session docs
- session-5-cutover-and-harden.md (this file)

Stop and request human review if:
- Soak-week showed any regression vs legacy.
- A legacy in-flight feature cannot be cleanly drained.
- DR drill reveals unrecoverable data loss path.
- Replay tests fail on captured production histories.

Exit gate: all exit criteria below pass. Production-readiness sign-off required.
```

---

## Phase 7 Tasks — Cutover

Group A — Drain in-flight features

| # | Task | Owner | Notes |
|---|---|---|---|
| A1 | Inventory features currently running on legacy path | Operations | List of slugs + their state |
| A2 | For each in-flight feature: either let it complete on legacy, or replay equivalent on Temporal | Operations | No mid-flight migration of a single feature |
| A3 | Lock new feature starts to Temporal-only path | Engineering | Update `agent:run` script |
| A4 | Confirm zero in-flight features on legacy path before deletion | Operations | Sign-off in PR description |

Group B — Deletion (each is a separate PR, sequential, reviewable)

> **Correctness note (corrected from original Session 5 draft):** The original
> draft proposed deleting `src/handlers/` wholesale. That would break the
> Temporal path: activities still wrap legacy handler bodies through
> `runActivityChain` and import the entire `src/handlers/middlewares/**` tree
> via `src/temporal/activities/middleware-chain.ts`. The corrected delete
> inventory below preserves those modules — see the **do-not-delete
> allowlist** at the end of this group.

| PR | Files deleted | Verification |
|---|---|---|
| PR-1 | `src/kernel/` (entire) | `git grep -E "PipelineKernel\|KernelRules\|ProcessResult\|KernelCommand" src/` returns zero outside `kernel/` itself before deletion |
| PR-2 | `src/loop/` (entire) | `git grep -E "pipeline-loop\|signal-handler" src/` returns zero |
| PR-3 | `src/adapters/json-file-state-store.ts`, `src/adapters/file-state/`, `src/ports/state-store.ts` | `git grep -E "JsonFileStateStore\|ports/state-store" src/` returns zero (Postgres + Temporal history own state) |
| PR-4 | `src/adapters/subprocess-feature-runner.ts`, `src/entry/supervise.ts`, `src/entry/supervisor.ts` | `git grep -E "subprocess-feature\|supervise" src/` returns zero (multiple workflow executions replace subprocess multiplexing) |
| PR-5 | `src/cli/pipeline-state.ts` + legacy `pipeline:*` npm script entries | `git grep "pipeline-state\.ts" .` returns zero (`src/temporal/client/admin.ts` is the new surface; requires P4 closed) |
| PR-6 | `src/entry/main.ts`, `src/entry/watchdog.ts`, legacy paths in `src/entry/bootstrap.ts` | `npm run agent:run` continues to work — `scripts/run-agent.sh` becomes a thin wrapper invoking `node dist/temporal/client/run-feature.js` (see D5-4) |
| PR-7 | `src/handlers/approval.ts` **only** | All other handler files survive (activities still wrap them). `git grep "handlers/approval" src/` returns zero |
| PR-8 | `src/adapters/jsonl-telemetry.ts` and its consumers | `git grep "jsonl-telemetry" src/` returns zero (OTel is the only telemetry path) |
| PR-9 | `src/domain/dangling-invocations.ts`, `src/domain/stall-detection.ts`, `src/domain/approval-sla.ts` | `git grep -E "dangling-invocations\|stall-detection\|approval-sla" src/` returns zero (replaced by Temporal heartbeats / start-to-close timeouts / signal+sleep races) |
| PR-10 | Legacy state-store-reading projections under `src/reporting/` (keep Temporal-query-based projections under `src/temporal/reporting/`) | Compile + `npm test` green; new reporting only reads from Temporal queries |
| PR-11 | Dead handler/middleware barrels and helper modules that re-export legacy `pipeline-loop` integration only | Identified by `git grep` after PRs 1–2 land; per-file justification in PR description |

### Do-not-delete allowlist (lint-enforced before every Group B PR merge)

A CI check (`scripts/check-do-not-delete.mjs`, lands as part of PR-1) asserts
that each path below still exists at HEAD. The check fails the build if any
entry is removed; bypass requires an ADR amendment.

- `src/handlers/middleware.ts` (the source — `.js` lives only in `dist/` after build)
- `src/handlers/middlewares/**` (entire)
- `src/handlers/local-exec.ts`
- `src/handlers/github-ci-poll.ts`
- `src/handlers/copilot-agent.ts`
- `src/handlers/triage-handler.ts`
- `src/handlers/types.ts` and shared support modules
- `src/apm/**`
- `src/triage/**`
- `src/harness/**`
- `src/lifecycle/**`
- `src/reporting/**` *except* legacy state-store-reading projections explicitly named in PR-10
- All `src/ports/**` *except* `state-store.ts`
- All `src/adapters/**` *except* `json-file-state-store.ts`, `file-state/`, `subprocess-feature-runner.ts`, `jsonl-telemetry.ts`

Group C — Documentation overhaul

| # | Task | Files |
|---|---|---|
| C1 | Update `tools/autonomous-factory/README.md` — remove "Layer Stack" mermaid diagram references to deleted layers; rewrite to reflect Temporal-based architecture | `tools/autonomous-factory/README.md` |
| C2 | Delete obsolete layer READMEs: `src/kernel/README.md`, `src/loop/README.md`, `src/cli/README.md` | (deletion) |
| C3 | Update `.github/copilot-instructions.md` Documentation Map — remove deleted entries, add Temporal entries | `.github/copilot-instructions.md` |
| C4 | Rewrite `docs/04-state-machine.md` to describe the Temporal-based model | `tools/autonomous-factory/docs/04-state-machine.md` |
| C5 | Update `docs/01-watchdog.md` to describe the new worker-based topology | same |
| C6 | Final architecture diagram for partner-facing pitch (clean, simple, reflects current reality) | `tools/autonomous-factory/docs/architecture-overview.md` |

Group D — In-flight migration

| # | Task | Files |
|---|---|---|
| D1 | Delete `npm run agent:run:detached` legacy fallback (Temporal handles durability natively) | `scripts/run-agent.sh`, `package.json` |
| D2 | `scripts/run-agent.sh` becomes a thin shell wrapper invoking `node dist/temporal/client/run-feature.js`, preserving the existing CLI surface (`--app`, `--workflow`, `--spec-file`, `--base-branch`) — operations muscle memory unchanged (D5-4) | `scripts/run-agent.sh` |
| D3 | Update `scripts/reset-dagent.sh` to issue Temporal `workflow terminate` calls instead of state-file deletion | `scripts/reset-dagent.sh` |
| D4 | Update `.github/workflows/agentic-feature.yml` to invoke the new Temporal-based `agent:run` | workflow file |
| D5 | Verify `scripts/postinstall-ajv-shim.mjs` runs in production worker container build (`Dockerfile.worker` must NOT use `--ignore-scripts`); add a CI test that builds the image and boots the worker (D5-5) | `Dockerfile.worker`, `.github/workflows/temporal-it.yml` |

---

## Phase 8 Tasks — Hardening

Group E — Workflow versioning

| # | Task | Files |
|---|---|---|
| E1 | Establish version naming convention: `pipelineWorkflow.v1`, `.v2`, etc. | `src/temporal/workflow/pipeline.workflow.ts` (exports versioned) |
| E2 | Document `patched()` usage policy: every behavioural change in workflow code uses `patched(<patchId>)` | `tools/autonomous-factory/docs/temporal-migration/08-versioning-policy.md` |
| E3 | CI lint rule: workflow code changes require an associated patched ID or version bump | tooling |
| E4 | Test: deploy a v1 workflow, modify it with a patch, verify in-flight v1 executions complete safely | `src/temporal/__tests__/versioning.test.ts` |

Group F — Multi-tenancy

| # | Task | Files |
|---|---|---|
| F1 | Decision: namespace-per-tenant vs prefix-based isolation | doc |
| F2 | Workflow ID convention: `<tenant>/<app>/<slug>` | `src/temporal/client/run-feature.ts` |
| F3 | Task queue convention: `<tenant>-<priority>` (e.g. `acme-default`, `acme-high`) | worker config |
| F4 | Tenant-scoped worker fleet: `WORKER_TENANT=acme npm run temporal:worker` | `src/temporal/worker/main.ts` |
| F5 | RBAC sketch (auth-z hooks at workflow start) — design only; impl is out-of-scope ticket | doc |
| F6 | Add `SecretsProvider` port (genuinely missing today) with adapters for Vault, AWS SM, GCP SM, Azure KV — minimum two concrete adapters | `src/ports/secrets-provider.ts` + 2 adapters |

Group G — Replay testing

> **Correctness note (corrected from original Session 5 draft):** The original
> draft implied a `TestWorkflowEnvironment`-based runner. That API does NOT
> work in this workspace — Session 1's webpack/`tsx` resolution conflict (see
> the Session 1 status memo) breaks in-process worker bundling. The corrected
> approach uses `Worker.runReplayHistories(bundleOrPath, histories)`, the
> static replay API, against the **compiled** worker bundle in
> `dist/temporal/workflow/`. No in-process cluster needed; no devcontainer
> dependencies bundled.

| # | Task | Files |
|---|---|---|
| G1 | Capture production histories via `temporal workflow show --workflow-id <id> --output json`. Redact via Temporal's `data-converter` codec (see D5-6) before committing fixtures | `tools/autonomous-factory/test-fixtures/replay-histories/<slug>.history.json` |
| G2 | Replay runner: `npm run temporal:replay <pattern>` loads compiled bundle from `dist/temporal/workflow/` and calls `Worker.runReplayHistories(bundlePath, histories)`. Fails on `DeterminismViolationError`. NO `TestWorkflowEnvironment` dependency | `src/temporal/__tests__/replay/runner.ts` |
| G3 | CI integration: PR triggers on `src/temporal/workflow/**` change; runs the replay against all committed histories | `.github/workflows/temporal-replay.yml` |
| G4 | Documentation: how to capture, redact, and add new replay fixtures (including the "compiled-worker only" constraint) | `tools/autonomous-factory/docs/temporal-migration/09-replay-testing.md` |
| G5 | Seed corpus: ≥5 captured histories committed at session end (mix of happy path, triage cycle, approval gate, cancellation, cycle-budget halt) | as in G1 |

Group H — Worker fleet

| # | Task | Files |
|---|---|---|
| H1 | Dockerfile for worker. Base: same Node 22 as devcontainer. Build steps: `npm ci` (NOT `--ignore-scripts` — postinstall must run for ajv shim, see D5-5) → `npm run temporal:build` → CMD `node dist/temporal/worker/main.js` | `tools/autonomous-factory/Dockerfile.worker` |
| H2 | Health check endpoint (HTTP `/healthz`) — liveness probe must verify `Connection.connect()` succeeds before reporting healthy; readiness reports SDK connection + last poll | `src/temporal/worker/health.ts` |
| H3 | Graceful shutdown: drain in-flight activities, then exit | `src/temporal/worker/main.ts` |
| H4 | Helm chart for worker fleet | `infra/temporal/helm/worker/` |
| H5 | HPA policy: scale on Temporal task queue depth metric | `infra/temporal/helm/worker/templates/hpa.yaml` |
| H6 | Load test: 10 concurrent features, verify horizontal scaling triggers | `tools/autonomous-factory/scripts/load-test.sh` |
| H7 | Cold-build verification: fresh `docker build -f Dockerfile.worker .` from a clean cache → worker container boots and serves a hello workflow. Proves ajv-shim survives reproducible builds | CI job in `.github/workflows/temporal-it.yml` |

Group I — Observability

| # | Task | Files |
|---|---|---|
| I1 | Grafana dashboard JSON: workflow success rate, duration, retry rate, activity p95s, redev cycle distribution | `infra/observability/grafana/dagent-dashboard.json` |
| I2 | Alert rules: stuck workflows (>4h with no progress), high failure rate, worker fleet down | `infra/observability/prometheus/rules.yaml` |
| I3 | Runbook: on-call response for each alert | `tools/autonomous-factory/docs/temporal-migration/10-on-call-runbook.md` |

Group J — Disaster recovery

| # | Task | Files |
|---|---|---|
| J1 | Backup policy: Postgres PITR ≥ 7 days; weekly logical dump to cold storage | infra config + doc |
| J2 | DR runbook: restore Postgres → restart Temporal cluster → reconnect workers → verify in-flight workflows resume | `tools/autonomous-factory/docs/temporal-migration/11-dr-runbook.md` |
| J3 | **DR drill** — actually perform restore on staging. MUST include cold-restore verification of the ajv-shim and the worker compile step (rebuild image from scratch on the restored host). Document any deltas | drill report committed to docs |
| J4 | Tabletop exercise: full region failure response | doc |

---

## Files Affected

**Deleted (post-cutover) — corrected inventory:**
- `src/kernel/` (entire)
- `src/loop/` (entire)
- `src/handlers/approval.ts` (only — replaced by signal pattern; the rest of `src/handlers/` survives as activity-internal logic, see do-not-delete allowlist)
- `src/adapters/json-file-state-store.ts`, `src/adapters/file-state/`, `src/adapters/subprocess-feature-runner.ts`, `src/adapters/jsonl-telemetry.ts`
- `src/cli/pipeline-state.ts`
- `src/entry/main.ts`, `src/entry/watchdog.ts`, `src/entry/supervise.ts`, `src/entry/supervisor.ts` (legacy paths in `src/entry/bootstrap.ts` deleted; the file may survive in trimmed form if a Temporal-side caller still uses it)
- `src/ports/state-store.ts`
- `src/domain/dangling-invocations.ts`, `src/domain/stall-detection.ts`, `src/domain/approval-sla.ts`
- Legacy state-store-reading projections under `src/reporting/` (selective; non-state-store reporting kept)
- Several layer READMEs (`src/kernel/README.md`, `src/loop/README.md`, `src/cli/README.md`)

**Created:**
- `infra/temporal/helm/worker/` (entire)
- `infra/observability/` (Grafana + Prometheus configs)
- `tools/autonomous-factory/Dockerfile.worker`
- `src/temporal/__tests__/replay/`
- `src/temporal/worker/health.ts`
- `src/ports/secrets-provider.ts` + 2 adapters
- 4 hardening docs (versioning, replay, on-call, DR)
- 1 architecture overview doc

**Modified:**
- `tools/autonomous-factory/README.md` (significant rewrite)
- `.github/copilot-instructions.md` (Documentation Map cleanup)
- `tools/autonomous-factory/docs/04-state-machine.md` (rewrite)
- `tools/autonomous-factory/docs/01-watchdog.md` (rewrite)
- `.github/workflows/agentic-feature.yml`, `.github/workflows/temporal-replay.yml` (new)
- `.github/workflows/temporal-it.yml` (extend with Dockerfile-cold-build job, H7)
- `scripts/run-agent.sh` (becomes thin wrapper around `dist/temporal/client/run-feature.js`)
- `scripts/reset-dagent.sh` (Temporal `workflow terminate` instead of state-file delete)
- `scripts/check-do-not-delete.mjs` (new — guards the do-not-delete allowlist)

---

## Test Strategy

1. **Pre-cutover regression** — Sessions 1–4 test suites all green at start of session
2. **Per-deletion smoke** — after each PR in Group B, run full Temporal e2e suite to verify no accidental dependency
3. **Replay tests** — captured histories survive every workflow code change
4. **Versioning test** — v1 workflow + patched change + in-flight v1 completion
5. **DR drill** — full restore on staging, verify workflow resumption
6. **Load test** — 10 concurrent features; HPA fires; all complete
7. **Multi-tenancy isolation test** — two tenants' workflows cannot read each other's queries

---

## Exit Criteria

Before declaring "production-ready":

- [ ] All Phase 7 deletions complete; `git grep -E "PipelineKernel|JsonFileStateStore|pipeline-loop|subprocess-feature"` returns zero
- [ ] Do-not-delete allowlist check (`scripts/check-do-not-delete.mjs`) green on every PR
- [ ] Documentation map fully updated; no broken doc links
- [ ] Workflow versioning policy in place + tested
- [ ] Multi-tenancy: namespace/queue convention live; isolation test passes
- [ ] `SecretsProvider` port + 2 adapters merged
- [ ] Replay tests in CI via `Worker.runReplayHistories` against ≥5 captured histories
- [ ] Worker Dockerfile + Helm chart deployed to staging; cold-build (H7) green
- [ ] Load test (10 concurrent features) passes with HPA scaling
- [ ] Grafana dashboard live; alerts firing on staging tests
- [ ] DR drill performed and documented (incl. ajv-shim cold-restore verification)
- [ ] On-call runbook reviewed by operations
- [ ] Engineering + operations sign-off on production readiness

---

## Rollback Plan

**Phase 7 is irreversible.** Once `src/kernel/` and `src/loop/` are deleted, rollback means a multi-day re-port of the legacy code from git history.

**Mitigations:**
1. Tag the commit immediately before Phase 7 deletions (`pre-cutover-v1`).
2. Keep Phase 7 PRs sequential and individually revertable for the first 30 days.
3. Branch protect the cutover for 30 days — require explicit "post-cutover hotfix" sign-off.

**Phase 8 work is reversible** in normal git terms — revert the PR.

---

## Estimated Effort

- Phase 7 (cutover): 3–4 days (mostly reviews; deletion itself is fast)
- Phase 8 (hardening): 5–7 days
- Soak window before kickoff: **1 week of calendar time** (engineering work continues elsewhere during soak)
- **Session total: 8–11 working days + 1 calendar week soak**

---

## Post-Migration

After Session 5 ships:

1. **30-day stabilization window** — small fixes only; no new architectural moves
2. **Retrospective** — what surprised us, what we'd do differently
3. **Strategic workstreams unblocked:**
   - `LlmSessionRunner` port refactor (close the Copilot SDK leak)
   - A2A protocol adoption
   - Web UI / dashboard MVP
   - APM spec publication
   - Multi-tenancy product features (RBAC, audit, customer export)
4. **Partner conversations** — Antigravity first, Salesforce second (per principal-architect notes)

---

## Final Sign-off Checklist (production-ready)

- [ ] All session 1–4 deliverables shipped
- [ ] All session 5 exit criteria met
- [ ] DR drill complete with sign-off
- [ ] Operations team trained on new runbooks
- [ ] On-call rotation updated with Temporal escalation paths
- [ ] Cost projection re-validated against actual usage
- [ ] Security review passed (Temporal cluster access, secrets handling, audit logs)
- [ ] Compliance review passed (if applicable to deployment env)
- [ ] Architecture overview doc shareable with external partners

---

## Locked-in Decisions

Resolved during Session 5 planning. Implementing agents must not relitigate.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D5-1 | Physically rename `src/handlers/` → `src/activity-logic/`? | **No** | Activities still depend on it; rename is pure churn that breaks blame. Doc-only relabel suffices. Defer to a post-Session-5 hygiene PR if anyone insists. |
| D5-2 | Replay testing approach | **`Worker.runReplayHistories` against compiled bundle** | `TestWorkflowEnvironment` is broken in this workspace per Session 1 memory (webpack/`tsx` resolution conflict). The static replay API needs only the compiled bundle and is sufficient for determinism replay. |
| D5-3 | Soak gate semantics | **Concrete numeric thresholds, OTel-evidence-backed** | "≥10 features" alone is not sign-offable. Numeric gates (≥7 days, ≥10 distinct features, 100% PR-byte-equivalence on ≥3 random samples, 0 unrecovered state losses, ≤1 RCA'd OTel gap) are. |
| D5-4 | Fate of `npm run agent:run` | **Keep as shell wrapper** | Operations muscle memory preserved. Wrapper invokes `node dist/temporal/client/run-feature.js`. Legacy `--detached` flag removed (Temporal owns durability). |
| D5-5 | Fate of `scripts/postinstall-ajv-shim.mjs` | **Permanent production infrastructure** | The webpack→`schema-utils`→`ajv-keywords`@v8 vs ESLint v9→`@eslint/eslintrc`→`ajv@v6` conflict (Session 1) does not go away post-cutover. Treat the shim as runbook-grade infra: CI invariant, Dockerfile dependency, runbook entry. NEVER use `npm install --ignore-scripts` in any production build path. |
| D5-6 | Replay-history secret redaction | **Temporal `data-converter` codec for sensitive fields** | Captured histories may contain spec text and LLM tool-call payloads. Either redact via codec at capture time, or use sandbox-only features for the replay corpus. PII never lands in committed fixtures. |
| D5-7 | Multi-tenancy timing within Phase 8 | **Group F lands first in Phase 8** | If partner pilots are imminent (Antigravity, Salesforce per principal-architect notes), namespaces + `SecretsProvider` must exist before any partner onboarding. Versioning, replay, worker fleet (Groups E, G, H) follow. |
