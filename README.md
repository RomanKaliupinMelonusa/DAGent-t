# DAGent — Deterministic Agentic Coding Pipeline

Write a spec. Get a tested Pull Request.

DAGent is a headless, DAG-scheduled AI coding pipeline. Specialist agents hand off through a dependency-aware state machine with self-healing recovery, real browser testing, and CI/CD integration — zero human interaction between spec and code review.

> The engine is cloud- and framework-agnostic; each app declares its own stack in a manifest. This repo ships the engine plus two reference apps:
> - **[apps/commerce-storefront/](apps/commerce-storefront/)** — Salesforce B2C Commerce Cloud **PWA Kit** storefront (headless React + SCAPI, deployed to Managed Runtime). **The primary, actively-developed target — all recent engine changes land here first.** Runs the `storefront` workflow: blind-to-impl SDET, machine-checkable acceptance contract, pre-feature noise baseline, local Playwright E2E before deploy, SaaS Managed Runtime (no infra wave).
> - **[apps/sample-app/](apps/sample-app/)** — Azure reference app (Functions + Static Web Apps + APIM + Terraform). Demonstrates infra-and-app two-wave pipelines with elevated-approval ChatOps. **⚠️ Not yet fully migrated to the current engine architecture and APM configuration conventions — its pipeline may not run end-to-end. Use the storefront app as the working reference; sample-app is kept for the two-wave / elevated-approval patterns it demonstrates.**

---

## What it does

- **Takes a feature spec** (passed to `agent:run --spec-file <path>`) and delivers a Pull Request.
- **A roster of specialist agents per app** — schema, backend, frontend/storefront, unit tests, E2E author, QA adversary, infra, docs, triage — runs concurrently when their dependencies allow it. The storefront pipeline adds a spec-compiler that emits a machine-checkable `ACCEPTANCE.yml`, a baseline-analyzer for noise filtering, and a blind-to-impl test author that cannot read feature source.
- **Self-heals production failures** — when live integration or browser tests fail, the pipeline classifies the error, resets the responsible agents, and feeds them the exact failure evidence.
- **Human-in-the-loop only when necessary** — infra requiring elevated privileges pauses for a PR-comment approval (`/dagent apply-elevated`).
- **Deterministic safety rails** — every git operation goes through a wrapper, every pipeline state transition goes through a single kernel, tool-call limits and retry budgets are hard constraints the LLM cannot override.

## Key features

