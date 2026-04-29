# `src/temporal/` — Temporal SDK Code Path

> Additive code path introduced by the Temporal migration. While the migration is in progress (Sessions 1–4) the legacy `src/kernel/`, `src/loop/`, `src/handlers/` path remains the production runtime. Everything under this directory is new code, lint-scoped separately, and does not affect the legacy path.
>
> Reference: [../../docs/temporal-migration/](../../docs/temporal-migration/)

## Layout

| Folder | Role | Determinism |
|---|---|---|
| [`workflow/`](workflow/) | Pure orchestration code. Runs inside Temporal's deterministic sandbox. May only import from itself, `domain/` (pure), and `@temporalio/workflow`. **Forbidden:** filesystem, network, LLM SDKs, ports, adapters, `Date`, `Math.random`, `setTimeout`. Enforced by [`eslint.config.js`](../../eslint.config.js). | Strict |
| [`activities/`](activities/) | Side-effecting work (LLM sessions, git, CI calls, scripts). Plain TypeScript; uses existing ports/adapters internally. Heartbeats long operations. | None |
| [`worker/`](worker/) | Worker process bootstrap. Registers activities + workflows, polls a task queue. | n/a |
| [`client/`](client/) | One-shot CLIs that submit workflows / signals / queries via `@temporalio/client`. | n/a |

## Determinism Contract

Workflow code is replayed from history on every continuation. Anything that produces a different value across two runs (current time, random numbers, environment, filesystem content) breaks replay. The ESLint scope rule for `workflow/**` enforces the bans listed in [`docs/temporal-migration/00-spec.md` → "Determinism Constraints"](../../docs/temporal-migration/00-spec.md).

If the linter complains, **never disable the rule** — move the offending logic into an activity and call it via `proxyActivities`.

## Testing

| What | How |
|---|---|
| Workflow unit tests | `@temporalio/testing` `TestWorkflowEnvironment.createLocal()` — in-process, no Docker. Run via `npm test`. |
| Activity unit tests | `@temporalio/testing` `MockActivityEnvironment`. |
| End-to-end integration | Full docker-compose stack from [`infra/temporal/`](../../../../infra/temporal/), driven by `npm run temporal:test:integration` in CI. |
| Lint regression | `npm run lint:test` asserts the determinism rule fires on `workflow/__fixtures__/forbidden.fixture.ts`. |

## Running locally

```bash
# Option 1 — fast, in-memory dev server
temporal server start-dev --ui-port 8233

# Option 2 — full Postgres-backed stack
docker compose -f infra/temporal/docker-compose.yml up -d

# In one terminal — start the worker
npm run temporal:worker

# In another — submit the hello workflow
npm run temporal:hello
```

## Migration roadmap

| Session | This directory grows by… |
|---|---|
| 1 (current) | `hello.workflow.ts`, `hello.activity.ts`, `worker/main.ts`, `client/run-hello.ts` |
| 2 | `workflow/dag-state.ts`, `workflow/domain/` (copy-imported pure functions) |
| 3 | `activities/{local-exec,github-ci-poll,triage,copilot-agent}.activity.ts` + signals |
| 4 | `workflow/pipeline.workflow.ts`, queries, OTel, reporting, admin CLI |
| 5 | Cutover — legacy path removed |
