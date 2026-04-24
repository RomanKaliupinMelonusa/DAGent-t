# Pipeline State Machine — DAG & Lifecycle

> 21 main pipeline items + 2 triage nodes across 7 phases (Wave 0 scaffolding, two-wave app-and-infra architecture, triage rerouting), dependency-aware parallel scheduling, workflow type variations.
> Source: `tools/autonomous-factory/src/kernel/pipeline-kernel.ts` (state authority) · `tools/autonomous-factory/src/adapters/json-file-state-store.ts` (persistence) · `tools/autonomous-factory/src/cli/pipeline-state.ts` (admin CLI) · `apps/sample-app/.apm/workflows.yml` (full-stack DAG)
> Hub: [AGENTIC-WORKFLOW.md](../../.github/AGENTIC-WORKFLOW.md)

---

## Full DAG — `full-stack` Workflow (Two-Wave + Scaffolding)

> This is the **dependency-level** view — which items depend on which and what can run in parallel. For the full engine architecture see [../README.md](../README.md). For how these items map to traditional SDLC stages, see [07-mental-model.md](07-mental-model.md).

The pipeline has three structural phases:

- **Wave 0 (Scaffolding)** — `create-branch`, `stage-spec`. Pipeline-agnostic bootstrap: creates the feature branch and materialises `_kickoff/spec.md` from the supplied `--spec-file`. Executed as regular DAG nodes (not preflight hooks) so they participate in the invocation ledger.
- **Wave 1 (Infrastructure)** — Schemas, Terraform, push, Draft PR, plan CI, human approval, handoff.
- **Wave 2 (Application)** — Backend + frontend dev/test, deploy, post-deploy verification, finalize.

Wave 2 cannot start until the infrastructure approval gate is cleared and `infra-handoff` has written `infra-interfaces.md` with deployed resource URLs. Every failure route passes through a dedicated triage node (`triage-full-stack`) which fans back into dev nodes; `deep-debug` is an optional diagnostic companion that can be scheduled by triage.

```mermaid
flowchart LR
    subgraph SCAFFOLD["Wave 0: Scaffolding"]
        CB["create-branch"]
        SS["stage-spec"]
    end

    subgraph INFRA["Wave 1: Infrastructure"]
        SD["schema-dev"]
        IA["infra-architect"]
        PI["push-infra"]
        DPR["create-draft-pr"]
        PIP["poll-infra-plan"]
    end

    subgraph APPROVAL["Approval Gate"]
        AIA["⏸ await-infra-approval\n(human gate)"]
        IH["infra-handoff"]
    end

    subgraph PRE["Wave 2: Pre-Deploy"]
        BD["backend-dev"]
        FD["frontend-dev"]
        BUT["backend-unit-test"]
        FUT["frontend-unit-test"]
    end

    subgraph DEPLOY["Deploy"]
        PA["push-app"]
        PAC["poll-app-ci"]
    end

    subgraph POST["Post-Deploy"]
        IT["integration-test"]
        LU["live-ui"]
    end

    subgraph FINAL["Finalize"]
        CC["code-cleanup"]
        DA["docs-archived"]
        DARC["doc-architect"]
        PPR["publish-pr"]
    end

    subgraph TRIAGE["Triage (on-failure)"]
        TFS["triage-full-stack"]
        DD["deep-debug (optional)"]
    end

    CB --> SS --> SD --> IA --> PI --> DPR --> PIP --> AIA --> IH
    SD & IH --> BD & FD
    BD --> BUT
    FD --> FUT
    BUT & FUT --> PA --> PAC
    PAC --> IT & LU
    IT & LU --> CC
    CC --> DA
    DA --> DARC
    DARC --> PPR

    POST -.on failure.-> TFS
    DEPLOY -.on failure.-> TFS
    PRE -.on failure.-> TFS
    TFS -.resets dev nodes.-> PRE

    style SCAFFOLD fill:#f5f5f5
    style INFRA fill:#e8f5e9
    style APPROVAL fill:#fff9c4,stroke:#f9a825,stroke-width:2px
    style PRE fill:#e3f2fd
    style DEPLOY fill:#fff9c4
    style POST fill:#fff3e0
    style FINAL fill:#f3e5f5
    style TRIAGE fill:#ffebee,stroke:#c62828,stroke-width:1px
```

