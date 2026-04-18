# System Overview — Autonomous Agentic Coding Platform

> Visual-first architecture reference. Diagrams carry the information; text is captions only.

---

## Full System Architecture

```mermaid
flowchart TB
    subgraph INPUTS["📥 Inputs"]
        SPEC["Feature Spec\n(in-progress/)"]
        RULES["Rule Fragments\n(rules/*.md)"]
        CODEBASE["Source Code\n(apps/sample-app/)"]
    end

    subgraph PHASE0["🧠 Phase 0 — Structural Intelligence"]
        ROAM_INDEX["roam index\n(tree-sitter → SQLite)"]
        ROAM_DB[(".roam/index.db\nSemantic Graph")]
    end

    subgraph ORCHESTRATOR["⚙️ Orchestrator — watchdog.ts"]
        direction TB
        PREFLIGHT["Pre-flight Checks"]
        ASSEMBLER["APM Compiler\n(rules → cached prompts)"]
        DAG["DAG Scheduler\ngetNextAvailable()"]
        LOOP["Main Loop\nwhile (items remaining)"]
    end

    subgraph SESSIONS["🤖 Copilot SDK Sessions (parallel)"]
        direction TB
        S1["schema-dev"]
        S_IA["infra-architect"]
        S_PI["push-infra (script)"]
        S_DPR["create-draft-pr"]
        S_PIP["poll-infra-plan (script)"]
        S_AIA["⏸ await-infra-approval"]
        S_IH["infra-handoff"]
        S2["backend-dev"]
        S3["frontend-dev"]
        S4["backend-unit-test"]
        S5["frontend-unit-test"]
        S6["push-app (script) → poll-app-ci (script)"]
        S7["integration-test"]
        S8["live-ui"]
        S9["code-cleanup"]
        S10["docs-archived"]
        S10B["doc-architect"]
        S11["publish-pr"]
    end

    subgraph MCP["🔌 MCP Servers"]
        ROAM_MCP["roam mcp\n(102 tools)"]
        PW_MCP["playwright-mcp\n(browser automation)"]
    end

    subgraph STATE["📊 State Management"]
        STATE_JSON["_STATE.json"]
        TRANS_MD["_TRANS.md\n(human view)"]
    end

    subgraph OUTPUT["📤 Outputs"]
        BRANCH["feature/slug branch"]
        PR["Pull Request"]
        REPORTS["_SUMMARY.md\n_TERMINAL-LOG.md\n_PLAYWRIGHT-LOG.md"]
        ARCHIVE["archive/features/slug/"]
    end

    CODEBASE --> ROAM_INDEX
    ROAM_INDEX --> ROAM_DB
    SPEC --> ORCHESTRATOR
    RULES --> ASSEMBLER
    ROAM_DB --> ROAM_MCP

    PREFLIGHT --> ASSEMBLER --> DAG --> LOOP
    LOOP -->|"per item"| SESSIONS
    SESSIONS <-->|"tool calls"| MCP
    SESSIONS -->|"completeItem/failItem"| STATE
    STATE -->|"getNextAvailable()"| LOOP
    SESSIONS -->|"agent-commit.sh"| BRANCH
    BRANCH -->|"push + CI"| PR
    LOOP -->|"on completion"| REPORTS
    PR -->|"archive"| ARCHIVE

    style PHASE0 fill:#e8f5e9,stroke:#2e7d32
    style ORCHESTRATOR fill:#e3f2fd,stroke:#1565c0
    style SESSIONS fill:#fff3e0,stroke:#e65100
    style MCP fill:#f3e5f5,stroke:#7b1fa2
    style STATE fill:#fce4ec,stroke:#c62828
```

---

## Component Relationship Map