| Feature | What it means in practice |
|---|---|
| **DAG-scheduled parallel execution** | Independent agents (backend + frontend) run concurrently; dependent stages wait. Each app defines its own workflow DAG (sample-app: `full-stack`, `backend`; storefront: `storefront`). |
| **APM manifest per app** | Each agent receives only the rules its role needs, assembled from modular `.md` fragments, with enforced per-agent token budgets and per-agent write-path sandboxes. |
| **Structural code intelligence** | Pre-indexed semantic graph via [roam-code](https://github.com/Cranot/roam-code) — tree-sitter, 27 languages, 102 MCP tools. Agents query the graph instead of text-searching. |
| **Live browser testing** | Playwright scenarios run against the live app — headless Chromium against the deployed Azure sample-app, or against the local dev server for the storefront (with a QA adversary pass that attempts to falsify acceptance criteria). |
| **Blind-to-impl test authoring** | In the storefront pipeline, the E2E author and QA adversary can read the spec and acceptance contract but are denied reads of feature source — preventing tests from being reverse-engineered to match a buggy implementation. |
| **Self-healing redevelopment** | Up to 5 redevelopment cycles per feature, bounded by hard circuit breakers on identical errors and cognitive tool-call limits. |
| **CI/CD as a first-class stage** | Deploy workflows are deterministic shell steps (no LLM), polled for completion, with targeted auto-repair on failure. |
| **Execution audit trail** | Every run produces `_SUMMARY.md` (metrics), `_TERMINAL-LOG.md` (full trace), `_PLAYWRIGHT-LOG.md` (browser actions), `_CHANGES.json` (structured change manifest). |
| **ChatOps control plane** | `/dagent apply-elevated`, `/dagent hold`, `/dagent resume` — human control via PR comments when automation needs a hand. |

## Quick start

### 1. Open in DevContainer

A DevContainer is **required** — it provides Node 22, Python 3.11, Azure CLI, GitHub CLI, Playwright + Chromium, and roam-code pre-configured.

- **VS Code:** clone → `Ctrl+Shift+P` → *Dev Containers: Reopen in Container*
- **GitHub Codespaces:** Code → Codespaces → Create codespace on main

### 2. Configure CI/CD

The pipeline deploys and runs live tests — so each target app needs its credentials wired up first.

- **storefront (PWA Kit):** requires Salesforce B2C Commerce credentials and Managed Runtime API keys. See [apps/commerce-storefront/README.md](apps/commerce-storefront/README.md) and the deploy workflow at [.github/workflows/deploy-storefront.yml](.github/workflows/deploy-storefront.yml).
- **sample-app (Azure):** requires Azure OIDC federated credentials and GitHub Secrets. Full bootstrap in [.github/AGENTIC-WORKFLOW.md](.github/AGENTIC-WORKFLOW.md#bootstrap-sequence-first-time-setup) — run it manually or hand it to a coding agent.

### 3. Run the pipeline

Pick a target app. The commands below show both; substitute the app path you want to drive.

```bash
# Authenticate (inside DevContainer)
gh auth login

# For the Azure sample-app only:
az login --scope https://graph.microsoft.com/.default   # Graph scope required by azuread Terraform provider
az account set --subscription "<your-subscription-id>"

# Write your spec anywhere — it'll be staged into `_kickoff/spec.md` by the pipeline.
$EDITOR /tmp/my-feature-spec.md

# ---- storefront (PWA Kit) ----
npm run agent:run -- \
  --app apps/commerce-storefront \
  --workflow storefront \
  --spec-file /tmp/my-feature-spec.md \
  my-feature

# ---- sample-app (Azure) ----
npm run agent:run -- \
  --app apps/sample-app \
  --workflow full-stack \
  --spec-file /tmp/my-feature-spec.md \
  my-feature

# Review the PR when the pipeline completes
```

One command per feature. Branch creation and spec staging are the first two DAG nodes (`create-branch`, `stage-spec`); `_STATE.json` is seeded in-process when absent. Resuming an interrupted run is the same command — both scaffolding nodes are idempotent.

### Use with your own project

1. Copy an existing app folder that matches your stack — [apps/commerce-storefront/](apps/commerce-storefront/) for a PWA Kit / Managed-Runtime target, or [apps/sample-app/](apps/sample-app/) for an Azure full-stack target.
2. Edit `.apm/apm.yml` — URLs, resource names, agent instructions, deploy targets, per-agent write-path sandboxes.
3. Customise instruction fragments under `.apm/instructions/` and the workflow DAG under `.apm/workflows.yml`.
4. Point CI workflows at your app path.
5. `npm run agent:run -- --app apps/your-app --workflow <name> --spec-file /path/to/spec.md my-feature`.

For a fundamentally different stack (AWS, GCP, on-prem), swap the lifecycle hooks in `.apm/hooks/*.sh` and the identity files in `.apm/instructions/`. Engine source requires zero changes — see [tools/autonomous-factory/README.md — Evolution Notes](tools/autonomous-factory/README.md#evolution-notes).

## Reference apps — what each demonstrates

**storefront (PWA Kit)** — [apps/commerce-storefront/](apps/commerce-storefront/)
- Salesforce B2C Commerce Cloud PWA Kit on the Retail React App base template, using [Template Extensibility](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/guide/template-extensibility.html) overrides under `overrides/app/`.
- SCAPI-backed, 17-locale translations, SSR worker, deployed to Salesforce Managed Runtime.
- Pipeline highlights: `spec-compiler` → `ACCEPTANCE.yml` contract, `baseline-analyzer` for pre-feature noise capture, `storefront-dev` / `storefront-debug` (roam-code + Playwright reproduction), `e2e-author` + `qa-adversary` in blind-to-impl mode, local dev server E2E before Managed Runtime push.
- Uses Salesforce B2C Commerce authentication; see its own [README](apps/commerce-storefront/README.md).

**sample-app (Azure)** — [apps/sample-app/](apps/sample-app/)
- Azure Functions backend, Static Web Apps frontend, APIM facade, Terraform-provisioned infrastructure (azurerm + azapi + azuread).
- Pipeline highlights: two-wave infra-then-app execution, elevated-privilege approval via PR ChatOps (`/dagent apply-elevated`), live-UI agent tests against deployed endpoints.
- Dual-mode auth: `demo` credentials (`demo` / `demopass`) for unauthenticated pipelines, `entra` mode for Azure AD SSO. Toggle via `AUTH_MODE` / `NEXT_PUBLIC_AUTH_MODE`. See [apps/sample-app/infra/README.md](apps/sample-app/infra/README.md).

## Documentation

| If you want to… | Start here |
|---|---|
| **Use the pipeline** | This README + [.github/AGENTIC-WORKFLOW.md](.github/AGENTIC-WORKFLOW.md) (operational runbook) |
| **Understand the architecture** | [tools/autonomous-factory/README.md](tools/autonomous-factory/README.md) — layers, paradigm, scaling, tech debt |
| **Contribute to the engine** | Layer-level READMEs under [tools/autonomous-factory/src/](tools/autonomous-factory/src/) — one per folder |
| **Read about the design decisions** | [narrative/](narrative/) — essays on the patterns and trade-offs |
| **Extend an agent** | [tools/autonomous-factory/docs/03-apm-context.md](tools/autonomous-factory/docs/03-apm-context.md) + [docs/05-agents.md](tools/autonomous-factory/docs/05-agents.md) |
| **Understand self-healing** | [tools/autonomous-factory/docs/01-watchdog.md](tools/autonomous-factory/docs/01-watchdog.md) + [docs/04-state-machine.md](tools/autonomous-factory/docs/04-state-machine.md) |
| **Map to traditional SDLC** | [tools/autonomous-factory/docs/07-mental-model.md](tools/autonomous-factory/docs/07-mental-model.md) |

## Tech stack

**Engine:** TypeScript · `@github/copilot-sdk` · `@anthropic-ai/sdk` · Zod · Node 22 · GitHub Actions · Playwright · [roam-code](https://github.com/Cranot/roam-code)

**commerce-storefront:** Salesforce B2C Commerce Cloud PWA Kit · Retail React App · SCAPI · Managed Runtime

**sample-app:** Azure Functions · Azure Static Web Apps · APIM · Terraform (azurerm + azapi + azuread)

## License & status

Open source. Active development. Issues and pull requests welcome.

---

*Looking for the old ARCHITECTURE.md / HOW-IT-WORKS.md / PIPELINE-UPDATES.md? The technical content lives in [tools/autonomous-factory/README.md](tools/autonomous-factory/README.md) and the layer-level READMEs. The narrative posts (design rationale, post-mortems) moved to [narrative/](narrative/).*
