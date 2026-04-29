# Session 1 — Foundation

> Phases 0, 1, 2. **Reversible.** Pure addition of infrastructure and SDK; zero behaviour change to legacy path.

---

## Session Goal

Land the migration spec, stand up Temporal locally + in CI, introduce the Temporal SDK as a parallel code path under `src/temporal/`. At end of session: a "hello world" Temporal workflow runs end-to-end against a local Temporal dev server, ESLint enforces workflow determinism scope, and the legacy `npm run agent:run` path is unaffected.

---

## Phases Included

- **Phase 0 — Migration Spec** (already drafted in [00-spec.md](00-spec.md); this session validates and signs off)
- **Phase 1 — Temporal Infrastructure** (local dev, CI, production target)
- **Phase 2 — SDK Introduction** (additive code path)

---

## Pre-flight Checks

Planning Agent must verify before kickoff:

- [ ] [00-spec.md](00-spec.md) sign-off complete (all checkboxes ticked)
- [ ] Target managed Postgres provider chosen
- [ ] Target Temporal hosting chosen
- [ ] OTLP target chosen (can be deferred to Session 4 if pressed)
- [ ] Existing test suite green on `main`
- [ ] No in-flight pipelines on the branch being migrated

---

## Planning Agent Prompt

Copy-paste this brief verbatim into the Planning Agent kickoff:

```
You are the Planning Agent for Session 1 of the Temporal migration. Your charter:

1. Validate that 00-spec.md is signed off by reading the sign-off checkboxes.
2. Supervise implementing Copilot Agents through Phase 1 (infrastructure) and Phase 2 (SDK introduction).
3. Enforce these invariants throughout the session:
   - No file in src/kernel/, src/loop/, src/handlers/, src/adapters/, src/domain/ may be modified.
   - All new code lives under src/temporal/ or infra/temporal/.
   - The legacy `npm run agent:run` command must still work at every commit.
   - ESLint scope rule for src/temporal/workflow/ must be enforceable by the end of the session.

Reference docs:
- tools/autonomous-factory/docs/temporal-migration/README.md
- tools/autonomous-factory/docs/temporal-migration/00-spec.md
- tools/autonomous-factory/docs/temporal-migration/session-1-foundation.md (this file)

Stop and request human review if:
- The TypeScript SDK ergonomics feel materially worse than expected (trigger R12 reassessment).
- Local Temporal server cannot be started reliably in the devcontainer.
- The hello-world workflow emits unexpected event history.

Exit gate: all exit criteria in session-1-foundation.md pass.
```

---

## Implementation Tasks

Group A — Infrastructure (Phase 1)

| # | Task | Owner | Files | Done when |
|---|---|---|---|---|
| A1 | Add `infra/temporal/docker-compose.yml` with `temporal-server` (auto-setup) + `temporal-ui` services pointing at local Postgres | Agent | `infra/temporal/docker-compose.yml`, `infra/temporal/dynamicconfig/development.yaml` | `docker compose up` brings cluster healthy on `localhost:7233` |
| A2 | Update devcontainer to install Temporal CLI; document `temporal server start-dev` workflow | Agent | `.devcontainer/devcontainer.json`, `.devcontainer/post-create.sh` (if exists) | `temporal --version` works inside fresh container; runbook in [.github/AGENTIC-WORKFLOW.md](../../../../.github/AGENTIC-WORKFLOW.md) |
| A3 | Add CI workflow that spins up ephemeral Temporal for integration tests | Agent | `.github/workflows/temporal-it.yml` | New workflow green; runs only `npm run temporal:test:integration` (initially a no-op) |
| A4 | Decision doc: production hosting topology + Postgres provider + cost estimate | Human + Agent | `tools/autonomous-factory/docs/temporal-migration/01-topology-decision.md` | Doc merged with sign-off |
| A5 | Provision non-prod Temporal cluster + Postgres in chosen target | Human-led | (out of repo) | Cluster reachable; credentials stored in 1Password / vault |

Group B — SDK Introduction (Phase 2)