```mermaid
flowchart LR
    subgraph ENTRY["Entry"]
        W["watchdog.ts\n(thin entry)"]
        M["main.ts\n(composition root)"]
        BS["bootstrap.ts\n(preflight + APM)"]
    end

    subgraph KERNEL["Pipeline Kernel (kernel/)"]
        K["pipeline-kernel.ts\nCommand → Effect"]
        CMD["commands.ts · rules.ts"]
        EFF["effects.ts\neffect-executor.ts"]
    end

    subgraph DOMAIN["Pure Domain (domain/)"]
        DG["dag-graph.ts"]
        SCH["scheduling.ts"]
        TR_D["transitions.ts"]
        ERR["error-signature.ts"]
        FR["failure-routing.ts"]
    end

    subgraph PORTS["Ports (ports/)"]
        P_SS["StateStore"]
        P_VC["VersionControl"]
        P_CI["CiGateway"]
        P_FS["FeatureFilesystem"]
        P_HK["HookExecutor"]
        P_CC["ContextCompiler"]
        P_TEL["Telemetry"]
    end

    subgraph ADAPTERS["Adapters (adapters/)"]
        A_SS["json-file-state-store.ts"]
        A_VC["git-shell-adapter.ts"]
        A_SDK["copilot-session-runner.ts"]
        A_CI["github-ci-adapter.ts"]
        A_FS["feature-fs-adapter.ts"]
    end

    subgraph LOOP_DISP["Loop & Dispatch"]
        L["loop/pipeline-loop.ts\nreactive DAG driver"]
        BD["dispatch/batch-dispatcher.ts"]
        CB["dispatch/context-builder.ts"]
        ID["dispatch/item-dispatch.ts"]
    end

    subgraph HANDLERS["Handler Plugins (handlers/)"]
        H_CA["copilot-agent.ts\nLLM agent sessions"]
        H_LE["local-exec.ts\nscript execution"]
        H_CP["github-ci-poll.ts"]
        H_AP["approval.ts · barrier.ts"]
        H_TR["triage-handler.ts\nfailure routing"]
        H_SUP["support/\nagent-context · agent-limits · agent-post-session"]
    end

    subgraph HARNESS["Harness & Agents"]
        HN["harness/\nRBAC, limits, tools"]
        AG["agents.ts\nprompt factory"]
        AC_MOD["apm-compiler.ts\napm-context-loader.ts"]
    end

    subgraph SUPPORT["Support"]
        PF["preflight.ts"]
        RP["reporting/index.ts"]
        AS["auto-skip.ts"]
        AR["archive.ts"]
        HKS["hooks.ts"]
        TRG["triage/\nretriever · llm-router · fingerprint"]
    end

    subgraph INFRA["Infrastructure"]
        PS["pipeline-state.mjs\nDAG state CLI"]
        ST["state.ts\n(facade — Phase 2 will retire)"]
        AC_SH["agent-commit.sh · agent-branch.sh · poll-ci.sh"]
    end

    subgraph EXT["External"]
        SDK["@github/copilot-sdk"]
        ROAM["roam-code v11.2"]
        PW["@playwright/mcp"]
    end

    W --> M
    M --> BS
    M --> K
    M --> L
    M --> ADAPTERS
    K --> CMD --> EFF
    K --> DOMAIN
    K --> PORTS
    ADAPTERS -.implements.-> PORTS
    L --> BD --> ID --> HANDLERS
    BD --> CB
    CB --> PORTS
    H_CA --> H_SUP
    H_CA --> AG
    H_CA --> HN
    H_CA --> A_SDK
    H_LE --> HKS
    H_TR --> TRG
    AG --> AC_MOD
    A_SS -.delegates.-> ST
    ST -.proxies.-> PS
    BS --> PF
    L --> RP
    L --> AS
    L --> AR
    A_VC --> AC_SH
    HN --> SDK
    AC_MOD --> ROAM
    H_CA --> PW

    style ENTRY fill:#e3f2fd,stroke:#1565c0
    style KERNEL fill:#fff3e0,stroke:#e65100
    style DOMAIN fill:#e8f5e9,stroke:#2e7d32
    style PORTS fill:#fce4ec,stroke:#c62828
    style ADAPTERS fill:#f3e5f5,stroke:#7b1fa2
    style LOOP_DISP fill:#fff9c4,stroke:#f9a825
    style HANDLERS fill:#e0f7fa,stroke:#00695c
    style INFRA fill:#ffebee,stroke:#b71c1c
```

