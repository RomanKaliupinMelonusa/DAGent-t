# Specialist Agents — Catalog & Configuration

> 18 pipeline items across 6 phases (two-wave architecture). LLM-driven agents, deterministic script bypasses, and one human gate. Each agent gets its own Copilot SDK session with tailored prompt, model, and MCP servers.
> Source: `tools/autonomous-factory/src/agents.ts` (~1600 lines)

---

## Agent-to-Phase Map

```mermaid
flowchart TB
    subgraph INFRA["Wave 1: Infrastructure"]
        direction LR
        A1["🔧 schema-dev\nShared Zod v4 schemas\n(@branded/schemas)"]
        A2["🏗️ infra-architect\nTerraform HCL\n+ validate + plan"]
        A3["🚀 push-infra\nDeterministic push\n(no LLM)"]
        A4["📋 create-draft-pr\nDraft PR + TF plan\nposted as comment"]
        A5["⏳ poll-infra-plan\nPoll deploy-infra CI\n(no LLM)"]
    end

    subgraph APPROVAL["Approval Gate"]
        direction LR
        A6["⏸ await-infra-approval\nHuman reviews TF plan\n/dagent approve-infra"]
        A7["📦 infra-handoff\nCapture TF outputs →\ninfra-interfaces.md"]
    end

    subgraph PRE["Wave 2: Pre-Deploy"]
        direction LR
        A8["⚙️ backend-dev\nBackend + Infra Dev"]
        A9["🎨 frontend-dev\nNext.js 16 + React 19\n+ Playwright E2E tests"]
        A10["🧪 backend-unit-test\nJest unit tests\n+ schema validation"]
        A11["🧪 frontend-unit-test\nJest unit tests\n+ RTL"]
    end

    subgraph DEP["Deploy"]
        direction LR
        A12["🚀 push-app\nDeterministic push\n(no LLM)"]
        A13["⏳ poll-app-ci\nPoll deploy CI\n(no LLM)"]
    end

    subgraph POST["Post-Deploy"]
        direction LR
        A14["🔌 integration-test\nLive API tests\nvia APIM endpoint"]
        A15["🖥️ live-ui\nAST-driven E2E + deep\ndiagnostic interception"]
    end

    subgraph FIN["Finalize"]
        direction LR
        A16["🧹 code-cleanup\nDead code removal"]
        A17["📝 docs-archived\nArchitecture docs\nupdate"]
        A18["📦 publish-pr\nPromote Draft PR\n+ risk assessment"]
    end

    INFRA --> APPROVAL --> PRE --> DEP --> POST --> FIN

    style INFRA fill:#e8f5e9
    style APPROVAL fill:#fff9c4,stroke:#f9a825,stroke-width:2px
    style PRE fill:#e3f2fd
    style DEP fill:#fff9c4
    style POST fill:#fff3e0
    style FIN fill:#f3e5f5
```

---

## Agent Capability Matrix

| # | Agent | Phase | Type | MCP Servers | Timeout | Model | Roam Rules |
|---|-------|-------|------|-------------|---------|-------|------------|
| 1 | `schema-dev` | infra | LLM | roam | 20 min | claude-opus-4.6 | roam-tool-rules |
| 2 | `infra-architect` | infra | LLM | roam | 20 min | claude-opus-4.6 | roam-tool-rules |
| 3 | `push-infra` | infra | **Script** | — | 15 min | — | (deterministic bypass) |
| 4 | `create-draft-pr` | infra | LLM | — | 15 min | claude-opus-4.6 | (always only) |
| 5 | `poll-infra-plan` | infra | **Script** | — | 15 min | — | (deterministic bypass) |
| 6 | `await-infra-approval` | approval | **Human gate** | — | ∞ | — | (no agent — pipeline pauses) |
| 7 | `infra-handoff` | approval | LLM | — | 15 min | claude-opus-4.6 | (always only) |
| 8 | `backend-dev` | pre-deploy | LLM | roam | 20 min | claude-opus-4.6 | roam-tool-rules, roam-efficiency |
| 9 | `frontend-dev` | pre-deploy | LLM | roam | 20 min | claude-opus-4.6 | roam-tool-rules, roam-efficiency |
| 10 | `backend-unit-test` | pre-deploy | LLM | roam | 10 min | claude-opus-4.6 | roam-test-intelligence |
| 11 | `frontend-unit-test` | pre-deploy | LLM | roam | 10 min | claude-opus-4.6 | roam-test-intelligence |
| 12 | `push-app` | deploy | **Script** | — | 15 min | — | (deterministic bypass) |
| 13 | `poll-app-ci` | deploy | **Script** | — | 15 min | — | (deterministic bypass) |
| 14 | `integration-test` | post-deploy | LLM | — | 15 min | claude-opus-4.6 | integration-testing |
| 15 | `live-ui` | post-deploy | LLM | playwright, roam | 15 min | claude-opus-4.6 | roam-tool-rules, roam-test-intelligence, e2e-testing-mandate |
| 16 | `code-cleanup` | finalize | LLM | roam | 15 min | claude-opus-4.6 | roam-tool-rules |
| 17 | `docs-archived` | finalize | LLM | roam | 15 min | claude-opus-4.6 | roam-tool-rules |
| 18 | `publish-pr` | finalize | LLM | roam | 15 min | claude-opus-4.6 | roam-tool-rules |