| # | Task | Owner | Files | Done when |
|---|---|---|---|---|
| B1 | Add Temporal SDK packages to workspace | Agent | `tools/autonomous-factory/package.json` | `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity` installed at pinned versions |
| B2 | Create `src/temporal/` directory layout | Agent | `src/temporal/{workflow,activities,worker,client}/.gitkeep` + per-folder README | Folders exist with stub READMEs explaining role |
| B3 | Add ESLint determinism rule for `src/temporal/workflow/` | Agent | `tools/autonomous-factory/.eslintrc` (or equivalent), test fixture demonstrating rule fires | Deliberate `Date.now()` in a test fixture under `workflow/` triggers lint error |
| B4 | Implement hello-world workflow | Agent | `src/temporal/workflow/hello.workflow.ts`, `src/temporal/activities/hello.activity.ts`, `src/temporal/worker/main.ts`, `src/temporal/client/run-hello.ts` | `npm run temporal:hello` starts worker + executes workflow + prints result + exits clean |
| B5 | Wire npm scripts | Agent | `tools/autonomous-factory/package.json` | `temporal:worker`, `temporal:hello`, `temporal:test:integration` defined |
| B6 | Add unit tests for hello workflow using Temporal's `TestWorkflowEnvironment` | Agent | `src/temporal/workflow/__tests__/hello.workflow.test.ts` | Test passes locally and in CI |
| B7 | Document the new SDK layout | Agent | `src/temporal/README.md` | README explains workflow vs activity vs worker vs client roles |

---

## Files Affected

**Created:**
- `infra/temporal/docker-compose.yml`
- `infra/temporal/dynamicconfig/development.yaml`
- `.github/workflows/temporal-it.yml`
- `tools/autonomous-factory/docs/temporal-migration/01-topology-decision.md`
- `tools/autonomous-factory/src/temporal/` (entire tree, see Task B2)
- `tools/autonomous-factory/src/temporal/README.md`
- All hello-world implementation files (Tasks B4, B6)

**Modified:**
- `.devcontainer/devcontainer.json` — add Temporal CLI feature install
- `tools/autonomous-factory/package.json` — add SDK deps + new scripts
- `tools/autonomous-factory/.eslintrc.cjs` (or equivalent) — add scope rule
- `.github/AGENTIC-WORKFLOW.md` — runbook entry for "starting Temporal locally"
- `tools/autonomous-factory/README.md` — Documentation Map adds link to migration docs

**Deleted:** none (all session 1 work is additive)

---

## Test Strategy

1. **Existing test suite** — runs as before, all green. Zero regressions tolerated.
2. **New hello-world unit test** — uses `TestWorkflowEnvironment` (in-process Temporal); fast, no docker dependency.
3. **New integration test** — spins up Temporal via `docker compose`, runs hello-world end-to-end, asserts event history shape.
4. **Lint regression test** — fixture file demonstrates determinism rule fires; CI fails if rule is silently disabled.

---

## Exit Criteria

Hard gates before Session 2 begins:

- [ ] All Group A and Group B tasks marked done
- [ ] `temporal server start-dev` works inside devcontainer
- [ ] `npm run temporal:hello` succeeds end-to-end
- [ ] Temporal Web UI shows the hello-world workflow with expected history
- [ ] ESLint determinism rule provably fires
- [ ] Production-target Temporal cluster reachable from one engineering laptop
- [ ] Existing `npm run agent:run` succeeds on a reference feature (proves no regression)
- [ ] Topology decision doc merged with cost estimate

Soft gates (warning, not blocking):

- [ ] OTLP target chosen — if deferred, must land before Session 4
- [ ] Disaster recovery story sketched — full DR drill is Session 5

---

## Rollback Plan

Trivial: this session is purely additive. To roll back:

1. Revert PRs in reverse order
2. Run `npm uninstall @temporalio/...` to clean dependencies
3. Tear down Temporal infra (docker compose down + decommission cluster)

No data migration required, no in-flight workflows, no production exposure.

---

## Estimated Effort

- Phase 0 sign-off: 1–2 days (mostly review)
- Phase 1: 3–5 days
- Phase 2: 3–4 days
- **Session total: 9–12 working days**

Can compress to 7 days with two engineers (Group A and Group B in parallel).

---

## Hand-off to Session 2

When this session exits, the next Planning Agent receives:

- A working Temporal cluster (local + CI + non-prod)
- A scaffolded `src/temporal/` directory with hello-world reference
- ESLint enforcing determinism scope
- Sign-off that the toolchain ergonomics are acceptable

Session 2 begins with: "Port pure domain logic into workflow scope as a `DagState` class."