> **Layering:** arrows point in the allowed direction. `domain/` and `ports/` never import downward (enforced by `npm run arch:check`). `kernel/` emits Effects that adapters fulfill. Handlers consume a `NodeContext` that carries port references (`vcs`, `stateReader`, etc.) — no direct I/O.

---

## Technology Stack

```mermaid
mindmap
  root((Agentic<br/>Platform))
    Orchestrator
      TypeScript
      Node 22
      @github/copilot-sdk ^0.1.32
      @anthropic-ai/sdk ^0.52.0
      ES2022 + NodeNext modules
    Structural Intelligence
      Python 3.11
      roam-code v11.2
      tree-sitter (27 languages)
      SQLite (WAL mode)
      NetworkX (graph algorithms)
      FastMCP (MCP server)
    Browser Automation
      @playwright/mcp ^0.0.68
      Chromium headless
      Vision capabilities
      Screenshot output
    State Management
      pipeline-state.mjs (JavaScript)
      _STATE.json (machine-readable)
      _TRANS.md (human-readable)
      DAG dependency solver
    Git & CI/CD
      agent-commit.sh (scoped commits)
      agent-branch.sh (branch manager)
      poll-ci.sh (CI status poller)
      GitHub Actions (OIDC)
    Rule System
      apm.yml (persona bindings)
      17 rule fragments (5 categories)
      APM Compiler (eager cache)
      apm compile (IDE gen)
```

---

## Pipeline Execution Flow (End-to-End)

> This diagram shows the **technical execution sequence** (init → phases → reports). For the DAG dependency graph with parallel scheduling, see [04-state-machine.md](04-state-machine.md). For how these stages map to traditional software development, see [07-mental-model.md](07-mental-model.md).

```mermaid
flowchart LR
    subgraph INIT["Init"]
        I1["Parse CLI args"]
        I2["Create branch"]
        I3["Pre-flight checks"]
        I4["roam index"]
        I5["Init APM Compiler"]
    end

    subgraph W1["Wave 1: Infrastructure"]
        W1_1["schema-dev"]
        W1_2["infra-architect"]
        W1_3["push-infra"]
        W1_4["create-draft-pr"]
        W1_5["poll-infra-plan"]
    end

    subgraph GATE["Approval Gate"]
        G1["⏸ await-infra-approval"]
        G2["infra-handoff"]
    end

    subgraph PRE["Wave 2: Pre-Deploy"]
        P2["backend-dev"]
        P3["frontend-dev"]
        P4["backend-unit-test"]
        P5["frontend-unit-test"]
    end

    subgraph DEP["Deploy"]
        D1["push-app"]
        D2["poll-app-ci"]
    end

    subgraph POST["Post-Deploy"]
        PD1["integration-test"]
        PD2["live-ui"]
    end

    subgraph FIN["Finalize"]
        F1["code-cleanup"]
        F2["docs-archived"]
        F2B["doc-architect"]
        F3["publish-pr"]
    end

    subgraph RECOVERY["Recovery Paths"]
        R1["CI failure in poll-app-ci\n→ triageFailure()\n→ resetForDev()"]
        R2["Post-deploy failure\n→ triageFailure()\n→ resetForDev()"]
    end

    I1 --> I2 --> I3 --> I4 --> I5 --> W1
    W1_1 --> W1_2 --> W1_3 --> W1_4 --> W1_5 --> GATE
    G1 --> G2 --> PRE
    P2 --> P4
    P3 --> P5
    P4 & P5 --> DEP
    D1 --> D2
    D2 --> PD1
    PD1 & PD2 --> FIN
    F1 --> F2 --> F3

    D2 -.->|"CI fails"| R1
    R1 -.->|"reset dev+deploy items"| PRE
    PD1 -.->|"test fails"| R2
    PD2 -.->|"test fails"| R2
    R2 -.->|"reset dev+test items"| PRE

    style INIT fill:#e8f5e9
    style W1 fill:#e8f5e9
    style GATE fill:#fff9c4,stroke:#f9a825,stroke-width:2px
    style PRE fill:#e3f2fd
    style DEP fill:#fff9c4
    style POST fill:#fff3e0
    style FIN fill:#f3e5f5
    style RECOVERY fill:#ffcdd2
```

