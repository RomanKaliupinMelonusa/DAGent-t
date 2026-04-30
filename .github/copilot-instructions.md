# Agentic Pipeline Platform — Copilot Instructions

> Lightweight routing file. Always injected into Copilot context.
> Architecture overview lives in `tools/autonomous-factory/docs/architecture.md`. Per-layer contributor docs live in `tools/autonomous-factory/src/<layer>/README.md`. Subject deep-dives live in `tools/autonomous-factory/docs/`. Reference, don't duplicate.

## Project Identity

Deterministic agentic coding pipeline — DAG-scheduled AI agents from spec to PR. A headless TypeScript orchestrator drives specialist agents through a dependency-aware pipeline with self-healing recovery, real browser testing, and CI/CD integration. Zero human interaction until the final code review.

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | npm workspaces · `apps/sample-app/` (skeleton) · `apps/commerce-storefront/` (PWA Kit) · `tools/autonomous-factory/` (engine) |
| Orchestrator | TypeScript · Temporal OSS (`@temporalio/worker`, `@temporalio/client`, `@temporalio/workflow`) · `@github/copilot-sdk` · `@anthropic-ai/sdk` · Zod v4 · Node 22 |
| Pipeline state | Temporal workflow event history (Postgres-backed) · `dagent-admin` Temporal client for signals + queries + updates |
| APM Compiler | `apm-compiler.ts` · per-agent token budgets · modular `.md` instruction fragments |
| Structural Intelligence | roam-code v11.2 · Python 3.11 · AST semantic graph · MCP server |
| Telemetry | OpenTelemetry SDK · OTLP gRPC exporter |
| CI/CD | GitHub Actions · OIDC federated credentials |
| Testing | Vitest 2.1.9 (workflow replay + unit) · Playwright (live browser) · integration tests against live endpoints |
| Infra (sample) | Terraform (azurerm + azapi) · Azure Functions · Azure Static Web Apps |

## Hard Rules

1. **Pipeline state is owned by the Temporal workflow.** The workflow under `tools/autonomous-factory/src/workflow/` is the only writer; activities under `src/activities/` return `NodeResult` payloads that the workflow folds into `DagState`. Operators interact via `dagent-admin` (signals/queries/updates) — never edit `_TRANS.md` or `_STATE.json` projections by hand.
2. **Git operations use wrapper scripts.** `tools/autonomous-factory/agent-commit.sh` for commits, `tools/autonomous-factory/agent-branch.sh` for branching. No raw `git add/commit/push` in agent prompts.
3. **Devcontainer provides Node 22 and Python 3.11.** No NVM commands needed. `.nvmrc` at repo root is used by CI workflows (`node-version-file: '.nvmrc'`). Python is used only by the roam-code orchestrator toolchain.
4. **Workers run from compiled JS, not `tsx`.** `npm run temporal:build` produces `dist/`; `node dist/worker/main.js` is the worker entry. Workflow code under `src/workflow/**` must be deterministic across replays — see [`tools/autonomous-factory/docs/adr/0001-temporal.md`](../tools/autonomous-factory/docs/adr/0001-temporal.md).
5. **All Azure data-plane auth uses `DefaultAzureCredential`.** Zero API keys in code.
6. **APM manifest is the single source of truth for agent context.** Each app's `.apm/apm.yml` declares agents, instruction includes, MCP servers, skills, and token budgets.

## Documentation Map