### Dependency Table

| Item | Phase | Depends On | Can Run In Parallel With |
|------|-------|-----------|------------------------|
| `create-branch` | scaffolding | — | (first) |
| `stage-spec` | scaffolding | create-branch | — |
| `schema-dev` | infra | stage-spec | — |
| `infra-architect` | infra | schema-dev | — |
| `push-infra` | infra | infra-architect | — |
| `create-draft-pr` | infra | push-infra | — |
| `poll-infra-plan` | infra | create-draft-pr | — |
| `await-infra-approval` | approval | poll-infra-plan | — ⏸ human gate |
| `infra-handoff` | approval | await-infra-approval | — |
| `backend-dev` | pre-deploy | schema-dev, infra-handoff | frontend-dev |
| `frontend-dev` | pre-deploy | schema-dev, infra-handoff | backend-dev |
| `backend-unit-test` | pre-deploy | backend-dev | frontend-unit-test |
| `frontend-unit-test` | pre-deploy | frontend-dev | backend-unit-test |
| `push-app` | deploy | backend-unit-test, frontend-unit-test | — |
| `poll-app-ci` | deploy | push-app | — |
| `integration-test` | post-deploy | poll-app-ci | — |
| `live-ui` | post-deploy | poll-app-ci, integration-test | — |
| `code-cleanup` | finalize | integration-test, live-ui | — |
| `docs-archived` | finalize | code-cleanup | — |
| `doc-architect` | finalize | code-cleanup, docs-archived | — |
| `publish-pr` | finalize | doc-architect | — |
| `triage-full-stack` | triage | (activated on `on_failure`) | — |
| `deep-debug` | triage | (optional, scheduled by triage) | — |

---

## Workflow Types

Each workflow type prunes irrelevant items when `_STATE.json` is seeded — either by `agent:run --workflow <name>` on the happy path or by `pipeline:init` as an admin escape hatch. All types run Wave 1 (infra), approval gate, and finalize phases; pruning targets Wave 2 app items.

