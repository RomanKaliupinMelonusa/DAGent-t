# 00 — Migration Spec (Architecture Decision Record)

> Pre-work doc. Read this before kicking off Session 1.
> This is the authoritative mapping document — all session docs reference it.

---

## ADR — Adopt Temporal OSS as Orchestration Kernel

### Status
Proposed (pending sign-off before Session 1 kickoff).

### Context

The current `PipelineKernel` ([../../src/kernel/](../../src/kernel/)) is a hand-rolled, command-sourced state machine persisting to JSON files via `JsonFileStateStore`. It works for single-tenant in-process use, but has known fragility:

- Crash-recovery edge cases ([../../src/domain/dangling-invocations.ts](../../src/domain/dangling-invocations.ts) exists to paper over them)
- Resume logic is bespoke and difficult to verify
- No first-class signals/queries — admin CLI mutates state files
- No replay-based debugging
- Multi-feature parallelism is achieved by spawning subprocess orchestrators ([../../src/adapters/subprocess-feature-runner.ts](../../src/adapters/subprocess-feature-runner.ts))
- Telemetry is bespoke JSONL — incompatible with enterprise OTLP expectations

For the strategic goal of partner-readiness (Salesforce, Google Antigravity), durable execution is table stakes.

### Decision

Replace the orchestration kernel with **Temporal OSS** (MIT licensed, self-hosted on Postgres). Keep all IP-bearing layers above the kernel: APM compiler, handler/activity contracts, triage classifier, artifact ledger, microkernel registries.

### Consequences

**Gained:**
- Durable execution with crash recovery
- Signals/queries as first-class primitives (cleans up `await-infra-approval`)
- Replay-based debugging from production histories
- OpenTelemetry surface for free
- Multi-feature concurrency without subprocess orchestration