| What | Where |
|---|---|
| **Operational hub (config, commands, CI/CD)** | **`.github/AGENTIC-WORKFLOW.md`** |
| **Engine architecture overview** | **`tools/autonomous-factory/docs/architecture.md`** |
| Temporal ADR (decision + mapping + determinism rules) | `tools/autonomous-factory/docs/adr/0001-temporal.md` |
| roam-code integration & tool inventory | `tools/autonomous-factory/docs/02-roam-code.md` |
| APM context system & rule engine | `tools/autonomous-factory/docs/03-apm-context.md` |
| Narrative / design essays | `narrative/` |
| Workflow code (pipeline workflow, DagState, signals/queries/updates, version) | `tools/autonomous-factory/src/workflow/` |
| Activities (copilot-agent, local-exec, github-ci-poll, triage, archive, hello) | `tools/autonomous-factory/src/activities/` |
| Pure helpers shared by activities | `tools/autonomous-factory/src/activity-lib/` |
| Worker entry | `tools/autonomous-factory/src/worker/main.ts` |
| Admin CLI (`dagent-admin`) | `tools/autonomous-factory/src/client/admin.ts` |
| Feature-run CLI (`agent:run`) | `tools/autonomous-factory/src/client/run-feature.ts` |
| Bootstrap (preflight + APM compile + workflow start input) | `tools/autonomous-factory/src/entry/bootstrap.ts` |
| CLI argument parser | `tools/autonomous-factory/src/entry/cli.ts` |
| Pure domain functions (DAG math, transitions, scheduling) | `tools/autonomous-factory/src/domain/` |
| Ports (interfaces) | `tools/autonomous-factory/src/ports/` |
| Adapters (I/O implementations) | `tools/autonomous-factory/src/adapters/` |
| APM compiler & context loader | `tools/autonomous-factory/src/apm/compiler.ts` · `src/apm/context-loader.ts` |
| Failure triage & routing | `tools/autonomous-factory/src/triage/` · `src/activities/triage.activity.ts` |
| Agent prompt factory | `tools/autonomous-factory/src/apm/agents.ts` |
| Tool call harness & circuit breaker | `tools/autonomous-factory/src/harness/` |
| Pre-flight checks | `tools/autonomous-factory/src/lifecycle/preflight.ts` |
| Lifecycle hooks execution | `tools/autonomous-factory/src/lifecycle/hooks.ts` |
| Git-based auto-skip | `tools/autonomous-factory/src/lifecycle/auto-skip.ts` |
| Feature archiving | `tools/autonomous-factory/src/lifecycle/archive.ts` |
| Pipeline reporting | `tools/autonomous-factory/src/reporting/` |
| Telemetry (OTel adapters) | `tools/autonomous-factory/src/telemetry/` |
| Worker layer README | `tools/autonomous-factory/src/worker/README.md` |
| Workflow layer README | `tools/autonomous-factory/src/workflow/README.md` |
| Activities layer README | `tools/autonomous-factory/src/activities/README.md` |
| Client layer README | `tools/autonomous-factory/src/client/README.md` |
| Domain layer README | `tools/autonomous-factory/src/domain/README.md` |
| Ports layer README | `tools/autonomous-factory/src/ports/README.md` |
| Adapters layer README | `tools/autonomous-factory/src/adapters/README.md` |
| APM layer README | `tools/autonomous-factory/src/apm/README.md` |
| Triage layer README | `tools/autonomous-factory/src/triage/README.md` |
| Entry layer README | `tools/autonomous-factory/src/entry/README.md` |
| Roam bootstrap script | `tools/autonomous-factory/setup-roam.sh` |
| Agent commit wrapper | `tools/autonomous-factory/agent-commit.sh` |
| Agent branch wrapper | `tools/autonomous-factory/agent-branch.sh` |
| CI polling script | `tools/autonomous-factory/poll-ci.sh` |
| Sample app APM manifest | `apps/sample-app/.apm/apm.yml` |
| Sample app DAG definition | `apps/sample-app/.apm/workflows.yml` |
| Sample app instruction fragments | `apps/sample-app/.apm/instructions/**/*.md` |
| Sample app lifecycle hooks | `apps/sample-app/.apm/hooks/*.sh` |
| Sample app skill declarations | `apps/sample-app/.apm/skills/*.skill.md` |
| Sample app MCP declarations | `apps/sample-app/.apm/mcp/*.mcp.yml` |
| Sample app active feature workspace | `apps/sample-app/.dagent/` |
| Commerce storefront APM manifest | `apps/commerce-storefront/.apm/apm.yml` |
| Commerce storefront DAG definition | `apps/commerce-storefront/.apm/workflows.yml` |
| Commerce storefront instruction fragments | `apps/commerce-storefront/.apm/instructions/**/*.md` |
| Commerce storefront lifecycle hooks | `apps/commerce-storefront/.apm/hooks/*.sh` |
| Commerce storefront skill declarations | `apps/commerce-storefront/.apm/skills/*.skill.md` |
| Commerce storefront MCP declarations | `apps/commerce-storefront/.apm/mcp/*.mcp.yml` |
| Commerce storefront active workspace | `apps/commerce-storefront/.dagent/` |
| Temporal docker-compose stack | `infra/temporal/docker-compose.yml` |
| CI/CD: Integration tests & builds | `.github/workflows/ci-integration.yml` |
| CI/CD: Temporal integration tests | `.github/workflows/temporal-it.yml` |
| CI/CD: Backend deploy | `.github/workflows/deploy-backend.yml` |
| CI/CD: Frontend deploy | `.github/workflows/deploy-frontend.yml` |
| CI/CD: Infra plan/apply | `.github/workflows/deploy-infra.yml` |
| CI/CD: Regression tests | `.github/workflows/regression-tests.yml` |
| CI/CD: Schema drift check | `.github/workflows/schema-drift.yml` |
| CI/CD: Agentic feature pipeline | `.github/workflows/agentic-feature.yml` |
| CI/CD: Storefront deploy (Managed Runtime) | `.github/workflows/deploy-storefront.yml` |
| ChatOps: Elevated TF apply | `.github/workflows/elevated-infra-deploy.yml` |
| ChatOps: Hold + Resume | `.github/workflows/dagent-chatops.yml` |
| Devcontainer config | `.devcontainer/devcontainer.json` |