> **Script** items execute deterministic shell commands — zero LLM tokens consumed. **Human gate** pauses the orchestrator and logs a message prompting for `/dagent approve-infra` on the Draft PR.

---

## MCP Server Assignments

```mermaid
flowchart LR
    subgraph ROAM_SERVER["🧠 roam mcp\n(local process, all tools)"]
        R["roam mcp\ncommand: roam\nargs: [mcp]\ntools: [*]"]
    end

    subgraph PW_SERVER["🎭 playwright-mcp\n(local process, chromium)"]
        P["playwright-mcp\n--headless --no-sandbox\n--browser chromium\n--save-session\n--caps vision"]
    end

    R --> A1["schema-dev"]
    R --> A2["infra-architect"]
    R --> A8["backend-dev"]
    R --> A9["frontend-dev"]
    R --> A10["backend-unit-test"]
    R --> A11["frontend-unit-test"]
    R --> A15["live-ui"]
    R --> A16["code-cleanup"]
    R --> A17["docs-archived"]
    R --> A18["publish-pr"]

    P --> A15

    subgraph NO_MCP["No MCP (scripts or minimal agents)"]
        A3["push-infra"]
        A4["create-draft-pr"]
        A5["poll-infra-plan"]
        A6["await-infra-approval"]
        A7["infra-handoff"]
        A12["push-app"]
        A13["poll-app-ci"]
        A14["integration-test"]
    end

    style ROAM_SERVER fill:#e8f5e9,stroke:#2e7d32
    style PW_SERVER fill:#e3f2fd,stroke:#1565c0
    style NO_MCP fill:#f5f5f5,stroke:#9e9e9e
```

---

## System Prompt Anatomy

Every agent's system message follows a consistent 5-block structure:

```mermaid
flowchart TD
    subgraph PROMPT["System Message Structure"]
        direction TB
        B1["🆔 Identity Block\nRole, specialization,\nexpertise description"]
        B2["📋 Context Block\nFeature slug, spec path,\nrepo root, app root,\nworkflow type"]
        B3["📏 Assembled Rules\nFrom APM compiled output\n(apm.yml → persona → rules)\nToken-budgeted, cached"]
        B4["📝 Workflow Steps\nNumbered step-by-step\ninstructions (5–12 steps)\nagent-specific"]
        B5["✅ Completion Block\npipeline:complete/fail commands\npipeline:doc-note for handoff\n(scoped to agent type)"]
    end

    B1 --> B2 --> B3 --> B4 --> B5

    style B1 fill:#e3f2fd
    style B2 fill:#fff9c4
    style B3 fill:#e8f5e9,stroke:#2e7d32,stroke-width:3px
    style B4 fill:#fff3e0
    style B5 fill:#f3e5f5
```

### Example: backend-dev Workflow Steps