**Lost:**
- Self-contained in-process operation (now requires Temporal cluster + Postgres)
- The `PipelineKernel` Command/Effect pattern (genuinely elegant, but redundant against Temporal's history model)
- Immediate startup (now requires Temporal server reachable)

**Locked in:**
- Programming model dependency on Temporal SDK
- Operational requirement to run a Temporal cluster (or pay for Temporal Cloud)

---

## Mapping — Current Concept → Temporal Concept

The single source of truth for what changes in this migration.

| Current concept | Temporal concept | Disposition |
|---|---|---|
| `PipelineKernel` class | Workflow execution + history | **Delete** — Temporal owns state |
| `_state.json` durable store | Workflow event history | **Delete** — Temporal persists |
| `Command` discriminated union | Workflow code body | **Delete** — workflow function inlines logic |
| `Effect` discriminated union | Activity invocations | **Delete** — replaced by direct `await activity()` |
| `effect-executor.ts` | (none — direct activity calls) | **Delete** |
| `KernelRules` port | (none — workflow code references domain functions directly) | **Delete** port; keep functions |
| `pipeline-loop.ts` | Workflow main `while` loop | **Delete file**; logic moves into workflow |
| `signal-handler.ts` (POSIX SIGINT) | Temporal cancellation | **Delete** |
| `dangling-invocations.ts` | Activity heartbeat + start-to-close timeout | **Delete** |
| `stall-detection.ts` | Activity timeouts | **Delete** |
| `JsonFileStateStore` adapter | Postgres (Temporal persistence backend) | **Delete adapter** |
| `subprocess-feature-runner.ts` | Multiple workflow executions on one cluster | **Delete** |
| `NodeHandler` interface | `@temporalio/activity` exported function | **Rewrite signature** |
| `handlers/copilot-agent.ts` | `activities/copilot-agent.activity.ts` | **Port 1:1** with heartbeats |
| `handlers/local-exec.ts` | `activities/local-exec.activity.ts` | **Port 1:1** |
| `handlers/github-ci-poll.ts` | `activities/github-ci-poll.activity.ts` | **Port** with heartbeat-based polling |
| `handlers/triage-handler.ts` | `activities/triage.activity.ts` | **Port 1:1** |
| `handlers/approval.ts` | Temporal Signal + `Workflow.condition()` | **Replace pattern entirely** |
| Cycle counter ([../../src/domain/cycle-counter.ts](../../src/domain/cycle-counter.ts)) | Workflow-local variable | **Inline into workflow** |
| `domain/scheduling.ts` | In-workflow function (deterministic) | **Copy-import** unchanged |
| `domain/dag-graph.ts` | In-workflow function | **Copy-import** unchanged |
| `domain/transitions.ts` | In-workflow methods on `DagState` | **Adapt** (return type changes) |
| `domain/failure-routing.ts` | In-workflow function | **Copy-import** unchanged |
| `domain/error-signature.ts` | In-workflow function | **Copy-import** unchanged |
| `domain/volatile-patterns.ts` | In-workflow function | **Copy-import** unchanged |
| `domain/init-state.ts` | In-workflow factory | **Adapt** to build `DagState` |
| `domain/pruning.ts` | In-workflow function | **Copy-import** |
| `domain/batch-interpreter.ts` | In-workflow function | **Copy-import** |
| `domain/approval-sla.ts` | Workflow `Workflow.sleep()` + signal race | **Adapt** |
| `domain/progress-tracker.ts` | Workflow query handler | **Adapt** |
| `apm/compiler.ts` + `apm/context-loader.ts` | Pre-workflow compilation (client-side) | **Keep 100%** |
| `triage/*` (retriever, classifier, llm-router) | Activity-internal code | **Keep 100%** |
| Artifact ledger (`.dagent/<slug>/<inv>/`) | Activity outputs on shared FS | **Keep 100%** |
| `_trans.md` projection | Workflow query result + on-demand renderer | **Rewrite as projection** |
| Admin CLI ([../../src/cli/pipeline-state.ts](../../src/cli/pipeline-state.ts)) | Temporal client (signals + queries + describe) | **Rewrite** |
| `lifecycle/preflight.ts` | Pre-workflow client-side check | **Keep**, move out of orchestrator |
| `lifecycle/hooks.ts` | Activity invocations from workflow | **Adapt** |
| `lifecycle/auto-skip.ts` | Workflow-side check at node-ready time | **Adapt** |
| `lifecycle/archive.ts` | Final activity (or post-workflow client step) | **Adapt** |
| `reporting/*` | Temporal queries + OTLP export | **Rewrite** |
| `telemetry/jsonl-telemetry.ts` | OpenTelemetry SDK | **Replace** |
| `harness/*` (RBAC, shell guards, outcome tool) | Activity-internal code | **Keep ~70%** |
| `harness/limits.ts` (cognitive circuit breaker) | Activity-internal + workflow retry policy | **Adapt** |
| Ports ([../../src/ports/](../../src/ports/)) | Activity-internal abstractions | **Keep ~90%** |
| Adapters ([../../src/adapters/](../../src/adapters/)) | Used inside activities | **Keep 90%** |
| `entry/main.ts`, `watchdog.ts`, `supervise.ts` | Worker bootstrap + workflow client | **Rewrite** |
| `entry/bootstrap.ts` | Pre-workflow APM compile + workflow start | **Adapt** |
| Workflows YAML ([../../../../apps/sample-app/.apm/workflows.yml](../../../../apps/sample-app/.apm/workflows.yml)) | Compiled into workflow input | **Keep 100%** |
| APM YAML ([../../../../apps/sample-app/.apm/apm.yml](../../../../apps/sample-app/.apm/apm.yml)) | Compiled into workflow input | **Keep 100%** |
| Lifecycle hooks ([../../../../apps/sample-app/.apm/hooks/](../../../../apps/sample-app/.apm/hooks/)) | Invoked from activities (`local-exec` or dedicated) | **Keep 100%** |
| Triage packs ([../../../../apps/sample-app/.apm/triage-packs/](../../../../apps/sample-app/.apm/triage-packs/)) | Used inside triage activity | **Keep 100%** |

**Headline numbers:** ~5–8K LOC deleted, ~3–5K rewritten, ~15–20K untouched.

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | LLM activities exceed Temporal's recommended duration | High | Medium | `start-to-close-timeout: 4h` + heartbeat every 30s; `RetryPolicy.maximumAttempts: 1` so workflow retries via redev cycle, not Temporal | Session 3 |
| R2 | Workflow code determinism violations slip in | High | High | ESLint scope rule lands in Session 1; replay tests in CI from Session 8 | Session 1 |
| R3 | Streaming tool-call telemetry lost across activity boundary | Medium | Medium | Emit OTel spans + structured logs from inside activity; Temporal records only final `NodeResult` | Session 3 |
| R4 | Long pipelines accumulate too much workflow history | Low | Low | Use `continueAsNew` if history >10K events; current pipelines well under | Session 4 |
| R5 | Activity worker crash mid-LLM-session loses ~1h of work | Medium | Medium | Accept loss; `RetryPolicy.maximumAttempts: 1` for `copilot-agent`; redev cycle handles | Session 3 |
| R6 | Postgres becomes single point of failure | Medium | High | Use managed Postgres (Neon, RDS, Cloud SQL) with PITR; DR drill in Session 8 | Session 1, 8 |
| R7 | Cutover (Session 5) breaks in-flight features | Low | High | Drain mode: old kernel finishes its features; new features start on Temporal | Session 5 |
| R8 | Cognitive circuit-breaker semantics change subtly | Medium | Medium | Activity-local breaker accepted; explicit test cases comparing legacy vs new attempt counting | Session 3 |
| R9 | Approval signal race conditions (signal arrives before `setHandler`) | Low | High | Set signal handlers as first workflow lines (Temporal SDK pattern); test explicitly | Session 4 |
| R10 | Admin CLI feature parity gap delays cutover | Medium | Medium | Inventory CLI verbs in Session 1; map every verb to Temporal client call in Session 4 | Session 4 |
| R11 | Cost of Temporal cluster surprises team | Low | Low | Use Hetzner/DigitalOcean small VM + Neon Postgres free tier for non-prod; ~$50/mo for production | Session 1 |
| R12 | TypeScript SDK ergonomics worse than expected | Low | High | Sessions 1–3 are reversible; Phase 2 checkpoint reassesses Restate as alternative | Session 1 |

---

## Operational Topology

### Local development
```
┌─────────────────────────────────────────────────┐
│ Devcontainer                                    │
│  ├── Node 22 (existing)                         │
│  ├── Python 3.11 (existing)                     │
│  └── temporal server start-dev                  │
│       ├── Frontend (gRPC :7233)                 │
│       ├── Web UI (:8233)                        │
│       └── In-memory persistence                 │
│                                                  │
│  Workers run as `npm run temporal:worker`       │
│  Pipeline started via `npm run agent:run`       │
│   (which now starts a workflow)                 │
└─────────────────────────────────────────────────┘
```

### CI
```
┌─────────────────────────────────────────────────┐
│ GitHub Actions                                  │
│  ├── Ephemeral Temporal via docker-compose      │
│  └── Test workers spawn during integration test │
└─────────────────────────────────────────────────┘
```

### Production target (initial — single feature concurrency)
```
┌─────────────────────────────────────────────────┐
│ Hetzner CX22 / DO droplet (~$10–25/mo)          │
│  ├── temporal-server (frontend+history+matching)│
│  └── temporal-ui                                │
│ Managed Postgres (Neon free tier or $25/mo)     │
│ Worker fleet: 1 node initially, k8s-ready       │
└─────────────────────────────────────────────────┘
```

### Production target (scaled — multi-feature concurrency)
```
┌─────────────────────────────────────────────────┐
│ k8s namespace `temporal-prod`                   │
│  ├── frontend (replicas: 2)                     │
│  ├── history (replicas: 2)                      │
│  ├── matching (replicas: 2)                     │
│  ├── internal-frontend (replicas: 1)            │
│  └── ui (replicas: 1)                           │
│ Managed Postgres with PITR                      │
│ Worker fleet (replicas: N, HPA on queue depth)  │
│ OTLP collector → Honeycomb / Grafana Tempo      │
└─────────────────────────────────────────────────┘
```

---

## Determinism Constraints (workflow code)

Workflow code (everything under `src/temporal/workflow/`) must be **deterministic across replays**. Forbidden:

- `Date.now()`, `new Date()` — use `workflowInfo().runStartTime` or `Workflow.now()` (Temporal time)
- `Math.random()` — use `Workflow.uuid4()` if randomness needed
- `process.env` reads — pass env via workflow input
- `node:fs`, `node:child_process`, `node:net`, any I/O
- `setTimeout`, `setInterval` — use `Workflow.sleep()`, `Workflow.condition()`
- Direct adapter or port imports
- `import.meta.url`-based path resolution
- Imports from `@github/copilot-sdk` or any LLM SDK
- Async iterators not provided by Temporal SDK
- Any module with hidden global state (locales, regex caches sourced from Date, etc.)

Allowed:
- Pure functions from `domain/` (already lint-checked)
- Temporal SDK primitives: `proxyActivities`, `condition`, `sleep`, `setHandler`, `defineSignal`, `defineQuery`, `patched`
- `JSON.parse/stringify` on workflow inputs
- Standard ECMAScript collections, `structuredClone`

ESLint rule lands in Session 1, Phase 2.

---

## What is *not* changing

These survive the migration unchanged. Implementing agents must not modify them without an explicit out-of-scope ticket:

- `.apm/apm.yml` schema and compiler
- `.apm/workflows.yml` schema (Temporal reads the same YAML)
- `.apm/instructions/` markdown
- `.apm/skills/` declarations
- `.apm/mcp/` declarations
- `.apm/triage-packs/*.json`
- `.apm/hooks/*.sh`
- `agent-commit.sh`, `agent-branch.sh`
- `.dagent/<slug>/` directory structure (artifacts, logs, kickoff)
- The Node I/O contract (`consumes_kickoff`, `consumes_artifacts`, `produces_artifacts`)
- `roam-code` integration

---

## Sign-off Required Before Session 1

- [ ] Engineering lead approves ADR
- [ ] Operations approves topology + cost projection
- [ ] Risk register reviewed; mitigations accepted
- [ ] Determinism constraints documented and understood by all implementing agents
- [ ] Decision: target managed Postgres provider (Neon / RDS / Cloud SQL / Supabase)
- [ ] Decision: target hosting for non-dev Temporal (single VM / k8s / managed)
- [ ] Decision: OTLP export target (Honeycomb / Grafana Tempo / Datadog / Jaeger self-hosted)
