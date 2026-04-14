# Agentic Pipeline Platform — Copilot Instructions

> Lightweight routing file. Always injected into Copilot context.
> Deep documentation lives in `tools/autonomous-factory/docs/` — reference, don't duplicate.

## Project Identity

Deterministic agentic coding pipeline — DAG-scheduled AI agents from spec to PR. A headless TypeScript orchestrator drives specialist agents through a dependency-aware pipeline with self-healing recovery, real browser testing, and CI/CD integration. Zero human interaction until the final code review.

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | npm workspaces · `apps/sample-app/` (skeleton) · `apps/commerce-storefront/` (PWA Kit) · `tools/autonomous-factory/` (engine) |
| Orchestrator | TypeScript · `@github/copilot-sdk` · `@anthropic-ai/sdk` · Zod v4 · Node 22 |
| State Machine | DAG scheduler · `pipeline-state.mjs` · JSON state files |
| APM Compiler | `apm-compiler.ts` · per-agent token budgets · modular `.md` instruction fragments |
| Structural Intelligence | roam-code v11.2 · Python 3.11 · AST semantic graph · MCP server |
| CI/CD | GitHub Actions · OIDC federated credentials · 10 workflows |
| Testing | Playwright (live browser) · Jest (unit) · integration tests against live endpoints |
| Infra (sample) | Terraform (azurerm + azapi) · Azure Functions · Azure Static Web Apps |

## Hard Rules

1. **Pipeline state is managed by `tools/autonomous-factory/pipeline-state.mjs`.** Agents never edit `_TRANS.md` or `_STATE.json` by hand — use `npm run pipeline:complete/fail/reset-ci/doc-note`.
2. **Git operations use wrapper scripts.** `tools/autonomous-factory/agent-commit.sh` for commits, `tools/autonomous-factory/agent-branch.sh` for branching. No raw `git add/commit/push` in agent prompts.
3. **Devcontainer provides Node 22 and Python 3.11.** No NVM commands needed. `.nvmrc` at repo root is used by CI workflows (`node-version-file: '.nvmrc'`). Python is used only by the roam-code orchestrator toolchain.
4. **All Azure data-plane auth uses `DefaultAzureCredential`.** Zero API keys in code.
5. **APM manifest is the single source of truth for agent context.** Each app's `.apm/apm.yml` declares agents, instruction includes, MCP servers, skills, and token budgets.

## Documentation Map

