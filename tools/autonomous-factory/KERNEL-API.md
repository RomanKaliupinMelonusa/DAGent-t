# Kernel API — DAG State Machine

> Minimal API surface for node implementors and external consumers.
> State authority lives in `src/kernel/pipeline-kernel.ts` (Command/Effect reducer),
> persistence in `src/adapters/json-file-state-store.ts`, and the admin CLI in
> `src/cli/pipeline-state.ts` (invoked via `npm run pipeline:*`).

## State Primitives

| Function | Signature | Purpose |
|---|---|---|
| `initState` | `(slug, workflowType, contextJsonPath?) → InitResult` | Bootstrap pipeline state from compiled APM context |
| `completeItem` | `(slug, itemKey) → PipelineState` | Mark a node as done; unblocks downstream |
| `failItem` | `(slug, itemKey, message) → FailResult` | Record structured failure; feeds triage |
| `getStatus` | `(slug) → PipelineState` | Read current state (no mutation) |
| `getNext` | `(slug) → NextAction` | Next single actionable item |
| `getNextAvailable` | `(slug) → NextAction[]` | All parallelizable ready items |

## Reset Primitives

| Function | Signature | Purpose |
|---|---|---|
| `resetNodes` | `(slug, seedKey, reason, maxCycles?, logKey?) → ResetResult` | Generic DAG-cascading reset: seed node + all transitive downstream. `logKey` namespaces the cycle budget in errorLog. |
| `resetScripts` | `(slug, phase, maxCycles?) → ResetResult` | Reset all script-type nodes in a named phase |
| `resetPhases` | `(slug, phasesCsv, reason, maxCycles?) → ResetResult` | Reset all nodes in specified phases (CSV) |
| `salvageForDraft` | `(slug, failedItemKey) → PipelineState` | Graceful degradation: mark failed + downstream as N/A, preserve salvage survivors for Draft PR |

## Graph Utilities

| Function | Signature | Purpose |
|---|---|---|
| `getDownstream` | `(state, seedKeys) → string[]` | BFS transitive descendants via reverse DAG |
| `getUpstream` | `(state, seedKeys) → string[]` | BFS transitive ancestors via forward DAG |
| `formatPhaseHeading` | `(phase, phaseLabels?) → string` | Config-driven phase slug → human heading |

## Metadata Setters

| Function | Signature | Purpose |
|---|---|---|
| `setNote` | `(slug, note) → PipelineState` | Append implementation note |
| `setDocNote` | `(slug, itemKey, note) → PipelineState` | Per-item documentation note |
| `setHandoffArtifact` | `(slug, itemKey, json) → PipelineState` | Structured handoff data between nodes |
| `setUrl` | `(slug, url) → PipelineState` | Set deployed URL |
| `setLastTriageRecord` | `(slug, record) → PipelineState` | Persist triage classification result |

## CLI Convenience (src/cli/pipeline-state.ts)

| Function | Signature | Purpose |
|---|---|---|
| `resumeAfterElevated` | `(slug, maxCycles?) → ResetResult` | Undo salvageForDraft after successful elevated apply |
| `recoverElevated` | `(slug, errorMessage, maxFailCount?, maxDevCycles?) → ResetResult` | CLI convenience: derives infra phase keys, delegates to `failItem` + `resetNodes` |

## Deprecated (backward-compat aliases)

| Symbol | Replacement |
|---|---|
| `resetForReroute` | `resetNodes` (alias, same signature minus `logKey`) |
| `buildInfraRollbackContext` | `buildPhaseRejectionContext` |
| `injects_infra_rollback` | `injects_phase_rejection` (node config field) |

## Key Invariants

1. **Atomicity** — All state mutations wrapped in POSIX `withLock()` (mkdirSync-based mutex)
2. **Idempotency** — `salvageForDraft` checks errorLog before double-salvage
3. **Cycle budgets** — Each reset function tracks independent counters in errorLog via `logKey`
4. **DAG cascade** — `getDownstream()` + `cascadeBarriers()` ensure full propagation through sync points
5. **Error signatures** — Volatile tokens stripped → stable SHA-256 fingerprints for cross-cycle identity
6. **N/A preservation** — Reset functions skip items marked `"na"` (workflow-type exclusions are permanent)

## Configuration Surface (apm.yml → config)

| Config Key | Type | Default | Used By |
|---|---|---|---|
| `cycle_limits.reroute` | number | 5 | `resetNodes` (triage reroute budget) |
| `cycle_limits.phases` | number | 5 | `resetPhases`, `resumeAfterElevated` |
| `cycle_limits.scripts` | number | 10 | `resetScripts` |
| `max_same_error_cycles` | number | 3 | Death spiral detection |
| `transient_retry.max` | number | 5 | CI poll / script transient retries |
| `transient_retry.backoff_ms` | number | 30000 | Backoff between transient retries |
| `fatal_sdk_errors` | string[] | (built-in) | Non-retryable SDK patterns |
| `model_pricing` | object | Claude Opus 4 | Cost estimation |
| `redevelopment_categories` | string[] | `["test"]` | Downstream failure context injection |
| `phase_labels` | Record | (title-case) | Phase heading formatting |
| `ci_scope_warning` | string | — | CI/CD scope guidance in redevelopment |

## Per-Node Configuration (workflows.yml → nodes)

| Field | Type | Purpose |
|---|---|---|
| `circuit_breaker` | object | Per-node retry/failure config (min_attempts_before_skip, allows_revert_bypass, etc.) |
| `triage` | string | Triage profile name for failure routing |
| `pre` / `post` | string | Lifecycle hook commands (kernel-executed for all handler types) |
| `captures_head_sha` | boolean | Auto-capture HEAD SHA for downstream poll nodes |
| `salvage_survivor` | boolean | Survives graceful degradation |
| `injects_phase_rejection` | boolean | Inject phase-rejection context on redevelopment |
| `auto_skip_if_no_changes_in` | string[] | Git-based auto-skip |
| `force_run_if_changed` | string[] | Force-run on specific directory changes |

## Triage Profile Configuration (workflows.yml → triage)

| Field | Type | Purpose |
|---|---|---|
| `classifier` | `"rag+llm" \| "rag-only" \| "llm-only"` | Classification strategy |
| `packs` | string[] | RAG triage pack references |
| `max_reroutes` | number | Total reroute budget before halt |
| `routing` | Record | Domain → `{ route_to, retries?, description? }` |
