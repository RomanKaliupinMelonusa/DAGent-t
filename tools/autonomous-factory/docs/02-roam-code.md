# Roam-Code — Structural Intelligence Engine

> The AST engine that makes autonomous code mutation safe, fast, and governable.
> roam-code v11.2 · [github.com/Cranot/roam-code](https://github.com/Cranot/roam-code) · Installed via `tools/autonomous-factory/setup-roam.sh`
> Hub: [AGENTIC-WORKFLOW.md](../../.github/AGENTIC-WORKFLOW.md)

---

## What Roam-Code Does (One Diagram)

```mermaid
flowchart LR
    subgraph INPUT["Source Code"]
        CODE["27 languages\nTypeScript, Python,\nJava, Go, Rust,\nTerraform (HCL)..."]
    end

    subgraph INDEX["Index Pipeline"]
        direction TB
        D["1. Discovery\ngit ls-files\n+ .roamignore"]
        P["2. Parse\ntree-sitter AST\nper file"]
        E["3. Extract\nsymbols +\nreferences"]
        R["4. Resolve\nreferences →\ngraph edges"]
        M["5. Metrics\nPageRank, complexity,\nchurn, co-change"]
        S["6. Store\nSQLite WAL mode"]
        D --> P --> E --> R --> M --> S
    end

    subgraph DB["Semantic Graph"]
        SQL[(".roam/index.db\n\nfiles · symbols · edges\nmetrics · snapshots\nvulns · clusters")]
    end

    subgraph CONSUMERS["Consumers"]
        AGENT["AI Agents\n(via MCP Server)"]
        CI["CI/CD\n(GitHub Actions)"]
        DEV["Developers\n(CLI)"]
    end

    CODE --> INDEX --> DB
    DB --> AGENT & CI & DEV

    style INDEX fill:#e8f5e9,stroke:#2e7d32
    style DB fill:#fff9c4,stroke:#f9a825
    style AGENT fill:#e3f2fd,stroke:#1565c0,stroke-width:3px
```

---

## Killer Capabilities — What Roam Enables for Our Pipeline

### 1. Safe Code Mutation — Agents Can't Corrupt Your Codebase

Standard AI agents use `sed`, `grep`, or string replacement to edit code. At monorepo scale, this causes silent corruption — a rename hits comments, strings, and unrelated symbols. Our agents are **physically prevented** from string-mutating code. Instead, they go through a deterministic AST pipeline:

```mermaid
flowchart LR
    subgraph INTENT ["Agent Intent"]
        A["LLM decides:\nrename UserService\n→ AccountService"]
    end

    subgraph SAFE ["Roam AST Pipeline (Deterministic)"]
        direction TB
        CTX["roam_context\n→ Exact symbol locations\nwith parent scope"]
        PRE["roam_preflight\n→ 12 files, 34 refs,\n8 tests affected"]
        MUT["roam_mutate\n→ Structural AST patch\n(only typed references)"]
        CHK["roam_syntax_check\n→ Zero syntax errors ✓"]
        CTX --> PRE --> MUT --> CHK
    end

    subgraph RESULT ["Output"]
        DISK["File System\n(guaranteed safe)"]
    end

    INTENT --> SAFE --> RESULT

    style INTENT fill:#fff3e0,stroke:#e65100
    style SAFE fill:#e8f5e9,stroke:#2e7d32
    style RESULT fill:#e3f2fd,stroke:#1565c0
```

> The LLM never touches the file system directly. Every code change flows through AST-level mutation with syntax verification — silent corruption is structurally impossible.

### 2. Blast Radius Visibility — Know the Impact Before Any Change

Before an agent modifies a single line, `roam_preflight` calculates the full downstream impact. This turns "hope it works" into deterministic impact analysis:

```mermaid
flowchart TD
    CHANGE["Agent wants to modify\nPaymentService.processRefund()"]
    CHANGE --> PREFLIGHT["roam_preflight"]

    subgraph IMPACT ["Blast Radius Report"]
        direction LR
        FILES["📁 12 files affected"]
        REFS["🔗 34 references"]
        TESTS["🧪 8 tests impacted"]
        COMPLEX["⚡ Complexity: 7.2"]
    end

    PREFLIGHT --> IMPACT

    IMPACT --> DECISION{"Agent decision"}
    DECISION -->|"Safe — proceed"| MUTATE["roam_mutate\n→ apply change"]
    DECISION -->|"Too risky — decompose"| SPLIT["Break into smaller\nchanges"]

    style IMPACT fill:#fff9c4,stroke:#f9a825
    style MUTATE fill:#c8e6c9,stroke:#1b5e20
    style SPLIT fill:#e3f2fd,stroke:#1565c0
```

> Every agent prompt includes a hard rule: **no code change without a preflight**. The blast radius is visible before the change happens.

### 3. 5× Cheaper, 22× Faster Code Comprehension

When an agent needs to understand a symbol, the difference between grep and roam is dramatic:

```mermaid
flowchart LR
    subgraph GREP["Without Roam"]
        G1["grep_search 'PaymentService'"]
        G2["847 text matches"]
        G3["read_file × 15 calls"]
        G4["~15,000 tokens consumed"]
        G5["~11s wall time"]
        G1 --> G2 --> G3 --> G4 --> G5
    end

    subgraph ROAM_FLOW["With Roam"]
        R1["roam_context PaymentService"]
        R2["47 callers, 3 callees,\n31 affected tests"]
        R3["Ranked file list\nwith exact line ranges"]
        R4["~3,000 tokens consumed"]
        R5["<0.5s wall time"]
        R1 --> R2 --> R3 --> R4 --> R5
    end

    style GREP fill:#ffcdd2
    style ROAM_FLOW fill:#c8e6c9
```

| Metric | grep/read approach | roam approach | Improvement |
|--------|-------------------|---------------|-------------|
| Tool calls | 8 | 1 | **8× fewer** |
| Wall time | ~11s | <0.5s | **22× faster** |
| Tokens consumed | ~15,000 | ~3,000 | **5× cheaper** |
| Structural understanding | None | Full dependency graph | **Qualitative leap** |

> Over a full-stack feature with 12 agents, roam saves tens of thousands of tokens and minutes of wall time per pipeline run.

### 4. Test Intelligence — Only Run What Matters

After code changes, agents don't blindly run the full test suite. Roam tells them exactly which tests are affected:

```mermaid
flowchart LR
    EDIT["Agent edits\n3 files"] --> AFFECTED["roam_affected_tests\n→ 8 specific tests\n(not 449)"]
    AFFECTED --> RUN["Agent runs only\nthose 8 tests"]
    RUN --> PASS["✓ Targeted verification\nin seconds"]

    GAPS["roam_test_gaps"] --> UNCOVERED["Shows exact\nuncovered code paths"]
    UNCOVERED --> WRITE["Test agent writes\ntests for gaps"]
    UNCOVERED --> E2E["live-ui writes\nPlaywright scenarios\nfor hidden states"]

    style AFFECTED fill:#e8f5e9,stroke:#2e7d32
    style GAPS fill:#f3e5f5,stroke:#7b1fa2
    style E2E fill:#fff3e0,stroke:#e65100
```

> `roam_affected_tests` maps code changes to specific test files. `roam_test_gaps` shows the test agent exactly which code paths lack coverage — no guessing. The `live-ui` agent uses `roam_test_gaps` post-deploy to write Playwright E2E scenarios targeting hidden states (error branches, loading guards, conditional renders) identified by AST diff.

### 5. Automated Governance Gate — Code Quality Enforcement

Every agent must pass a `roam_check_rules` gate before declaring completion. Violations in blocking categories halt the pipeline:

```mermaid
flowchart LR
    CODE["Agent writes code"] --> GATE["roam_check_rules"]

    GATE --> SEC{"SEC violations?"}
    SEC -->|"Yes"| BLOCK_S["🚫 BLOCKED\nSecurity issue"]
    SEC -->|"No"| PERF{"PERF violations?"}
    PERF -->|"Yes"| BLOCK_P["🚫 BLOCKED\nPerformance issue"]
    PERF -->|"No"| COR{"COR violations?"}
    COR -->|"Yes"| BLOCK_C["🚫 BLOCKED\nCorrectness issue"]
    COR -->|"No"| ARCH{"ARCH violations?"}
    ARCH -->|"Yes"| WARN["⚠️ WARNING\n(non-blocking)"]
    ARCH -->|"No"| PASS["✅ Gate passed"]

    WARN --> PASS

    style BLOCK_S fill:#ffcdd2,stroke:#c62828
    style BLOCK_P fill:#ffcdd2,stroke:#c62828
    style BLOCK_C fill:#ffcdd2,stroke:#c62828
    style WARN fill:#fff9c4,stroke:#f9a825
    style PASS fill:#c8e6c9,stroke:#1b5e20
```

> SEC, PERF, and COR violations are **blocking** — the agent must fix the issue before proceeding. ARCH violations are warnings. This is enforced by rule fragments, not agent goodwill.

### 6. PR Risk Scoring — Quantified Risk Before Merge

When the `create-pr` agent assembles the Pull Request, roam provides a structural risk assessment:

```mermaid
flowchart LR
    subgraph PR_TOOLS ["Roam PR Intelligence"]
        direction TB
        DIFF["roam_pr_diff\n→ AST-level change summary\n(90% fewer tokens than git diff)"]
        RISK["roam_pr_risk\n→ Blast radius + risk score\n+ affected components"]
        REVIEW["roam_suggest_reviewers\n→ Code owners for\nmodified areas"]
    end

    subgraph PR_OUTPUT ["Pull Request"]
        BODY["PR body includes:\n• Structural change summary\n• Risk score\n• Affected test count\n• Suggested reviewers"]
    end

    PR_TOOLS --> PR_OUTPUT

    style PR_TOOLS fill:#e3f2fd,stroke:#1565c0
    style PR_OUTPUT fill:#f3e5f5,stroke:#7b1fa2
```

> The human reviewer sees a **quantified risk assessment** — not just a code diff, but which components are affected, what the blast radius is, and who should review.

---

## How We Integrate Roam

```mermaid
sequenceDiagram
    participant DC as DevContainer<br/>postCreateCommand
    participant SH as setup-roam.sh
    participant W as watchdog.ts /\npreflight.ts
    participant SDK as Copilot SDK<br/>Session
    participant MCP as roam mcp<br/>(local process)
    participant DB as .roam/index.db

    DC->>SH: bash setup-roam.sh
    Note over SH: python3 -m venv /home/node/.roam-venv<br/>pip install roam-code[mcp]@v11.2.0<br/>ln -sf roam /usr/local/bin/roam

    W->>W: roam --version (check availability)
    W->>DB: roam index (120s timeout, non-fatal)
    Note over DB: First index: ~5s for 200 files<br/>Incremental: <1s

    W->>SDK: createSession(systemMsg, mcpServers)
    Note over SDK: mcpServers includes:<br/>{ command: "roam", args: ["mcp"] }

    SDK->>MCP: spawn "roam mcp" (local process)
    Note over MCP: Exposes all tools (tools: [*])<br/>In-process execution (no subprocess per call)

    loop Agent Tool Calls
        SDK->>MCP: roam_context("PaymentService")
        MCP->>DB: SELECT ... FROM symbols WHERE ...
        DB-->>MCP: structured result
        MCP-->>SDK: files + line ranges + callers
    end

    Note over W: After post-deploy failure reroute:<br/>roam index (re-index codebase)
```

---

## Agent Rule System

Three rule fragments govern how agents use roam — enforced via the Prompt Assembler, not agent discretion:

```mermaid
flowchart LR
    subgraph RULES ["Rule Fragments"]
        direction TB
        R1["roam-tool-rules.md\n🚫 grep/find FORBIDDEN for code\n✅ roam_preflight before ANY change\n✅ roam_check_rules before completion"]
        R2["roam-efficiency.md\n⏱ Roam first, read second\n⏱ Max 5 reads without mutation\n📦 Batch with roam_explore"]
        R3["roam-test-intelligence.md\n🧪 roam_test_gaps for coverage\n🧪 roam_testmap for mapping\n🚫 No mutation tools in test agents"]
    end

    subgraph APPLIED ["Applied To"]
        DEV["Dev agents\n→ rules + efficiency"]
        TEST["Test agents + live-ui\n→ test intelligence"]
        FIN["Finalize agents\n→ rules only"]
    end

    R1 --> DEV & FIN
    R2 --> DEV
    R3 --> TEST

    style RULES fill:#e3f2fd,stroke:#1565c0
    style APPLIED fill:#fff3e0,stroke:#e65100
```

> Key enforcement: agents are **forbidden** from using `grep_search`, `find`, `fd`, `ag`, `rg`, or `ls -R` for code exploration. All code comprehension goes through roam. The only exception: `grep` for non-code files (markdown, config, JSON).

---

## Performance

| Operation | Time | Notes |
|-----------|------|-------|
| Index 200 files | ~3–5s | First run |
| Index 3,000 files | ~2 min | First run |
| Incremental index | <1s | SHA-256 hash + mtime check |
| Any query command | <0.5s | SQLite FTS5/BM25 |
| MCP tool call | <0.5s | In-process (no subprocess per call) |

---

## Graceful Degradation

```mermaid
flowchart TD
    CHECK{"roam\navailable?"}

    CHECK -->|"Yes"| INDEX["Phase 0: roam index"]
    CHECK -->|"No"| FALLBACK["⚠ Warn: Continue without\nsemantic graph"]

    INDEX -->|"Success"| FULL["Full capability:\nMCP tools for all agents"]
    INDEX -->|"Fail (non-fatal)"| PARTIAL["⚠ Warn: Agents use\nstandard tools"]

    FALLBACK --> STD["Standard tools:\ngrep_search, read_file,\nfind, semantic_search"]
    PARTIAL --> STD

    FULL -->|"MCP tool call fails"| STD

    STD --> CONTINUE["Pipeline continues\n(degraded but functional)"]
    FULL --> CONTINUE

    style FULL fill:#c8e6c9
    style STD fill:#fff9c4
    style FALLBACK fill:#ffcdd2
```

> Roam is a **force multiplier**, not a hard dependency. The pipeline runs without it — just slower and less precise.

---

## Reference

### Actively Used Tools (25 of 102)

| Phase | Tools |
|-------|-------|
| **Exploration** | `roam_understand`, `roam_context`, `roam_search_symbol`, `roam_explore` |
| **Pre-change** | `roam_preflight`, `roam_prepare_change` |
| **Post-change** | `roam_review_change`, `roam_affected_tests`, `roam_check_rules`, `roam_syntax_check` |
| **Mutation** | `roam_mutate`, `roam_safe_delete`, `roam_semantic_diff` |
| **Testing** | `roam_test_gaps`, `roam_testmap` |
| **Cleanup** | `roam_flag_dead`, `roam_orphan_routes`, `roam_dark_matter` |
| **PR creation** | `roam_pr_diff`, `roam_pr_risk`, `roam_suggest_reviewers`, `roam_doc_staleness`, `roam_index` |

Full 102-tool inventory: `roam mcp --list-tools`

### Adoption Roadmap — High-Priority Unused Tools

| Tool | Impact | Priority | Where |
|------|--------|----------|-------|
| `roam_health` | Quantified quality gate (0–100 score) | **P1** | push-code pre-check |
| `roam_verify_imports` | Catches hallucinated imports in agent code | **P1** | post-change rules |
| `roam_diagnose_issue` | Structural root cause (replaces keyword triage) | **P1** | triage.ts |
| `roam_algo` | 23 anti-pattern detectors (O(n²), N+1) | **P2** | code-cleanup agent |
| `roam_secrets` | Secret leakage scan | **P2** | pre-flight checks |
| `roam_clones` | AST clone detection (dedup agent code) | **P2** | code-cleanup agent |
| `roam_api_changes` | Breaking API risk detection | **P2** | schema-dev gate |

### MCP Preset System

Current config: `tools: ["*"]` (full preset — all 102 tools exposed). Roam supports progressive presets (`core` → `review` → `refactor` → `debug` → `architecture` → `full`) with a `roam_expand_toolset` meta-tool for on-demand expansion. Consider restricting to `core` preset to reduce token overhead from schema enumeration.

### Installation

| Aspect | Value |
|--------|-------|
| Version | v11.2.0 (pinned) |
| Python | 3.11 · venv at `/home/node/.roam-venv` |
| Binary | symlinked to `/usr/local/bin/roam` |
| Index | `.roam/index.db` (git-ignored) |
| MCP launch | `roam mcp` as local process via `roamMcpConfig()` |

### Language Support

27 languages via tree-sitter. **Current deployment uses TypeScript, Python, and Terraform HCL.** Full Tier 1 support (dedicated parsers with symbol extraction and edge types): TypeScript, JavaScript, Python, Java, Go, Rust, C/C++, C#, HCL/Terraform, YAML, PHP, Ruby, Kotlin, Scala, SQL, Swift, Vue, Svelte.

---

*← [01 Watchdog](01-watchdog.md) · [03 APM Context →](03-apm-context.md)*