```mermaid
flowchart TB
    subgraph FS["Full-Stack (all 19 items)"]
        direction LR
        FS1["schema-dev"] --> FS_IA["infra-architect"] --> FS_PI["push-infra"] --> FS_DPR["create-draft-pr"] --> FS_PIP["poll-infra-plan"] --> FS_AIA["⏸ approval"] --> FS_IH["infra-handoff"]
        FS1 & FS_IH --> FS2["backend-dev"] & FS3["frontend-dev"]
        FS2 --> FS4["backend-unit-test"]
        FS3 --> FS5["frontend-unit-test"]
        FS4 & FS5 --> FS6["push-app"] --> FS7["poll-app-ci"]
        FS7 --> FS8["integration-test"] --> FS9["live-ui"]
        FS9 --> FS10["code-cleanup"] --> FS11["docs-archived"] --> FS_DARC["doc-architect"] --> FS12["publish-pr"]
    end

    subgraph BE["Backend (N/A: frontend-dev, frontend-unit-test, live-ui)"]
        direction LR
        BE1["schema-dev"] --> BE_IA["infra-architect"] --> BE_PI["push-infra"] --> BE_DPR["create-draft-pr"] --> BE_PIP["poll-infra-plan"] --> BE_AIA["⏸ approval"] --> BE_IH["infra-handoff"]
        BE1 & BE_IH --> BE2["backend-dev"]
        BE2 --> BE4["backend-unit-test"]
        BE4 --> BE6["push-app"] --> BE7["poll-app-ci"]
        BE7 --> BE8["integration-test"]
        BE8 --> BE10["code-cleanup"] --> BE11["docs-archived"] --> BE_DARC["doc-architect"] --> BE12["publish-pr"]
    end

    subgraph FE["Frontend (N/A: schema-dev, backend-dev, backend-unit-test, integration-test)"]
        direction LR
        FE_IA["infra-architect"] --> FE_PI["push-infra"] --> FE_DPR["create-draft-pr"] --> FE_PIP["poll-infra-plan"] --> FE_AIA["⏸ approval"] --> FE_IH["infra-handoff"]
        FE_IH --> FE3["frontend-dev"]
        FE3 --> FE5["frontend-unit-test"]
        FE5 --> FE6["push-app"] --> FE7["poll-app-ci"]
        FE7 --> FE9["live-ui"]
        FE9 --> FE10["code-cleanup"] --> FE11["docs-archived"] --> FE_DARC["doc-architect"] --> FE12["publish-pr"]
    end

    subgraph INF["Infra (N/A: all Wave 2 app items + doc-architect)"]
        direction LR
        INF1["schema-dev"] --> INF_IA["infra-architect"] --> INF_PI["push-infra"] --> INF_DPR["create-draft-pr"] --> INF_PIP["poll-infra-plan"] --> INF_AIA["⏸ approval"] --> INF_IH["infra-handoff"]
        INF_IH --> INF11["docs-archived"] --> INF12["publish-pr"]
    end

    subgraph AO["App-Only (N/A: schema-dev, infra-architect, push-infra, poll-infra-plan, await-infra-approval, infra-handoff)"]
        direction LR
        AO_DPR["create-draft-pr"]
        AO2["backend-dev"] & AO3["frontend-dev"]
        AO2 --> AO4["backend-unit-test"]
        AO3 --> AO5["frontend-unit-test"]
        AO4 & AO5 --> AO6["push-app"] --> AO7["poll-app-ci"]
        AO7 --> AO8["integration-test"] --> AO9["live-ui"]
        AO9 --> AO10["code-cleanup"] --> AO11["docs-archived"] --> AO_DARC["doc-architect"] --> AO12["publish-pr"]
    end

    subgraph BON["Backend-Only (N/A: infra items + frontend-dev, frontend-unit-test, live-ui)"]
        direction LR
        BON_DPR["create-draft-pr"]
        BON2["backend-dev"]
        BON2 --> BON4["backend-unit-test"]
        BON4 --> BON6["push-app"] --> BON7["poll-app-ci"]
        BON7 --> BON8["integration-test"]
        BON8 --> BON10["code-cleanup"] --> BON11["docs-archived"] --> BON_DARC["doc-architect"] --> BON12["publish-pr"]
    end

    style FS fill:#e8f5e9
    style BE fill:#e3f2fd
    style FE fill:#fff3e0
    style INF fill:#f3e5f5
    style AO fill:#e0f2f1
    style BON fill:#fce4ec
```

### N/A Items Per Workflow Type

| Workflow | Skipped Items (auto-N/A) | Active Count |
|----------|-------------------------|:---:|
| **Full-Stack** | (none) | 19 |
| **Backend** | `frontend-dev`, `frontend-unit-test`, `live-ui` | 16 |
| **Frontend** | `backend-dev`, `backend-unit-test`, `integration-test`, `schema-dev` | 15 |
| **Infra** | `frontend-dev`, `frontend-unit-test`, `backend-dev`, `backend-unit-test`, `integration-test`, `live-ui`, `code-cleanup`, `push-app`, `poll-app-ci`, `doc-architect` | 9 |
| **App-Only** | `infra-architect`, `push-infra`, `poll-infra-plan`, `await-infra-approval`, `infra-handoff` | 14 |
| **Backend-Only** | `infra-architect`, `push-infra`, `poll-infra-plan`, `await-infra-approval`, `infra-handoff`, `frontend-dev`, `frontend-unit-test`, `live-ui` | 11 |

> **Note:** `create-draft-pr`, `docs-archived`, and `publish-pr` are always active for **all** workflow types. `schema-dev` runs for all types except Frontend. The Infra workflow type skips all Wave 2 app items — only the infra wave + docs + PR run. App-Only and Backend-Only skip all Wave 1 infra items (except `create-draft-pr`).

---

## Item Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: initState()

    pending --> na: workflow type\nexclusion

    pending --> running: getNextAvailable()\n→ runItemSession()

    running --> done: completeItem()
    running --> failed: session error/timeout

    failed --> pending: attempt < 10\n(retry with injected context)
    failed --> halted: attempt = 10\n(hard limit reached)

    done --> [*]
    na --> [*]
    halted --> [*]

    note right of pending
        DAG-aware: only becomes
        available when all
        dependencies are "done"
    end note

    note right of failed
        Error logged with
        timestamp + message
        in errorLog[]
    end note