| Step | Action |
|------|--------|
| 1 | Read feature spec from `in-progress/` |
| 2 | `roam_understand` — codebase briefing |
| 3 | `roam_context` — locate relevant symbols |
| 4 | `roam_preflight` — blast radius check |
| 5 | Implement changes (Azure Functions + Terraform) |
| 6 | `roam_review_change` — verify impact |
| 7 | Write/update tests |
| 8 | `roam_check_rules` — SEC/PERF/COR/ARCH gate |
| 9 | `agent-commit.sh` — scoped commit |
| 10 | `pipeline:doc-note` — architectural summary for docs-expert |

---

## Doc-Note Handoff Pattern

```mermaid
sequenceDiagram
    participant BD as backend-dev
    participant PS as pipeline-state
    participant CJ as _CHANGES.json
    participant DA as docs-archived

    BD->>PS: pipeline:doc-note slug backend-dev<br/>"Added fn-generate with structured<br/>outputs via BrandedAgentService"
    PS->>PS: Store in _STATE.json<br/>item.docNote

    Note over CJ: Watchdog writes<br/>_CHANGES.json before<br/>docs-archived session

    PS-->>CJ: All doc-notes collected
    CJ-->>DA: Read _CHANGES.json<br/>+ per-item doc-notes
    DA->>DA: Update architecture docs<br/>based on change summaries
```

> Dev agents leave 1–2 sentence architectural summaries via `pipeline:doc-note`. The `docs-archived` agent reads all doc-notes via `_CHANGES.json` to update documentation without re-analyzing the entire codebase.

---

## Auto-Skip Optimization

```mermaid
flowchart TD
    START["Test item starts\n(backend-unit-test or\nfrontend-unit-test)"]

    START --> REF["Get git ref:\ndev step snapshot\nor merge-base"]
    REF --> DIFF["git diff --name-only\nsince ref"]

    DIFF --> CHECK{"Changed files\nin relevant area?"}

    CHECK -->|"backend files changed"| RUN_B["Run backend-unit-test"]
    CHECK -->|"frontend files changed"| RUN_F["Run frontend-unit-test"]
    CHECK -->|"No relevant changes"| SKIP["⏭ Auto-skip\ncompleteItem() immediately"]

    SKIP --> LOG["Log: 'Auto-skipped:\nno changes detected since\ndev step'"]

    style SKIP fill:#fff9c4
    style RUN_B fill:#e8f5e9
    style RUN_F fill:#e8f5e9
```

> Auto-skip prevents running test suites when the corresponding dev step made no changes. Detects this via `git diff --name-only` against a per-step snapshot or merge-base ref.

---

## Agent Prompt Builders

| Function | Agent(s) | Key Content |
|----------|----------|-------------|
| `schemaDevPrompt()` | schema-dev | Zod v4 schemas, @branded/schemas, validate:schemas |
| `infraArchitectPrompt()` | infra-architect | IaC validate + plan, infra-interfaces.md (identity from APM instructions) |
| `infraHandoffPrompt()` | infra-handoff | Capture `terraform output -json`, write infra-interfaces.md |
| `backendDevPrompt()` | backend-dev | Backend + infra dev, TypeScript (identity from APM instructions). **Dual-scope commits:** app changes via `backend` scope, `.github/workflows/` changes via `cicd` scope |
| `frontendDevPrompt()` | frontend-dev | Next.js 16, React 19, Playwright E2E mandate. **Dual-scope commits:** app changes via `frontend` scope, `.github/workflows/` changes via `cicd` scope |
| `backendTestPrompt()` | backend-unit-test, integration-test | Jest unit tests (pre-deploy) OR integration tests (post-deploy) |
| `frontendUiTestPrompt()` | frontend-unit-test, live-ui | Jest (pre-deploy) OR AST-driven Playwright E2E with deep diagnostic interception (post-deploy) |
| `deployManagerPrompt()` | push-infra, push-app | Deterministic push via `agent-commit.sh` (no LLM fallback) |
| `pollCiPrompt()` | poll-infra-plan, poll-app-ci | Deterministic CI polling via `poll-ci.sh` (no LLM fallback) |
| `prCreatorPrompt()` | create-draft-pr, publish-pr | Draft PR creation (Wave 1) or promote to ready-for-review + risk assessment (finalize) |
| `codeCleanupPrompt()` | code-cleanup | roam_flag_dead, roam_orphan_routes, roam_dark_matter |
| `docsExpertPrompt()` | docs-archived | _CHANGES.json, doc-notes, architecture docs |

