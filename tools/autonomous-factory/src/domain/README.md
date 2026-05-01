# `src/domain/` — Pure Domain Logic

Pure functions. No I/O. No side effects. All the math behind the DAG lives here.

See [Architecture overview](../../docs/architecture.md) for how the
workflow and activities consume this layer. A workflow-VM-safe twin of
these modules lives at [`src/workflow/domain/`](../workflow/domain/README.md);
that README explains why the duplication is intentional and which files
diverge.

## Role in the architecture

`domain/` is the algorithmic core. Every module here is a pure function — given the same inputs, it always returns the same outputs, and it never touches the filesystem, network, or subprocess.

Nothing in this folder may import `node:fs`, `node:child_process`,
`@github/copilot-sdk`, or anything from `adapters/`, `activities/`,
`ports/`, or `workflow/`. The direction of dependency is strictly one-way:
activities and the workflow's twin domain depend on this folder; this
folder depends on nothing in the engine.

## Files

| File | Purpose | Key exports |
|---|---|---|
| [scheduling.ts](scheduling.ts) | Computes the next batch of dispatchable items from DAG state. | `schedule`, `SchedulableItem`, `ScheduleResult` |
| [dag-graph.ts](dag-graph.ts) | Graph traversal — forward/reverse edges, topological sort, cascade barriers. | `getDownstream`, `getUpstream`, `cascadeBarriers`, `topologicalSort`, `DependencyGraph` |
| [transitions.ts](transitions.ts) | Pure state transition functions: `completeItem`, `failItem`, `resetNodes`, `salvageForDraft`, `resumeAfterElevated`. Cascading post-deploy resets live here. | `completeItem`, `failItem`, `resetNodes`, `resetScripts`, `salvageForDraft`, `resumeAfterElevated`, `bypassNode`, `findInfraPollKey`, `findInfraDevKey`, `TransitionState` |
| [init-state.ts](init-state.ts) | Builds initial `PipelineState` from compiled workflow nodes. | `buildInitialState`, `CompiledNode`, `InitInputs`, `InitialState` |
| [failure-routing.ts](failure-routing.ts) | Resolves which DAG nodes to reset for a given fault domain via workflow `fault_routing` table. | `resolveFailureTarget`, `resolveFailureRoutes` |
| [error-signature.ts](error-signature.ts) | Deterministic error fingerprint (normalised hash) for the identical-error circuit breaker. | `computeErrorSignature` |
| [error-classification.ts](error-classification.ts) | Classifies SDK errors as fatal vs retriable. | `isFatalSdkError`, `DEFAULT_FATAL_SDK_PATTERNS` |
| [volatile-patterns.ts](volatile-patterns.ts) | Regex library that strips timestamps / run IDs / SHAs before fingerprinting. | `compileVolatilePatterns`, `mergeVolatilePatterns`, `DEFAULT_VOLATILE_PATTERNS` |
| [cycle-counter.ts](cycle-counter.ts) | Enforces the 5-redev-cycle / 3-redeploy budget. | `checkCycleBudget`, `countErrorSignature` |
| [pruning.ts](pruning.ts) | Computes `dormant` keys at init based on workflow type. | `computeDormantKeys`, `PrunableNode` |
| [batch-interpreter.ts](batch-interpreter.ts) | Classifies a scheduled batch into outcome categories (all-complete, mixed, all-failed…). | `interpretBatch`, `BatchOutcome`, `BatchSignals` |
| [progress-tracker.ts](progress-tracker.ts) | Snapshots DAG progress for telemetry. | `snapshotProgress` |
| [invocation-id.ts](invocation-id.ts) | Deterministic per-attempt invocation id. Used identically by the workflow twin so replays produce stable ids. | `computeInvocationId` |
| [index.ts](index.ts) | Barrel re-exports. | (all of the above) |

Approval SLAs, stall detection, and dangling-invocation recovery are no
longer this layer's concern — Temporal handles them via
`Workflow.condition()` + activity timeouts + heartbeat timeouts. See the
[workflow/domain README](../workflow/domain/README.md).

## Public interface

Every function is pure. Typical call shapes:

```ts
const result = schedule(items, dependencies);
// → { kind: "items", items: [...] } | { kind: "complete" } | { kind: "blocked" }

const transition = completeItem(state, "backend-dev");
// → { nextState, logEntry }

const reset = resetNodes(state, seedKey, reason, maxCycles);
// → { nextState, resetKeys, cycleCount, halted? }
```

Transition results always carry a `nextState` — callers apply it as a replacement, never mutate in place.

## Invariants & contracts

1. **No `async`.** Every function is synchronous. If something feels like it needs I/O, it belongs in `adapters/` and the port interface should be in `ports/`.
2. **No hidden state.** No module-level mutable variables (regex caches are acceptable because they are input-deterministic).
3. **Structural equality over identity.** Functions return new objects; never `===`-compare state objects between calls.
4. **All volatile tokens stripped before fingerprinting.** If a new category of volatile string (e.g. a new cloud provider's request ID format) appears in failure traces, add the pattern to [volatile-patterns.ts](volatile-patterns.ts).

## How to extend

**Add a new transition** (e.g. `pausePipeline`):

1. Add a pure function in [transitions.ts](transitions.ts) taking `(state, …args) => { nextState, … }`.
2. Export it from [index.ts](index.ts).
3. Mirror the function in the workflow-VM twin at [`src/workflow/domain/transitions.ts`](../workflow/domain/transitions.ts) (no `node:crypto`, no I/O); call it from the workflow's signal/update/dispatch handlers.
4. Bump `WORKFLOW_VERSION` (or wrap with `patched()`) per the determinism rules in [`src/workflow/README.md`](../workflow/README.md).
5. Unit-test both copies in `__tests__/`.

**Add a new scheduling rule** (e.g. priority boosting):

1. Extend [scheduling.ts](scheduling.ts) or wrap it — prefer a new function rather than mutating `schedule()`.
2. Mirror the change in [`src/workflow/domain/scheduling.ts`](../workflow/domain/scheduling.ts).

**Add a new failure-fingerprint strategy**:

1. Add patterns to [volatile-patterns.ts](volatile-patterns.ts) (preferred — no code change).
2. Or add a new fingerprint fn alongside `computeErrorSignature` and let the kernel choose via a rule.

## Gotchas

- **Return new objects, not in-place mutations.** TypeScript will let you, but it breaks the kernel's snapshot assumption and causes phantom state flicker in parallel batches.
- **Fingerprint drift.** If two semantically-identical errors produce different signatures, the circuit breaker fails open and you get retry loops. Always run a failing scenario through `computeErrorSignature` twice and compare.
- **Cascading resets are opinionated.** `resetNodes` cascades post-deploy "done" items back to pending when deploy items are reset. That behaviour is load-bearing for preventing stale verification — if you change it, redev cycles will succeed with stale test results.
- **`init-state.ts` is where workflow-type pruning lives.** Pipeline items don't appear and disappear dynamically — their `dormant` / `na` status is set once at init.

## Related layers

- Mirrored by → [`src/workflow/domain/`](../workflow/domain/README.md) (the workflow-VM-safe twin)
- Consumed by → [`src/triage/`](../triage/README.md) for fingerprinting and failure routing
- Consumed by → [`src/activities/`](../activities/README.md) and [`src/activities/support/`](../activities/support/README.md) for non-workflow contexts
- Not consumed by adapters or ports (one-way rule)