```

---

## Redevelopment Reroute Flow

> This is the **implementation-level** view showing function calls between modules. For the failure recovery state machine with all transition states, see [01-watchdog.md](01-watchdog.md#failure-recovery). For how this replaces traditional manual debugging, see [07-mental-model.md](07-mental-model.md#what-the-recovery-loop-replaces).

```mermaid
sequenceDiagram
    participant W as watchdog.ts /\nloop/pipeline-loop.ts
    participant TF as triageFailure()
    participant S as state.ts
    participant PS as PipelineKernel +\nJsonFileStateStore
    participant R as roam index

    Note over W: Post-deploy or test item<br/>(poll-app-ci, poll-infra-plan,<br/>integration-test, live-ui,<br/>backend-unit-test, frontend-unit-test) fails

    W->>TF: triageFailure(itemKey, errorMessage)

    alt Tier 0: Unfixable signal detected
        TF-->>W: route → [] (empty — halt pipeline immediately)
        Note over W: 🛑 Graceful degradation:<br/>salvage Draft PR
    else Structured JSON: fault_domain=backend
        TF-->>W: route → backend-dev, backend-unit-test
    else Structured JSON: fault_domain=frontend
        TF-->>W: route → frontend-dev, frontend-unit-test
    else Structured JSON: fault_domain=both
        TF-->>W: route → backend-dev, backend-unit-test, frontend-dev, frontend-unit-test
    else Structured JSON: fault_domain=infra
        TF-->>W: route → infra-architect
    else Structured JSON: fault_domain=cicd
        TF-->>W: route → push-app, poll-app-ci
    else Structured JSON: fault_domain=deployment-stale
        TF-->>W: route → push-app, poll-app-ci (code correct — re-deploy only)
    else Structured JSON: fault_domain=environment
        TF-->>W: route → itemKey only (not a code bug)
    else Structured JSON: fault_domain=blocked
        TF-->>W: route → [] (empty — halt pipeline)
    else CI metadata: DOMAIN=backend
        TF-->>W: route → backend-dev, backend-unit-test
    else CI metadata: DOMAIN=schemas
        TF-->>W: route → schema-dev, infra-architect + all dev/test items (cascade)
    else Keywords: API, endpoint, 500, backend
        TF-->>W: route → backend-dev, backend-unit-test
    else Keywords: UI, component, render, frontend
        TF-->>W: route → frontend-dev, frontend-unit-test
    else Keywords: packages/schemas, @branded/schemas
        TF-->>W: route → schema-dev + all dev/test items
    else Keywords: ci_run_cancelled_manually, ci is still running
        TF-->>W: route → itemKey only (environment, not a code bug)
    else Ambiguous (no keyword match)
        TF-->>W: route → itemKey only (early return — no nuke-everything fallback)
    end

    W->>S: resetForDev(slug, itemKeys, reason)
    S->>PS: resetForDev(slug, itemKeys, reason)

    Note over PS: resetForDev() also cascades:<br/>if deploy items reset,<br/>any "done" post-deploy items<br/>(integration-test, live-ui)<br/>reset to pending too

    alt cycle < 5
        PS-->>S: { state, cycleCount, halted: false }
        S-->>W: Items reset to pending
        W->>R: roam index (re-index after code changes)
        Note over W: Dev items re-enter<br/>main loop with injected<br/>failure context
    else cycle = 5
        PS-->>S: { state, cycleCount: 5, halted: true }
        S-->>W: Pipeline halted
        Note over W: 🛑 Max redevelopment<br/>cycles reached
    end