---

## Agent Roam Tool Usage Summary

```mermaid
flowchart TB
    subgraph DEV_AGENTS["Dev Agents (schema/backend/frontend)"]
        direction LR
        DE1["roam_understand"]
        DE2["roam_context"]
        DE3["roam_search_symbol"]
        DE4["roam_explore"]
        DE5["roam_preflight"]
        DE6["roam_prepare_change"]
        DE7["roam_review_change"]
        DE8["roam_affected_tests"]
        DE9["roam_check_rules"]
        DE10["roam_syntax_check"]
        DE11["roam_mutate"]
    end

    subgraph TEST_AGENTS["Test Agents (backend/frontend-unit-test, live-ui)"]
        direction LR
        TE1["roam_test_gaps"]
        TE2["roam_testmap"]
        TE3["roam_affected_tests"]
    end

    subgraph CLEANUP_AGENT["Cleanup Agent"]
        direction LR
        CL1["roam_flag_dead"]
        CL2["roam_orphan_routes"]
        CL3["roam_dark_matter"]
        CL4["roam_safe_delete"]
        CL5["roam_mutate"]
    end

    subgraph DOCS_AGENT["Docs Agent"]
        direction LR
        DO1["roam_semantic_diff"]
        DO2["roam_doc_staleness"]
    end

    subgraph PR_AGENT["PR Agent"]
        direction LR
        PR1["roam_index"]
        PR2["roam_pr_diff"]
        PR3["roam_pr_risk"]
        PR4["roam_suggest_reviewers"]
    end

    style DEV_AGENTS fill:#e3f2fd
    style TEST_AGENTS fill:#f3e5f5
    style CLEANUP_AGENT fill:#fff3e0
    style DOCS_AGENT fill:#e0f2f1
    style PR_AGENT fill:#fce4ec
```

---

## Monorepo Scoping Rule

```mermaid
flowchart LR
    BAD["❌ roam_context apiClient"]
    GOOD["✅ roam_context apiClient apps/sample-app"]

    BAD -->|"May read across\napp boundaries"| RISK["Cross-boundary\nresults"]
    GOOD -->|"Scoped to\napp root"| SAFE["Precise\nresults"]

    style BAD fill:#ffcdd2
    style GOOD fill:#c8e6c9
```

> All dev agents must append `${appRoot}` (e.g., `apps/sample-app`) to roam commands to avoid reading symbols from other apps in the monorepo.

---

## Failure Classification & Triage Routing

When post-deploy or test items fail, `triageFailure()` in `triage.ts` (called from `session-runner.ts`) routes the fix to the responsible dev agent. Triage is **4-tiered** — evaluated in order:

| Tier | Source | Example | Routing |
|:---:|---|---|---|
| **0** | Unfixable signals | `authorization_requestdenied`, `error acquiring state lock` | `[]` — halt pipeline, salvage Draft PR |
| **1** | Agent JSON `fault_domain` | `{"fault_domain":"backend"}` | Deterministic: backend-dev + backend-unit-test |
| **2** | CI `DOMAIN:` header | `DOMAIN: backend,frontend` | Job-based: schemas cascade to all |
| **3** | Legacy keywords | `api`, `500`, `cors`, `/backend/` | Fallback; no-match → `[itemKey]` only |

### Fault Domain Routing

| Fault Domain | Items Reset |
|---|---|
| `backend` | backend-dev, backend-unit-test |
| `frontend` | frontend-dev, frontend-unit-test |
| `both` | backend-dev, backend-unit-test, frontend-dev, frontend-unit-test |
| `backend+infra` | backend-dev, backend-unit-test |
| `frontend+infra` | frontend-dev, frontend-unit-test |
| `infra` | infra-architect |
| `cicd` | push-app, poll-app-ci |
| `deployment-stale` | push-app, poll-app-ci (code correct — re-deploy only) |
| `environment` | itemKey only (retry, not a code bug) |
| `blocked` | `[]` — halt pipeline (unfixable) |

---

*← [04 State Machine](04-state-machine.md) · [06 Roadmap →](06-roadmap/)*
