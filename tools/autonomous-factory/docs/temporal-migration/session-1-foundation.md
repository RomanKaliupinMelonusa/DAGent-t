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

## Locked-in Decisions

These were resolved during planning. Implementing agents must not relitigate them inside this session — file a separate ticket if revisiting.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Test runner for `tools/autonomous-factory` | **Vitest** | Orchestrator is ESM-native (`"type": "module"`); Vitest reads `tsconfig.json` directly; Temporal `TestWorkflowEnvironment` works runner-agnostically; Jest's ESM+TS story is still rough. Repo will run two runners (Jest in `apps/`, Vitest in `tools/`) — accepted cost. |
| D2 | Temporal CLI install in devcontainer | **Append to existing `postCreateCommand`** | Smallest diff to [.devcontainer/devcontainer.json](../../../../.devcontainer/devcontainer.json); no new file; community devcontainer features avoided for trust reasons. Extracting into a `post-create.sh` is a separate hygiene PR if anyone proposes it. |
| D3 | R12 (SDK ergonomics) go/no-go checkpoint | **End of Phase 2 (after Task B6 passes)** | Earliest moment with full ergonomic signal (workflow + activity + worker + client all written). Reversal cost still near-zero. Explicitly meeting-gated, not buried in exit criteria. |

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
- The TypeScript SDK ergonomics feel materially worse than expected (trigger R12 reassessment — the formal R12 checkpoint is the dedicated review meeting at end of Phase 2; halt earlier if signal is already clear).
- Local Temporal server cannot be started reliably in the devcontainer.
- The hello-world workflow emits unexpected event history.

Locked-in decisions you must enforce (see "Locked-in Decisions" section):
- Test runner is Vitest. Do NOT introduce Jest, ts-jest, or node:test in this package.
- Devcontainer Temporal CLI install is appended to the existing `postCreateCommand` line — do NOT extract into a new `post-create.sh` script.
- Phase 2 ends with a formal R12 ergonomics review meeting before Session 1 exit gate is signed.

Exit gate: all exit criteria in session-1-foundation.md pass.
```

---

## Implementation Tasks

Group A — Infrastructure (Phase 1)

| # | Task | Owner | Files | Done when |
|---|---|---|---|---|
| A1 | Add `infra/temporal/docker-compose.yml` with `temporal-server` (auto-setup) + `temporal-ui` services pointing at local Postgres | Agent | `infra/temporal/docker-compose.yml`, `infra/temporal/dynamicconfig/development.yaml` | `docker compose up` brings cluster healthy on `localhost:7233` |
| A2 | Append Temporal CLI install to existing `postCreateCommand` (per D2); document `temporal server start-dev` workflow | Agent | `.devcontainer/devcontainer.json` only — no new script file | `temporal --version` works inside fresh container; runbook entry in [.github/AGENTIC-WORKFLOW.md](../../../../.github/AGENTIC-WORKFLOW.md); install command is `curl -sSf https://temporal.download/cli.sh \| sh` chained after `setup-roam.sh` |
| A3 | Add CI workflow that spins up ephemeral Temporal for integration tests | Agent | `.github/workflows/temporal-it.yml` | New workflow green; runs only `npm run temporal:test:integration` (initially a no-op) |
| A4 | Decision doc: production hosting topology + Postgres provider + cost estimate | Human + Agent | `tools/autonomous-factory/docs/temporal-migration/01-topology-decision.md` | Doc merged with sign-off |
| A5 | Provision non-prod Temporal cluster + Postgres in chosen target | Human-led | (out of repo) | Cluster reachable; credentials stored in 1Password / vault |

Group B — SDK Introduction (Phase 2)