```

### poll-app-ci / poll-infra-plan Deterministic Triage Path

When `poll-app-ci` or `poll-infra-plan` fails, the orchestrator handles triage **inline** — no Copilot agent session is created. The flow is:

1. `poll-ci.sh` runs with `stdio: "pipe"` and `maxBuffer: 5MB`, filtered to the relevant workflows (app or infra) via `CI_WORKFLOW_FILTER`
2. On failure, the script fetches truncated runner logs (`gh run view --log-failed | tail -n 250`) and writes a `CI_FAILURE.log` with a `DOMAIN:` header
3. Node's `execSync` throws — the catch block extracts `err.stdout` (CI logs) and `err.stderr`
4. `failItem(slug, itemKey, capturedLogs)` persists the failure
5. `triageFailure(itemKey, capturedLogs, naItems)` routes to the correct dev items
6. `resetForDev(slug, resetKeys, errorMsg)` resets the pipeline
7. The function returns directly — no fall-through to the SDK session path

**Cancelled runs** emit `CI_RUN_CANCELLED_MANUALLY`, which is matched by an `environment`-domain signature in the triage knowledge base (or classified as `environment` by the LLM Router) → routes to environment fault domain (retry the poll item only, don't reset dev items).

**Poll timeouts** (exit code 2) trigger a transient retry loop — the polling item is retried without resetting any dev items.

**Self-mutating validation hooks:** After `poll-app-ci` succeeds, `runValidateApp()` delegates to the configured `hooks.validateApp` command — a self-mutating bash script that agents extend as they add new endpoints. Exit 1 triggers `deployment-stale` fault domain (reruns `push-app` + `poll-app-ci` without resetting dev items). After `infra-handoff` completes, `runValidateInfra()` delegates to `hooks.validateInfra` — also self-mutating, extended by infra agents as they provision new resources. Exit 1 triggers `infra` fault domain (resets `infra-architect` + `infra-handoff`).

---

## State File Structure

```mermaid
classDiagram
    class PipelineState {
        +string feature
        +string workflowType
        +string started
        +string|null implementationNotes
        +boolean|null elevatedApply
        +PipelineItem[] items
        +ErrorEntry[] errorLog
        +Record~string,string[]~ dependencies
        +string[] phases
        +Record~string,string~ nodeTypes
        +Record~string,string~ nodeCategories
        +string[] naByType
        +Record~string,InvocationRecord~ artifacts
    }

    class PipelineItem {
        +string key
        +string label
        +string agent
        +string phase
        +string status
        +string|null error
    }

    class ErrorEntry {
        +string timestamp
        +string itemKey
        +string message
        +string|null errorSignature
    }

    class NextAction {
        +string|null key
        +string label
        +string|null agent
        +string|null phase
        +string status
    }

    class FailResult {
        +PipelineState state
        +number failCount
        +boolean halted
    }

    class ResetResult {
        +PipelineState state
        +number cycleCount
        +boolean halted
    }

    PipelineState --> PipelineItem
    PipelineState --> ErrorEntry
```

### State Files

| File | Format | Purpose |
|------|--------|---------|
| `in-progress/<slug>/_state.json` | JSON | Machine-readable state (read by orchestrator) |
| `in-progress/<slug>/_trans.md` | Markdown | Human-readable view (auto-generated from state) |

> **Never edit state files directly.** Use pipeline commands via `npm run pipeline:*`.
>
> **Declarative DAG:** The dependency graph, phases, node types, and node categories are declared in `<appRoot>/.apm/workflows.yml` and persisted into `_state.json` when the state is first seeded (either by `agent:run --workflow <name>` or the admin `pipeline:init` command). The state machine reads these from the state file — the kernel and adapter contain no hardcoded item lists or dependency mappings.

---

## Hard Limits & Safety

```mermaid
flowchart TD
    subgraph LIMITS["Safety Limits"]
        L1["10 retry attempts\nper failing item"]
        L2["3 CI re-deploy cycles\nper feature"]
        L3["5 redevelopment cycles\nper feature"]
        L4["Phase gating:\nitems blocked until\ndeps are 'done'"]
    end

    L1 -->|"exceeded"| H1["🛑 Item halted"]
    L2 -->|"exceeded"| H2["🛑 Deploy halted"]
    L3 -->|"exceeded"| H3["🛑 Pipeline halted"]
    L4 -->|"violated"| H4["❌ completeItem()\nthrows error"]

    style LIMITS fill:#fff9c4
    style H1 fill:#ffcdd2
    style H2 fill:#ffcdd2
    style H3 fill:#ffcdd2
    style H4 fill:#ffcdd2
