# 02 — Parity Notes (Session 2 Domain Port)

> Companion to [session-2-domain-port.md](session-2-domain-port.md).
> Scope: documents observable differences between `src/domain/` (legacy) and `src/temporal/workflow/domain/` (workflow-scoped twin). Read after Session 2 lands.

---

## TL;DR

**No observable behaviour deltas.** The two reducer paths are byte-equivalent given identical inputs. There are two implementation deltas with mechanical equivalence proofs:

1. **Timestamp source** — legacy reads `new Date().toISOString()`; new takes a required `now: string` parameter.
2. **Hash implementation** — legacy uses `node:crypto.createHash("sha256")`; new uses `js-sha256`. Both produce the first 16 hex chars of the SHA-256 digest of the same volatile-stripped input.

Both deltas are mandatory — `Date` and `node:crypto` are forbidden in workflow scope by the determinism ESLint rule (see [00-spec.md](00-spec.md) → "Determinism Constraints").

Cross-path parity is enforced by the test suite at [src/temporal/workflow/__tests__/parity.test.ts](../../src/temporal/workflow/__tests__/parity.test.ts) which runs ≥10 scenarios through both paths and asserts deep-equal results.

---

## Delta 1 — Timestamp source

### Why

`new Date()` and `Date.now()` are non-deterministic across replays and are banned in workflow scope. The Temporal SDK exposes `Workflow.now()` for replay-safe time; the workflow body threads its return value into the reducers.

### What changed

The following reducers in [src/temporal/workflow/domain/transitions.ts](../../src/temporal/workflow/domain/transitions.ts) now require `now: string` (ISO-8601):

| Reducer | Position of `now` |
|---|---|
| `failItem` | 4th positional, before `maxFailuresOrOptions` |
| `resetNodes` | 4th positional, before `maxCycles` |
| `bypassNode` | 5th positional, before `signatureFn` |
| `salvageForDraft` | 3rd positional |
| `resetScripts` | 3rd positional, before `maxCycles` |
| `resumeAfterElevated` | 2nd positional, before `maxCycles` |

`completeItem` is unchanged — it never stamps a log entry.

### Equivalence proof

Tests at `parity.test.ts` freeze legacy `Date` via `vi.setSystemTime(NOW)` and pass the same `NOW` string into the new reducer. Resulting `errorLog[].timestamp` values are byte-identical.

---

## Delta 2 — Hash implementation

### Why

`node:crypto` cannot be imported into workflow code (banned both as a non-determinism risk and as a Node-only built-in incompatible with the workflow sandbox).

### What changed

[src/temporal/workflow/domain/error-signature.ts](../../src/temporal/workflow/domain/error-signature.ts) imports `js-sha256` (~3KB pure-JS SHA-256 implementation, MIT licensed) instead of `node:crypto.createHash`. The function signature, algorithm choice (SHA-256), output format (16-hex prefix), and volatile-pattern pipeline are all identical.

### Equivalence proof

The `parity.test.ts` suite includes a `computeErrorSignature parity` block that hashes 6 sample messages through both implementations and asserts string equality. SHA-256 is deterministic; both impls share the same volatile-pattern pipeline (imported from a single source — `domain/volatile-patterns.ts` and `temporal/workflow/domain/volatile-patterns.ts` are byte-identical copies), so identical inputs yield identical outputs.

### Persistence compatibility

Persisted `errorSignature` values written by the legacy kernel before Session 5 cutover remain byte-compatible with values produced post-cutover. `halt_on_identical` history continues to function across the migration boundary.

---

## Modules deferred to Session 4

The Session 2 spec said these would not be ported. Confirmed:

| Module | Disposition | Replacement |
|---|---|---|
| `domain/approval-sla.ts` | Not ported | Replaced by `Workflow.condition()` + `Workflow.sleep()` race in workflow body. |
| `domain/progress-tracker.ts` | Not ported | Becomes a workflow query handler. |
| `domain/stall-detection.ts` | Not ported | Replaced by Temporal activity `startToCloseTimeout`. |
| `domain/dangling-invocations.ts` | Not ported | Replaced by Temporal activity heartbeat timeouts. |

---

## Modules added beyond the Session 2 spec

| Module | Why |
|---|---|
| `error-classification.ts` | Pure function consumed by handlers downstream; copying it now costs nothing and removes a Session 3 todo. |
| Admin reducers (inside `DagState`) | The session spec listed only DAG-shape transitions. Admin reducers (`reset-scripts`, `resume-after-elevated`, `recover-elevated`) back the CLI verbs Session 4 will rewrite as Temporal signals. Landing them in `DagState` now means Session 4 only adds signal/query plumbing — no new reducer logic. |

---

## What is identical

Every other public symbol in [src/temporal/workflow/domain/index.ts](../../src/temporal/workflow/domain/index.ts) is a byte-for-byte copy of the corresponding symbol in [src/domain/index.ts](../../src/domain/index.ts):

- `dag-graph.ts` — graph traversal
- `scheduling.ts` — `schedule`, `isProducerCycleReady`, types
- `failure-routing.ts` — `resolveFailureTarget`, `resolveFailureRoutes`
- `volatile-patterns.ts` — `DEFAULT_VOLATILE_PATTERNS`, `compileVolatilePatterns`, `mergeVolatilePatterns`
- `cycle-counter.ts` — `checkCycleBudget`, `countErrorSignature`
- `pruning.ts` — `computeDormantKeys`
- `batch-interpreter.ts` — `interpretBatch`
- `init-state.ts` — `buildInitialState`
- `error-classification.ts` — `isFatalSdkError`, `DEFAULT_FATAL_SDK_PATTERNS`