---

## Platform Portability — App-Agnostic Engine

```mermaid
flowchart LR
    ENGINE["tools/autonomous-factory/\n(app-agnostic engine)"]

    subgraph APPS["Application Boundaries (--app flag)"]
        A1["apps/sample-app/\nAzure Functions + Next.js"]
        A2["apps/service-b/\nSpring Boot + Vue"]
        A3["apps/service-c/\nFastAPI + SvelteKit"]
    end

    subgraph READS["Engine Reads From Each App"]
        R1["apm.yml\n→ personas & rules"]
        R2[".instructions.md\n→ coding standards"]
        R3["package.json\n→ test commands"]
    end

    ENGINE -->|"--app apps/sample-app"| A1
    ENGINE -->|"--app apps/service-b"| A2
    ENGINE -->|"--app apps/service-c"| A3
    A1 --> READS
    A2 --> READS
    A3 --> READS

    style ENGINE fill:#263238,color:#fff,stroke-width:3px
    style APPS fill:#e3f2fd,stroke:#1565c0
    style READS fill:#fff3e0,stroke:#e65100
```

> **Scaling insight:** `tools/autonomous-factory/` is a standalone compiler engine. It does not know what a "React App" or an "Azure Function" is. It receives a `--app` boundary path, reads that app's `apm.yml` to discover personas and rules, and executes. A single deployment of this engine could build 50 microservices in 5 languages simultaneously — each with its own governance rules, each isolated by the `appRoot` / `repoRoot` boundary.

> Full competitive analysis and project narrative: [README.md](../../README.md)

---

## Documentation Map

> **Reading order:** VP/CTO → read 07 then stop. Architect → read 07, 00, 04, 05. Developer → read AGENTIC-WORKFLOW, 01, 04, 05.

| # | Document | Audience | What It Covers |
|---|----------|----------|---------------|
| **07** | [07-mental-model.md](07-mental-model.md) | All | Traditional SDLC → agentic pipeline mapping — **start here** |
| **00** | **This file** | Architect | System-level architecture, component relationships, tech stack |
| **01** | [01-watchdog.md](01-watchdog.md) | Developer | Orchestrator main loop, session lifecycle, failure recovery, timeouts |
| **02** | [02-roam-code.md](02-roam-code.md) | Developer | Roam-code: 6 killer capabilities, integration, agent rules, adoption roadmap |
| **03** | [03-apm-context.md](03-apm-context.md) | Developer | Rule resolution pipeline, persona mapping, token budgets |
| **04** | [04-state-machine.md](04-state-machine.md) | Architect | Pipeline DAG, workflow types, status lifecycle, redevelopment reroute |
| **05** | [05-agents.md](05-agents.md) | Architect | 13 LLM specialist agents, 5 script handlers, MCP assignments, prompt anatomy, auto-skip |
| **06** | [06-roadmap/](06-roadmap/) | All | Standing feature deep-dives with implementation plans |

**Operational hub:** [`.github/AGENTIC-WORKFLOW.md`](../../.github/AGENTIC-WORKFLOW.md) — project structure, configuration, commands, safety guardrails, and how to run. *(Developer audience)*