| # | Task | Owner | Files | Done when |
|---|---|---|---|---|
| B0 | Add Vitest to the orchestrator package (per D1) — install, `vitest.config.ts`, npm scripts | Agent | `tools/autonomous-factory/package.json`, `tools/autonomous-factory/vitest.config.ts` | `vitest`, `@vitest/ui` (optional) in devDependencies; `npm run test` and `npm run test:watch` defined; empty placeholder test passes |
| B1 | Add Temporal SDK packages to workspace | Agent | `tools/autonomous-factory/package.json` | `@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity` installed at pinned versions |
| B2 | Create `src/temporal/` directory layout | Agent | `src/temporal/{workflow,activities,worker,client}/.gitkeep` + per-folder README | Folders exist with stub READMEs explaining role |
| B3 | Add ESLint determinism rule for `src/temporal/workflow/` | Agent | `tools/autonomous-factory/.eslintrc` (or equivalent), test fixture demonstrating rule fires | Deliberate `Date.now()` in a test fixture under `workflow/` triggers lint error |
| B4 | Implement hello-world workflow | Agent | `src/temporal/workflow/hello.workflow.ts`, `src/temporal/activities/hello.activity.ts`, `src/temporal/worker/main.ts`, `src/temporal/client/run-hello.ts` | `npm run temporal:hello` starts worker + executes workflow + prints result + exits clean |
| B5 | Wire npm scripts | Agent | `tools/autonomous-factory/package.json` | `temporal:worker`, `temporal:hello`, `temporal:test:integration` defined |
| B6 | Add Vitest unit test for hello workflow using Temporal's `TestWorkflowEnvironment` | Agent | `src/temporal/workflow/__tests__/hello.workflow.test.ts` | Test passes locally (`npm run test`) and in CI |
| B7 | Document the new SDK layout | Agent | `src/temporal/README.md` | README explains workflow vs activity vs worker vs client roles |
| B8 | **R12 ergonomics review meeting** (per D3) — 1-hour structured review after B6 passes; reviewer answers "Did the TS SDK feel acceptable for the next 8 weeks?" | Human (engineering lead) + Planning Agent | Decision recorded as a new section in [00-spec.md](00-spec.md) ADR | Meeting held; outcome (proceed / halt / reassess Restate) documented; Session 1 exit gate cannot be signed without this |

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
- `.devcontainer/devcontainer.json` — append Temporal CLI install to `postCreateCommand` (single-line addition; no new script file)
- `tools/autonomous-factory/package.json` — add Vitest + Temporal SDK deps + new scripts (`test`, `test:watch`, `temporal:worker`, `temporal:hello`, `temporal:test:integration`)
- `tools/autonomous-factory/.eslintrc.cjs` (or equivalent) — add scope rule
- `.github/AGENTIC-WORKFLOW.md` — runbook entry for "starting Temporal locally"
- `tools/autonomous-factory/README.md` — Documentation Map adds link to migration docs
- `tools/autonomous-factory/docs/temporal-migration/00-spec.md` — append R12 review meeting outcome (Task B8)

**Created:**
- `tools/autonomous-factory/vitest.config.ts`

**Deleted:** none (all session 1 work is additive)

---

## Test Strategy

Runner: **Vitest** (per D1). All `tools/autonomous-factory` tests from this session forward use Vitest. Existing Jest-based suites in `apps/sample-app/backend` and `packages/schemas` are unaffected.

1. **Existing test suite** — runs as before, all green. Zero regressions tolerated.
2. **New hello-world unit test** — Vitest + `TestWorkflowEnvironment` (in-process Temporal); fast, no docker dependency.
3. **New integration test** — spins up Temporal via `docker compose`, runs hello-world end-to-end, asserts event history shape.
4. **Lint regression test** — fixture file demonstrates determinism rule fires; CI fails if rule is silently disabled.

---

## Exit Criteria

Hard gates before Session 2 begins:

- [ ] All Group A and Group B tasks (B0–B8) marked done
- [ ] `temporal server start-dev` works inside devcontainer
- [ ] `npm run temporal:hello` succeeds end-to-end
- [ ] Temporal Web UI shows the hello-world workflow with expected history
- [ ] ESLint determinism rule provably fires
- [ ] Production-target Temporal cluster reachable from one engineering laptop
- [ ] Existing `npm run agent:run` succeeds on a reference feature (proves no regression)
- [ ] Topology decision doc merged with cost estimate
- [ ] Vitest configured and `npm run test` green
- [ ] **R12 ergonomics review meeting held (Task B8); outcome "proceed" recorded in 00-spec.md**

Soft gates (warning, not blocking):

- [ ] OTLP target chosen — if deferred, must land before Session 4
- [ ] Disaster recovery story sketched — full DR drill is Session 5

### Validation Status (post-implementation audit)

Audit performed: 2026-04-29.

| Item | Status |
|---|---|
| All Group A & B tasks (B0–B8) | ✅ Code-complete |
| `temporal server start-dev` works in devcontainer | ✅ Verified |
| `npm run temporal:hello` succeeds | ✅ Verified |
| Web UI shows hello workflow | ✅ Verified |
| ESLint determinism rule fires | ✅ Verified (`npm run lint:test`) |
| Production-target cluster reachable | ⏳ Pending Ops confirmation (Item 5 / D7) |
| Legacy `npm run agent:run` regression-free | ⏳ Needs final smoke test |
| Topology decision doc merged with cost estimate | ⏳ Pending Ops (D1–D6 [TBD]) |
| Vitest configured + `npm run test` green | ✅ Verified |
| R12 review meeting outcome recorded | ✅ Verdict pass-with-notes; cross-linked in 00-spec.md |

Three blockers remaining for exit gate: Operations sign-off on topology decisions, non-prod cluster provisioning confirmation, and legacy regression smoke test.

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
