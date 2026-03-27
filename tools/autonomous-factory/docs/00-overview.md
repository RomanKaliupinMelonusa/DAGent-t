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
        S2["backend-dev"]
        S3["frontend-dev"]
        S4["backend-unit-test"]
        S5["frontend-unit-test"]
        S6["push-code → poll-ci"]
        S7["integration-test"]
        S8["live-ui"]
        S9["code-cleanup"]
        S10["docs-expert"]
        S11["create-pr"]
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
    subgraph ENTRY["Entry Point"]
        W["watchdog.ts\n(~1900 lines)"]
    end

    subgraph CORE["Core Modules"]
        A["agents.ts\n(~1600 lines)\nPrompt Factory"]
        PA["apm-compiler.ts\n(~256 lines)\nRule Engine"]
        S["state.ts\n(~110 lines)\nTyped Wrapper"]
        T["types.ts\n(~60 lines)\nShared Types"]
    end

    subgraph INFRA["Infrastructure"]
        PS["pipeline-state.mjs\n(~468 lines)\nDAG State Machine"]
        AC["agent-commit.sh\nGit Wrapper"]
        AB["agent-branch.sh\nBranch Manager"]
        PC["poll-ci.sh\nCI Poller"]
        SR["setup-roam.sh\nRoam Installer"]
        BI["apm compile\n.instructions.md Generator"]
    end

    subgraph RULES["Rule Fragments"]
        MF["apm.yml"]
        RF["26 .md files\n5 categories"]
    end

    subgraph EXT["External Dependencies"]
        SDK["@github/copilot-sdk"]
        ROAM["roam-code v11.2\n(Python, MCP)"]
        PW["@playwright/mcp"]
    end

    W -->|"getAgentConfig()"| A
    W -->|"getNextAvailable()"| S
    W -->|"agent-commit.sh"| AC
    W -->|"agent-branch.sh"| AB
    W -->|"roam index"| ROAM
    A -->|"getRulesForAgent()"| PA
    A -->|"roamMcpConfig()"| ROAM
    A -->|"playwright config"| PW
    S -->|"lazy import()"| PS
    PA -->|"load at init"| MF
    PA -->|"read & cache"| RF
    BI -->|"same config"| MF
    BI -->|"same rules"| RF
    W -->|"CopilotClient"| SDK
    T -.->|"types"| W
    T -.->|"types"| S

    style ENTRY fill:#e3f2fd,stroke:#1565c0
    style CORE fill:#fff3e0,stroke:#e65100
    style INFRA fill:#e8f5e9,stroke:#2e7d32
    style EXT fill:#f3e5f5,stroke:#7b1fa2
```

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
      26 rule fragments (5 categories)
      APM Compiler (eager cache)
      apm compile (IDE gen)
```

---

## Pipeline Execution Flow (End-to-End)

```mermaid
flowchart LR
    subgraph INIT["Init"]
        I1["Parse CLI args"]
        I2["Create branch"]
        I3["Pre-flight checks"]
        I4["roam index"]
        I5["Init APM Compiler"]
    end

    subgraph PRE["Pre-Deploy"]
        P1["schema-dev"]
        P2["backend-dev"]
        P3["frontend-dev"]
        P4["backend-unit-test"]
        P5["frontend-unit-test"]
    end

    subgraph DEP["Deploy"]
        D1["push-code"]
        D2["poll-ci"]
    end

    subgraph POST["Post-Deploy"]
        PD1["integration-test"]
        PD1 --> PD2["live-ui"]
    end

    subgraph FIN["Finalize"]
        F1["code-cleanup"]
        F2["docs-expert"]
        F3["create-pr"]
    end

    subgraph RECOVERY["Recovery Paths"]
        R1["CI failure in poll-ci\n→ triageFailure()\n→ resetForDev()"]
        R2["Post-deploy failure\n→ triageFailure()\n→ resetForDev()"]
    end

    I1 --> I2 --> I3 --> I4 --> I5 --> PRE
    P1 --> P2 & P3
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

| # | Document | What It Covers |
|---|----------|---------------|
| **00** | **This file** | System-level architecture, component relationships, tech stack |
| **01** | [01-watchdog.md](01-watchdog.md) | Orchestrator main loop, session lifecycle, failure recovery, timeouts |
| **02** | [02-roam-code.md](02-roam-code.md) | Roam-code: 6 killer capabilities, integration, agent rules, adoption roadmap |
| **03** | [03-apm-context.md](03-apm-context.md) | Rule resolution pipeline, persona mapping, token budgets |
| **04** | [04-state-machine.md](04-state-machine.md) | Pipeline DAG, workflow types, status lifecycle, redevelopment reroute |
| **05** | [05-agents.md](05-agents.md) | 12 specialist agents, MCP assignments, prompt anatomy, auto-skip |
| **06** | [06-roadmap/](06-roadmap/) | Standing feature deep-dives with implementation plans |

**Operational hub:** [`.github/AGENTIC-WORKFLOW.md`](../../.github/AGENTIC-WORKFLOW.md) — project structure, configuration, commands, safety guardrails, and how to run.