```

---

## Pipeline Commands (npm scripts)

| Command | Purpose |
|---------|---------|
| `npm run pipeline:init <slug> <workflow>` | **Admin escape hatch.** Seed `_STATE.json` + `_TRANS.md` without running the orchestrator. Not needed on the happy path — `agent:run --workflow <name>` seeds state in-process when absent |
| `npm run pipeline:complete <slug> <key>` | Mark item as done |
| `npm run pipeline:fail <slug> <key> <msg>` | Mark item as failed |
| `npm run pipeline:reset-ci <slug>` | Reset deploy items (`push-app` + `poll-app-ci`) for CI retry |
| `npm run pipeline:reset-infra-plan <slug>` | Reset infra deploy items (`push-infra` + `poll-infra-plan`) for re-push |
| `npm run pipeline:redevelop-infra <slug> <reason>` | Reset Wave 1 infra items for redevelopment cycle |
| `npm run pipeline:resume <slug>` | Resume pipeline after successful elevated apply |
| `npm run pipeline:recover-elevated <slug> <msg>` | Recover pipeline after failed elevated apply |
| `npm run pipeline:status <slug>` | Show current pipeline state |
| `npm run pipeline:next <slug>` | Get next single item (naive order) |
| `npm run pipeline:next-available <slug>` | Get all parallelizable items (DAG-aware) |

> **No item-scoped CLI verbs.** `docNote`, `handoffArtifact`, and `deployedUrl` are no longer state fields — dev agents emit them as declared artifacts (`outputs/summary.md`, `outputs/<kind>.json`, `outputs/deployment-url.json`). The kernel reads them from disk via the `ArtifactBus` port. See "The Node I/O Contract" below.

---

## State Architecture — Kernel + Adapter

```mermaid
flowchart LR
    subgraph KERNEL["src/kernel/pipeline-kernel.ts (Command/Effect)"]
        direction TB
        CMD["Commands in\n(complete/fail/reset/\ninit/salvage/\nadmin verbs)"]
        RED["Pure reducer\n(domain/transitions.ts)"]
        EFF["Effects out\n(persistence, telemetry)"]
    end

    subgraph ADAPTER["src/adapters/json-file-state-store.ts"]
        LOCK["POSIX lock\n(file-state/lock.ts)"]
        IO["Atomic read/write\n(file-state/io.ts)"]
        INIT["initState\n(file-state/init.ts)"]
    end

    subgraph CLI["src/cli/pipeline-state.ts (admin)"]
        VERBS["init / reset-scripts /\nresume / recover-elevated /\nstatus / next"]
    end

    CMD --> RED --> EFF
    EFF -->|"persist"| ADAPTER
    CLI -->|"runAdminCommand(\nadminHost, slug, cmd)"| KERNEL
    LOOP["src/loop/pipeline-loop.ts"] -->|"issue Command"| KERNEL

    style KERNEL fill:#e8f5e9
    style ADAPTER fill:#fff3e0
    style CLI fill:#e3f2fd
