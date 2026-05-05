# Autonomous Factory — Engine

The Temporal-based orchestration engine that drives the agentic pipeline. A
single worker process executes activities for a DAG-shaped workflow that walks
a feature spec from kickoff to PR. Operators interact through a thin admin CLI
that talks to Temporal via signals, queries, and updates.

> Audience: contributors modifying or extending the engine. For the
> end-to-end platform tour see the [repo README](../../README.md). For
> operational runbook (CI secrets, ChatOps, commands) see
> [`.github/AGENTIC-WORKFLOW.md`](../../.github/AGENTIC-WORKFLOW.md).

## What's authoritative

The architecture overview — topology diagram, state taxonomy, activities
catalog, admin CLI verbs, versioning policy — lives in
[`docs/architecture.md`](docs/architecture.md). This README links to it
rather than duplicating the diagram. The Temporal-migration decision and
determinism rules live in [`docs/adr/0001-temporal.md`](docs/adr/0001-temporal.md).

## Layer map

Every layer below has its own README with file inventory, invariants, and
extension recipes. Start there when you need to change one layer in
isolation.

| Layer | What it owns | README |
|---|---|---|
| `src/workflow/` | Deterministic pipeline workflow, `DagState`, signals/queries/updates, `WORKFLOW_VERSION`. | [README](src/workflow/README.md) |
| `src/workflow/domain/` | Twin of `src/domain/` callable from inside the workflow VM (no `node:crypto`, no I/O). | [README](src/workflow/domain/README.md) |
| `src/activities/` | Side-effecting work invoked by the workflow (`copilot-agent`, `local-exec`, `github-ci-poll`, `triage`, `archive`, `hello`). | [README](src/activities/README.md) |
| `src/activities/support/` | Pure helpers shared by activities — no Temporal SDK imports, unit-testable. | — |
| `src/contracts/` | Cross-cutting handler contracts: `NodeContext`, `NodeResult`, node I/O contract, post-session gate + recovery prompt. | — |
| `src/worker/` | Worker bootstrap — registers workflows + activities, polls task queue, wires OTel. | [README](src/worker/README.md) |
| `src/client/` | Temporal client surfaces: `dagent-admin`, feature-run CLI, smoke-test runners. | [README](src/client/README.md) |
| `src/domain/` | Pure DAG math, transitions, scheduling, error fingerprinting (used outside the workflow VM). | [README](src/domain/README.md) |
| `src/ports/` | Hexagonal interface contracts. Implementations live in `src/adapters/`. | [README](src/ports/README.md) |
| `src/adapters/` | I/O concretions — every filesystem, subprocess, git, GitHub, or LLM call goes through one of these. | [README](src/adapters/README.md) |
| `src/apm/` | APM manifest compiler, context loader, agent prompt factory, artifact catalog. | [README](src/apm/README.md) |
| `src/triage/` | Failure classifier (declarative L0 → RAG → LLM) and structured handoff builder. | [README](src/triage/README.md) |
| `src/lifecycle/` | Preflight checks, lifecycle hooks, auto-skip, branch flush, state-commit mutex. | [README](src/lifecycle/README.md) |
| `src/harness/` | Agent SDK session safety: tool RBAC, tool-call limits, shell guards, `report_outcome` tool. | [README](src/harness/README.md) |
| `src/telemetry/` | `PipelineLogger` interface, JSONL + console rendering helpers. | [README](src/telemetry/README.md) |
| `src/session/` | Activity-side session helpers (git snapshots, SDK event wiring, transient retry, CI artefact poster). | [README](src/session/README.md) |
| `src/entry/` | Composition root for client-side entry points (bootstrap, CLI parser, supervisor). | [README](src/entry/README.md) |

Two thin layers without their own README:

- `src/contracts/` — declarative `node-io-contract.ts` shape (one file).
- `src/paths/` — `feature-paths.ts`, the canonical translator from `(slug, itemKey, invocationId)` to on-disk paths.

## How to run

Local dev requires Node 22 (the devcontainer provides it). Start a Temporal
dev server, then a worker, then a feature run:

```bash
# Terminal 1 — dev Temporal server (frontend on :7233, UI on :8233).
npm run temporal:dev --workspace=orchestrator

# Terminal 2 — orchestrator worker.
npm run worker --workspace=orchestrator

# Terminal 3 — start a feature pipeline.
npm run agent:run --workspace=orchestrator -- \
  --app apps/<app> \
  --workflow <workflow-name> \
  --spec-file /path/to/spec.md \
  <feature-slug>
```

Operate a running pipeline via the admin CLI:

```bash
npm run admin --workspace=orchestrator -- status   <slug>
npm run admin --workspace=orchestrator -- hold     <slug>
npm run admin --workspace=orchestrator -- resume   <slug>
npm run admin --workspace=orchestrator -- approve  <slug> --gate <key>
npm run admin --workspace=orchestrator -- cancel   <slug> --reason "<text>"
```