### How to Run

**Locally (devcontainer):**

```bash
# Start the worker (one terminal)
npm run temporal:worker --workspace=orchestrator

# Start a feature (another terminal). Branch creation & spec staging
# are DAG nodes (create-branch, stage-spec) — no separate init step.
npm run agent:run -- --app apps/sample-app --workflow full-stack --spec-file /path/to/spec.md <slug>
npm run agent:run -- --app apps/commerce-storefront --workflow storefront --spec-file /path/to/spec.md <slug>
# Optional: --base-branch develop (or BASE_BRANCH=develop env var)

# Operate a running pipeline via the Temporal client
node tools/autonomous-factory/dist/client/admin.js status <slug>
node tools/autonomous-factory/dist/client/admin.js hold <slug>
node tools/autonomous-factory/dist/client/admin.js resume <slug>
```

**In CI (GitHub Actions):**

Trigger the `agentic-feature.yml` workflow via `workflow_dispatch` with a feature slug, workflow type, and optional base branch.

### Operating Rules

- **State management:** The Temporal workflow under `src/workflow/` owns pipeline state. Activities return `NodeResult` payloads; the workflow folds them into `DagState`. Operators interact via `dagent-admin` (signals + queries + updates). Never edit `_TRANS.md` or `_STATE.json` projections.
- **Scaffolding as nodes:** Feature-branch creation and spec staging are DAG nodes (`create-branch`, `stage-spec`) at the head of every workflow. Bootstrap is pipeline-agnostic — it never shells out to `agent-branch.sh` directly.
- **Git operations:** Use `tools/autonomous-factory/agent-commit.sh` for commits, `tools/autonomous-factory/agent-branch.sh` for branching. No raw `git add/commit/push`.
- **Branch model:** All work happens on a single `feature/<slug>` branch. PR to the base branch (default: `main`, configurable via `--base-branch` or `BASE_BRANCH` env var) is the final administrative step.
- **Prompt rules:** Coding rules live in `apps/<your-app>/.apm/instructions/` (single source of truth), declared in `.apm/apm.yml`. The APM compiler resolves per-agent instruction sets and validates token budgets.
- **Post-deploy failure rerouting:** When `live-ui` or `integration-test` fails, the workflow runs the `triage` activity and resets the appropriate dev nodes for redevelopment. Max 5 redevelopment cycles.
- **Clean-slate revert:** When a dev agent fails ≥ 3 times (per-feature redevelopment cycles), the workflow injects a warning advising `agent-branch.sh revert` to wipe the feature branch and rebuild from scratch. The circuit breaker grants one bypass to allow this.
- **Cognitive circuit breaker:** Per-agent tool call limits (`toolLimits` in `.apm/apm.yml`). Soft limit injects a frustration prompt into the tool result via `tool.execution_complete`; hard limit force-disconnects. Resolution: per-agent `toolLimits` → `config.defaultToolLimits` (currently 60/80) → code fallback (30/40).
- **Hard limits:** 10 retry attempts per failing item, 3 re-deploy cycles (configurable via `max_redeploy_cycles` in `workflows.yml`), 5 redevelopment cycles per feature.
- **Workflow versioning:** Bump `WORKFLOW_VERSION` (`src/workflow/version.ts`) or wrap new branches with `patched(<id>)` whenever workflow logic changes. `npm run lint:workflow-version` enforces this.