| What | Where |
|---|---|
| **Operational hub (config, commands, CI/CD)** | **`.github/AGENTIC-WORKFLOW.md`** |
| System architecture overview | `tools/autonomous-factory/docs/00-overview.md` |
| Watchdog orchestrator deep-dive | `tools/autonomous-factory/docs/01-watchdog.md` |
| roam-code integration & tool inventory | `tools/autonomous-factory/docs/02-roam-code.md` |
| APM context system & rule engine | `tools/autonomous-factory/docs/03-apm-context.md` |
| Pipeline state machine & DAG | `tools/autonomous-factory/docs/04-state-machine.md` |
| Specialist agent catalog | `tools/autonomous-factory/docs/05-agents.md` |
| Standing features & roadmap | `tools/autonomous-factory/docs/06-roadmap/` |
| Mental model (SDLC → Agentic) | `tools/autonomous-factory/docs/07-mental-model.md` |
| SDK orchestrator entry point | `tools/autonomous-factory/src/watchdog.ts` |
| Dispatch kernel (per-item lifecycle) | `tools/autonomous-factory/src/session-runner.ts` |
| Handler plugins (agent, push, poll, PR, local-exec) | `tools/autonomous-factory/src/handlers/` |
| Session submodules (shared, readiness, triage, events) | `tools/autonomous-factory/src/session/` |
| Failure triage & routing | `tools/autonomous-factory/src/triage.ts` · `src/triage/` |
| Agent prompt factory | `tools/autonomous-factory/src/agents.ts` |
| Tool call harness & circuit breaker | `tools/autonomous-factory/src/tool-harness.ts` |
| Pre-flight checks | `tools/autonomous-factory/src/preflight.ts` |
| Lifecycle hooks execution | `tools/autonomous-factory/src/hooks.ts` |
| Pipeline reporting | `tools/autonomous-factory/src/reporting.ts` |
| Git-based auto-skip | `tools/autonomous-factory/src/auto-skip.ts` |
| Retry/revert prompt injection | `tools/autonomous-factory/src/context-injection.ts` |
| Feature archiving | `tools/autonomous-factory/src/archive.ts` |
| Roam bootstrap script | `tools/autonomous-factory/setup-roam.sh` |
| Sample app APM manifest | `apps/sample-app/.apm/apm.yml` |
| Sample app DAG definition | `apps/sample-app/.apm/workflows.yml` |
| Sample app instruction fragments | `apps/sample-app/.apm/instructions/**/*.md` |
| Sample app lifecycle hooks | `apps/sample-app/.apm/hooks/*.sh` |
| Sample app skill declarations | `apps/sample-app/.apm/skills/*.skill.md` |
| Sample app MCP declarations | `apps/sample-app/.apm/mcp/*.mcp.yml` |
| APM compiler & context loader | `tools/autonomous-factory/src/apm-compiler.ts` · `apm-context-loader.ts` |
| Active feature workspace | `apps/sample-app/in-progress/` |
| Commerce storefront APM manifest | `apps/commerce-storefront/.apm/apm.yml` |
| Commerce storefront DAG definition | `apps/commerce-storefront/.apm/workflows.yml` |
| Commerce storefront instruction fragments | `apps/commerce-storefront/.apm/instructions/**/*.md` |
| Commerce storefront lifecycle hooks | `apps/commerce-storefront/.apm/hooks/*.sh` |
| Commerce storefront skill declarations | `apps/commerce-storefront/.apm/skills/*.skill.md` |
| Commerce storefront MCP declarations | `apps/commerce-storefront/.apm/mcp/*.mcp.yml` |
| Commerce storefront active workspace | `apps/commerce-storefront/in-progress/` |
| CI/CD: Integration tests & builds | `.github/workflows/ci-integration.yml` |
| CI/CD: Backend deploy | `.github/workflows/deploy-backend.yml` |
| CI/CD: Frontend deploy | `.github/workflows/deploy-frontend.yml` |
| CI/CD: Infra plan/apply | `.github/workflows/deploy-infra.yml` |
| CI/CD: Regression tests | `.github/workflows/regression-tests.yml` |
| CI/CD: Schema drift check | `.github/workflows/schema-drift.yml` |
| CI/CD: Agentic feature pipeline | `.github/workflows/agentic-feature.yml` |
| CI/CD: Storefront deploy (Managed Runtime) | `.github/workflows/deploy-storefront.yml` |
| ChatOps: Elevated TF apply | `.github/workflows/elevated-infra-deploy.yml` |
| ChatOps: Hold + Resume | `.github/workflows/dagent-chatops.yml` |
| Pipeline state script | `tools/autonomous-factory/pipeline-state.mjs` |
| Agent commit wrapper | `tools/autonomous-factory/agent-commit.sh` |
| Agent branch wrapper | `tools/autonomous-factory/agent-branch.sh` |
| CI polling script | `tools/autonomous-factory/poll-ci.sh` |
| Devcontainer config | `.devcontainer/devcontainer.json` |

## SDK Orchestrator

The agentic pipeline is driven by a headless TypeScript orchestrator using `@github/copilot-sdk`.

| What | Where |
|---|---|
| Orchestrator entry point | `tools/autonomous-factory/src/watchdog.ts` |
| Dispatch kernel (per-item lifecycle) | `tools/autonomous-factory/src/session-runner.ts` |
| Handler plugins (agent, push, poll, PR, local-exec) | `tools/autonomous-factory/src/handlers/` |
| Session submodules (shared, readiness, triage, events) | `tools/autonomous-factory/src/session/` |
| Failure triage & routing | `tools/autonomous-factory/src/triage.ts` · `src/triage/` |
| Agent prompt factory | `tools/autonomous-factory/src/agents.ts` |
| Tool call harness & circuit breaker | `tools/autonomous-factory/src/tool-harness.ts` |
| APM compiler + context loader | `tools/autonomous-factory/src/apm-compiler.ts` · `apm-context-loader.ts` |
| Pre-flight checks | `tools/autonomous-factory/src/preflight.ts` |
| Lifecycle hooks | `tools/autonomous-factory/src/hooks.ts` |
| Pipeline reporting | `tools/autonomous-factory/src/reporting.ts` |
| Git-based auto-skip | `tools/autonomous-factory/src/auto-skip.ts` |
| Retry/revert prompt injection | `tools/autonomous-factory/src/context-injection.ts` |
| Feature archiving | `tools/autonomous-factory/src/archive.ts` |
| State machine API binding | `tools/autonomous-factory/src/state.ts` |
| GitHub Actions workflow | `.github/workflows/agentic-feature.yml` |

