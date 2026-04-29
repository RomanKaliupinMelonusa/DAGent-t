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

## Pre-flight Checks — Mandatory soak window

Before kickoff:

- [ ] Session 4 exit criteria all met
- [ ] **One full calendar week** of soak: ≥10 real features run on Temporal in parallel with legacy, all producing equivalent PRs
- [ ] Crash-recovery test passes against production Temporal cluster
- [ ] OTel pipeline stable; no telemetry gaps observed in soak week
- [ ] Admin CLI feature parity confirmed by operations sign-off
- [ ] Every legacy operational runbook has a Temporal equivalent merged
- [ ] All in-flight features on legacy path drained or migrated (see Phase 7 plan below)
- [ ] Disaster recovery sketch from Session 1 expanded to a runbook
- [ ] Final go/no-go meeting held with engineering + operations

**This is the irreversible step.** Do not begin Session 5 task work without all checkboxes.

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

| PR | Files deleted | Verification |
|---|---|---|
| PR-1 | `src/kernel/` (entire) | `git grep -E "PipelineKernel\|KernelRules\|ProcessResult" src/` returns zero |
| PR-2 | `src/loop/` (entire) | `git grep "pipeline-loop\|signal-handler" src/` returns zero |
| PR-3 | `src/adapters/json-file-state-store.ts`, `src/adapters/file-state/` | `git grep "JsonFileStateStore\|StateStore" src/` returns only port-interface refs (which can be deleted in PR-4) |
| PR-4 | `src/ports/state-store.ts` (now unused) | `git grep "ports/state-store" src/` returns zero |
| PR-5 | `src/adapters/subprocess-feature-runner.ts`, `src/entry/supervise.ts`, `src/entry/supervisor.ts` | `git grep "subprocess-feature\|supervise" src/` returns zero |
| PR-6 | `src/cli/pipeline-state.ts`, legacy `npm run pipeline:*` script entries | `git grep "pipeline-state\.ts" .` returns zero |
| PR-7 | `src/entry/main.ts`, `src/entry/watchdog.ts` (legacy bootstrap) | Replace with thin wrappers that delegate to `src/temporal/client/run-feature.ts` |
| PR-8 | `src/handlers/` (entire), `src/handlers/middleware/`, `src/harness/outcome-tool.ts` (now reachable only from activities, retained inside activity scope) | `git grep "handlers/" src/` returns zero outside `activities/` |
| PR-9 | `src/adapters/jsonl-telemetry.ts` | `git grep "jsonl-telemetry" src/` returns zero |
| PR-10 | `src/domain/dangling-invocations.ts`, `src/domain/stall-detection.ts` | `git grep "dangling\|stall-detection" src/` returns zero |

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
| D2 | Update `scripts/reset-dagent.sh` to issue Temporal `terminate` calls instead of state-file deletion | `scripts/reset-dagent.sh` |
| D3 | Update `.github/workflows/agentic-feature.yml` to invoke the new Temporal-based `agent:run` | workflow file |

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

| # | Task | Files |
|---|---|---|
| G1 | Capture production histories: `temporal workflow show --output json` for representative completed workflows | `tools/autonomous-factory/test-fixtures/replay-histories/` |
| G2 | Replay test runner: `npm run temporal:replay-test <history.json>` runs current code against captured history | `src/temporal/__tests__/replay/runner.ts` |
| G3 | CI integration: every PR that touches `src/temporal/workflow/` runs replay against all captured histories | `.github/workflows/temporal-replay.yml` |
| G4 | Documentation: how to capture + add new replay fixtures | `tools/autonomous-factory/docs/temporal-migration/09-replay-testing.md` |

Group H — Worker fleet

| # | Task | Files |
|---|---|---|
| H1 | Dockerfile for worker | `tools/autonomous-factory/Dockerfile.worker` |
| H2 | Health check endpoint (HTTP `/healthz`) — reports SDK connection, last poll | `src/temporal/worker/health.ts` |
| H3 | Graceful shutdown: drain in-flight activities, then exit | `src/temporal/worker/main.ts` |
| H4 | Helm chart for worker fleet | `infra/temporal/helm/worker/` |
| H5 | HPA policy: scale on Temporal task queue depth metric | `infra/temporal/helm/worker/templates/hpa.yaml` |
| H6 | Load test: 10 concurrent features, verify horizontal scaling triggers | `tools/autonomous-factory/scripts/load-test.sh` |

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
| J3 | **DR drill** — actually perform restore on staging, document any deltas | drill report committed to docs |
| J4 | Tabletop exercise: full region failure response | doc |

---

## Files Affected

**Deleted (post-cutover):**
- `src/kernel/` (entire)
- `src/loop/` (entire)
- `src/handlers/` (entire)
- `src/adapters/json-file-state-store.ts`, `src/adapters/file-state/`, `src/adapters/subprocess-feature-runner.ts`, `src/adapters/jsonl-telemetry.ts`
- `src/cli/pipeline-state.ts`
- `src/entry/main.ts`, `src/entry/watchdog.ts`, `src/entry/supervise.ts`, `src/entry/supervisor.ts`
- `src/ports/state-store.ts`
- `src/domain/dangling-invocations.ts`, `src/domain/stall-detection.ts`
- Several layer READMEs

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
- `scripts/run-agent.sh`, `scripts/reset-dagent.sh`

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

- [ ] All Phase 7 deletions complete; `git grep` confirms zero references to deleted symbols
- [ ] Documentation map fully updated; no broken doc links
- [ ] Workflow versioning policy in place + tested
- [ ] Multi-tenancy: namespace/queue convention live; isolation test passes
- [ ] `SecretsProvider` port + 2 adapters merged
- [ ] Replay tests in CI; pass against captured histories
- [ ] Worker Dockerfile + Helm chart deployed to staging
- [ ] Load test (10 concurrent features) passes with HPA scaling
- [ ] Grafana dashboard live; alerts firing on staging tests
- [ ] DR drill performed and documented
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