```

> The kernel is the sole state writer. Every mutation flows through `runCommand(cmd) → Effects[]`. The `JsonFileStateStore` adapter consumes persistence effects under a POSIX `mkdir` lock. Handlers and admin CLI never write state directly.

---

## Output Sanitization

When a script node fails, the kernel sanitizes the raw output before passing it to the triage system. This is zero-config — no per-node or per-app configuration required.

1. **Extract test stats** — recognizes common runner output (Playwright, Jest, Vitest) for `passed/failed/total` summary
2. **Truncate** — caps output to 8192 chars using 60/40 head/tail split

Fault classification is handled by the triage system's 4-tier cascade (unfixable signals → structured JSON → domain header → RAG retriever → LLM router). Domain-specific error patterns live in triage packs (`.apm/triage-packs/*.json`), not in script node config.

### Script Node Pre/Post Hooks

All script-type nodes support `pre` and `post` hooks — shell commands that run before and after the handler body.

- **`pre`** — Runs before the main command on every attempt (idempotent). Fatal on failure (node aborts). Timeout: 2 minutes for local-exec.
- **`post`** — Runs after successful handler completion. Use for: cleanup, validation hooks.

```yaml
e2e-runner:
  type: script
  script_type: local-exec
  command: "npx playwright test e2e/${featureSlug}.spec.ts"
  pre: |
    pkill -f 'node.*ssr' 2>/dev/null || true
    npm start &
    # poll dev server, exit 0 if healthy, exit 1 if broken
  post: |
    pkill -f 'node.*ssr' 2>/dev/null || true
```

### Context Injection (Failure → Redevelopment)

When a test node fails, the error output and triage classification are **injected into the redevelopment agent's prompt by `dispatch/context-builder.ts` via the `NodeContext` downstream-failure field** (previously handled by a dedicated `context-injection.ts`, which was dissolved into the dispatch layer). This prevents the agent from re-investigating the same failure from scratch.

---

## Triage Tier Summary

| Tier | Signal Source | Example | Action |
|:---:|---|---|---|
| **0** | Unfixable patterns | `authorization_requestdenied`, `error acquiring state lock`, `resource already exists` | Return `[]` — halt pipeline, salvage Draft PR |
| **1** | Agent-emitted JSON + Validation | `{"fault_domain":"backend","diagnostic_trace":"..."}` | Deterministic routing by `fault_domain`. Runs `validateFaultDomain()` as Defense-in-Depth: if `CICD_ROOT_CAUSE_INDICATORS` prove the fix is in `.github/workflows/`, augments the reset list with deploy items (`push-app`, `poll-app-ci`) while keeping the original domain so the dev agent can fix the workflow file |
| **2** | CI metadata header | `DOMAIN: backend,frontend` (from `poll-ci.sh`) | Job-name-based routing; schemas cascade to all |
| **3** | Legacy keywords | `api`, `500`, `cors`, `/backend/`, `/frontend/` | Fallback for SDK crashes; no-match → itemKey only |

> **Ambiguous fallback changed:** The zero-match keyword fallback now returns `[itemKey]` only (early return) — it no longer resets all dev items. This prevents a single ambiguous error from triggering a full pipeline reset.

---

## The Node I/O Contract

> Formerly `docs/06-roadmap/artifact-bus.md` Phases 1–6 + "Unified Node I/O + Observability Contract" Phases A–G. Shipped. This section is the mainline reference.

Every DAG node's I/O flows through a single declarative contract — the **artifact bus** — backed by the `ArtifactBus` port ([src/ports/artifact-bus.ts](../src/ports/artifact-bus.ts)) and its filesystem adapter ([src/adapters/file-artifact-bus.ts](../src/adapters/file-artifact-bus.ts)), with the per-invocation directory tree owned by the `InvocationFilesystem` port ([src/ports/invocation-filesystem.ts](../src/ports/invocation-filesystem.ts)). Agents never hardcode filenames; they declare `consumes_kickoff`, `consumes_artifacts`, `consumes_reroute`, and `produces_artifacts` in [workflows.yml](../../../apps/sample-app/.apm/workflows.yml), and the kernel enforces the contract.

### Directory layout

```
apps/<app>/in-progress/<slug>/
  _state.json                      # kernel-owned DAG state + invocation ledger
  _trans.md                        # human-readable transition log
  _kickoff/                        # feature inputs authored BEFORE any node runs
    spec.md                        # user-authored feature spec
  <nodeKey>/
    <invocationId>/                # immutable once sealed
      meta.json                    # mirror of InvocationRecord (trigger · parentInvocationId · cycleIndex · outcome · timestamps)
      inputs/                      # materialized BEFORE handler runs by invocation-builder
        params.in.json             # resolved input manifest
        <kind>.<ext>               # one file per resolved consumes_kickoff/consumes_artifacts/consumes_reroute entry
      outputs/                     # one file per declared produces_artifacts (kernel validates on completion)
        <kind>.<ext>               # e.g. summary.md, deployment-url.json, ci-result.json, approval.json, triage-handoff.json
      logs/                        # populated by the InvocationLogger port
        events.jsonl               # node.* lifecycle events keyed by invocationId
        tool-calls.jsonl           # SDK tool invocations from the harness
        messages.jsonl             # LLM message stream
        stdout.log / stderr.log    # script-node child process output (full stream)
```

The `_kickoff/` scope is the only non-node path. Re-runs never overwrite: every dispatch creates a new `<invocationId>` directory (ULID-prefix time-sortable). `_state.json.artifacts[invocationId]` is authoritative; `meta.json` is a disk-level mirror for inspection. `INPUTS_DIR`, `OUTPUTS_DIR`, and `LOGS_DIR` env vars exposed to script handlers point at the matching subdirs and are real, file-backed paths.

### The five mechanics

| Mechanic | Where | Contract |
|---|---|---|
| **Declare** | `workflows.yml` | Each node lists `consumes_kickoff: [kind]`, `consumes_artifacts: [{from, kind}]`, `consumes_reroute: [kind]` (optional, only resolved when `trigger === "triage-reroute"`), `produces_artifacts: [kind]`. Artifact kinds registered in [artifact-catalog.ts](../src/apm/artifact-catalog.ts). |
| **Resolve** | `loop/dispatch/invocation-builder.ts` (via `materializeInputsMiddleware`) | At dispatch, the builder walks the ledger, resolves each declared input to an `ArtifactRef`, **copies** the file into `<inv>/inputs/<kind>.<ext>`, and writes `inputs/params.in.json`. Required-but-missing throws `MissingRequiredInputError` → synthetic failed `InvocationRecord` with `errorSignature = missing_required_input:<kind>`. |
| **Write** | Agent writes to `$OUTPUTS_DIR/<kind>.<ext>`; `harness/outcome-tool.ts` `report_outcome({status, message?})` signals completion | The collapsed `report_outcome` schema carries only control flow — every payload (summary, deployment URL, CI result, approval, triage handoff) is a declared artifact written to `outputs/`. The `ArtifactBus` write path computes `<appRoot>/in-progress/<slug>/<nodeKey>/<invocationId>/outputs/<kind>.<ext>`. |
| **Enforce** | `kernel/pipeline-kernel.ts` | On `report_outcome(completed)`, the kernel diffs declared `produces_artifacts` against `state.artifacts[inv].outputs`. Missing → `failed` with `errorSignature = missing_required_output:<kind>` → routed through `on_failure.triage`. |
| **Trace** | `state.artifacts[inv].parentInvocationId` + `cli/pipeline-lineage.ts` | The ledger is the lineage graph. `pipeline:lineage <slug> --tree` renders the ancestry forest; `TriageArtifactLoader.loadEvidenceBundle` produces a `{ invocation, ancestry, events, artifacts }` record for triage agents. Triage re-entrance: triage emits `outputs/triage-handoff.json`; the rerouted dev node declares `consumes_reroute: [triage-handoff]`; the builder copies it into the next invocation's `inputs/triage-handoff.json`. |

### Observability: one event stream, one primary key

Every handler type emits the same baseline `node.*` event schema. Events sink to two places: the global `_EVENTS.jsonl` (via the `PipelineLogger` port, for cross-invocation queries) and the per-invocation `<inv>/logs/events.jsonl` (via the `InvocationLogger` port, for self-contained debugging). Tool calls and LLM messages sink only to `<inv>/logs/`. Script-node stdout/stderr is streamed live into `<inv>/logs/stdout.log` / `stderr.log` while a tail buffer feeds the failure summary. Triage walks `state.artifacts` for lineage and reads `<inv>/logs/` + `<inv>/outputs/` for evidence — never by prose.

### Extension points

- **New artifact kind.** Add to [artifact-catalog.ts](../src/apm/artifact-catalog.ts); declare it in workflow nodes' `produces_artifacts` / `consumes_artifacts`.
- **New node type.** Register a handler under [src/handlers/](../src/handlers/); it inherits the contract — inputs materialized into `inputs/`, declared `produces_artifacts` written to `outputs/`, uniform event stream into `logs/`.
- **Schema gate on prompts.** The APM compiler ([src/apm/instruction-lint.ts](../src/apm/instruction-lint.ts)) rejects rendered instructions that hardcode legacy `<slug>_*` paths or unbacked `${SLUG}_*` env vars. Violations fail bootstrap with line refs.
- **New consumer of the ledger.** Depend on `TriageArtifactLoader` or `ArtifactBus` — never on flat filesystem paths.

---

*← [03 APM Context](03-apm-context.md) · [05 Agents →](05-agents.md)*