### How to Run

**Locally (devcontainer):**
```bash
npm run pipeline:init <slug> <type>   # Initialize pipeline state
npm run agent:run -- --app apps/sample-app <slug>   # Run for sample-app
npm run agent:run -- --app apps/commerce-storefront <slug>   # Run for commerce-storefront
# Optional: BASE_BRANCH=develop npm run agent:run -- --app apps/sample-app <slug>
```

**In CI (GitHub Actions):**
Trigger the `agentic-feature.yml` workflow via `workflow_dispatch` with a feature slug, workflow type, and optional base branch.

### Architecture

The orchestrator is a deterministic `while` loop that:
1. Builds the roam-code semantic graph index (Phase 0, non-fatal)
2. Compiles APM context — resolves `.apm/apm.yml` instructions, MCP servers, and skills into a cached `context.json`, validates all agent token budgets (fatal on exceed)
3. Runs pre-flight checks: junk file detection, in-progress artifact scan, cloud CLI auth via `hooks.preflightAuth`
4. Reads pipeline state via `getNextAvailable()` to find parallelizable items
5. Routes each item to a handler plugin via `resolveHandler()` — `copilot-agent` (LLM sessions), `git-push` (deterministic push), `github-ci-poll` (CI polling), `github-pr-publish` (PR promotion), `local-exec` (script execution)
6. For LLM agents: builds prompt via `getAgentConfig(key, context, compiled)` — thin template + APM-assembled rules, then spins up `@github/copilot-sdk` sessions — in parallel when multiple items are ready
7. Writes a `_CHANGES.json` change manifest (with per-step doc-notes) before the `docs-archived` session
8. Waits for handlers to complete or fail
9. Advances to the next batch of ready items
10. After `publish-pr` completes, deterministically archives feature files from `in-progress/` to `archive/features/<slug>/`
11. Injects downstream failure context into dev agents during redevelopment cycles (post-deploy error details)

### Hard Rules

- **State management:** Pipeline state is managed by `tools/autonomous-factory/pipeline-state.mjs`. Use `npm run pipeline:complete/fail/reset-ci`. Never edit `_TRANS.md` or `_STATE.json` directly.
- **Git operations:** Use `tools/autonomous-factory/agent-commit.sh` for commits, `tools/autonomous-factory/agent-branch.sh` for branching. No raw `git add/commit/push`.
- **Branch model:** All work happens on a single `feature/<slug>` branch. PR to the base branch (default: `main`, configurable via `BASE_BRANCH` env var) is the final administrative step.
- **Prompt rules:** Coding rules live in `apps/<your-app>/.apm/instructions/` (single source of truth), declared in `.apm/apm.yml`. The APM compiler resolves per-agent instruction sets and validates token budgets.
- **Post-deploy failure rerouting:** When `live-ui` or `integration-test` fails, the orchestrator triages the error and resets the appropriate dev items for redevelopment. Max 5 redevelopment cycles.
- **Clean-slate revert:** When a dev agent fails ≥ 3 times (in-memory attempts or persisted redevelopment cycles), the orchestrator injects a warning advising `agent-branch.sh revert` to wipe the feature branch and rebuild from scratch. The circuit breaker grants one bypass to allow this.
- **Cognitive circuit breaker:** Per-agent tool call limits (`toolLimits` in `.apm/apm.yml`). Soft limit injects a frustration prompt into the tool result via `tool.execution_complete`; hard limit force-disconnects. Resolution: per-agent `toolLimits` → `config.defaultToolLimits` (currently 60/80) → code fallback (30/40).
- **Hard limits:** 10 retry attempts per failing item, 3 re-deploy cycles (configurable via `max_redeploy_cycles` in `workflows.yml`), 5 redevelopment cycles per feature.