The full verb reference is in [`docs/architecture.md`](docs/architecture.md#admin-cli-verbs).
For detached runs that need to survive editor reloads, use
[`scripts/run-agent.sh`](../../scripts/run-agent.sh) (wraps the same CLI in
`systemd-run --user --scope` with a `MemoryMax` cap, falling back to
`setsid nohup`).

### Other npm scripts

| Script | Purpose |
|---|---|
| `temporal:build` | Compile TypeScript (`tsc -p`). Workers must run from `dist/`, not `tsx`. |
| `test` | Vitest unit + workflow-replay tests. |
| `test:replay` | Just the replay regression suite (`src/__tests__/replay/`). |
| `temporal:test:integration` | Build then run the integration suite under `src/__tests__`. |
| `lint` | ESLint with workflow-determinism rules over `workflow/`, `activities/`, `worker/`, `client/`. |
| `lint:workflow-version` | Fails CI if `src/workflow/**` changed without a `WORKFLOW_VERSION` bump or `patched()` wrap. |
| `temporal:hello` / `temporal:skeleton` / `temporal:dispatch` | Smoke-test runners for the toy workflows in `src/workflow/`. |

`bin` entries: `dagent-worker` → `dist/worker/main.js`,
`dagent-admin` → `dist/client/admin.js`.

## Hard rules for contributors

1. **The Temporal workflow owns pipeline state.** Activities return
   `NodeResult` payloads; the workflow folds them into `DagState`.
   Operators mutate state through admin signals/updates only — never edit
   `_state.json` projections by hand.
2. **Workflow code is deterministic.** No `Date.now()`, no
   `Math.random()`, no timers, no `node:fs`, no network, no LLM SDKs, no
   imports from `adapters/`, `ports/`, `domain/` (use the workflow-safe
   twin under `src/workflow/domain/`). All bans are ESLint-enforced.
3. **Workers run from compiled JS.** `npm run temporal:build` first; the
   worker entry is `node dist/worker/main.js`.
4. **Bump `WORKFLOW_VERSION` or wrap with `patched(<id>)`** whenever
   workflow logic changes shape. `npm run lint:workflow-version` fails
   the build otherwise. ADR
   [0001](docs/adr/0001-temporal.md) explains why.
5. **APM manifest is the single source of truth for agent context.**
   Agent identity, rules, MCP bindings, and token budgets all come from
   `apps/<app>/.apm/apm.yml`. Engine TS contains zero agent-specific
   prompt text.
6. **Git operations use the wrapper scripts.** [`agent-commit.sh`](agent-commit.sh)
   for commits, [`agent-branch.sh`](agent-branch.sh) for branching. No
   raw `git add/commit/push` in agent prompts or activities.
7. **Update layer READMEs whenever a layer's file inventory changes.**
   Each `src/<layer>/README.md` follows the
   [README template](docs/README-TEMPLATE.md). When you add, rename, or
   remove a file in a layer, update its README's file table in the
   same PR.
8. **Add an ADR for any decision that changes a hard rule.** Anything
   that alters determinism rules, the port shape, the state taxonomy,
   or the workflow versioning policy needs a numbered ADR under
   [`docs/adr/`](docs/adr/). Use [ADR 0001](docs/adr/0001-temporal.md)
   as the structural reference.

## Subject deep-dives

- [`docs/architecture.md`](docs/architecture.md) — canonical topology, state
  taxonomy, activities catalog, admin verbs, versioning policy.
- [`docs/01-self-healing.md`](docs/01-self-healing.md) — triage cascade,
  cycle budgets, identical-error circuit breaker.
- [`docs/02-roam-code.md`](docs/02-roam-code.md) — structural code
  intelligence (the MCP semantic graph agents use).
- [`docs/03-apm-context.md`](docs/03-apm-context.md) — APM manifest schema,
  compilation, runtime prompt assembly.
- [`docs/04-state-machine.md`](docs/04-state-machine.md) — `DagState`,
  transitions, signals/queries/updates, versioning.
- [`docs/05-agents.md`](docs/05-agents.md) — persona model, harness,
  cognitive circuit breaker, adding a new agent.
- [`docs/07-mental-model.md`](docs/07-mental-model.md) — mapping to a
  traditional software team; why DAG > LLM-driver-loop; why Temporal.
- [`docs/adr/0001-temporal.md`](docs/adr/0001-temporal.md) — Temporal
  migration decision, mapping from the predecessor kernel/loop model, and
  workflow-determinism rules.
- [`docs/adr/0002-state-in-temporal-history.md`](docs/adr/0002-state-in-temporal-history.md)
  — pipeline state authority moved to Temporal event history.
- [`docs/adr/0003-retire-reporting-layer.md`](docs/adr/0003-retire-reporting-layer.md)
  — retiring `src/reporting/` after the state-of-truth migration.
- [`docs/adr/0004-telemetry-jsonl-only.md`](docs/adr/0004-telemetry-jsonl-only.md)
  — lean JSONL + console telemetry; OTel deferred to the Temporal SDK.
- [`docs/adr/0005-scaffolding-as-dag-nodes.md`](docs/adr/0005-scaffolding-as-dag-nodes.md)
  — branch creation and spec staging as DAG nodes.
- [`docs/README-TEMPLATE.md`](docs/README-TEMPLATE.md) — layer README
  template every `src/<layer>/README.md` should follow.

## Reference

- [`.github/AGENTIC-WORKFLOW.md`](../../.github/AGENTIC-WORKFLOW.md) —
  operational hub: CI/CD setup, ChatOps, commands.
- [`infra/temporal/docker-compose.yml`](../../infra/temporal/docker-compose.yml)
  — Postgres-backed Temporal cluster for non-dev runs.
