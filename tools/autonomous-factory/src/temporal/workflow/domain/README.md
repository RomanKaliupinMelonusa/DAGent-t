# `src/temporal/workflow/domain/` — Workflow-Scoped Pure Domain

> Twin of `src/domain/`. Same algorithms; determinism-safe for Temporal workflow code.

## Why a twin exists

`src/domain/` is pure but uses `node:crypto` (`error-signature.ts`) and `new Date().toISOString()` (`transitions.ts`). Both are forbidden in workflow scope by the determinism ESLint rule (see `00-spec.md` → "Determinism Constraints"). The Session 5 cutover will retire the legacy `src/domain/` once `src/temporal/` is the sole production path; until then, both copies coexist and parity is enforced by `__tests__/parity.test.ts`.

## Differences vs `src/domain/`

| File | Difference | Why |
|---|---|---|
| `error-signature.ts` | Uses `js-sha256` instead of `node:crypto.createHash`. | `node:crypto` import is banned in workflow scope. Output is byte-identical (same SHA-256 prefix). |
| `transitions.ts` | Every reducer that emits an `errorLog` entry requires a `now: string` parameter. | `new Date()` is banned in workflow scope. Caller supplies `Workflow.now().toISOString()`. |

Affected reducers: `failItem`, `resetNodes`, `bypassNode`, `salvageForDraft`, `resetScripts`, `resumeAfterElevated`. `completeItem` is unchanged (no log entry).

## What is NOT here (and why)

- `approval-sla.ts` — replaced by `Workflow.condition()` + `Workflow.sleep()` (Session 4).
- `progress-tracker.ts` — becomes a workflow query handler (Session 4).
- `stall-detection.ts` — replaced by Temporal activity timeouts.
- `dangling-invocations.ts` — replaced by Temporal heartbeat timeouts.

## Public surface

Identical to `src/domain/index.ts` minus the four omitted modules above and with the timestamp-injection contract noted in [./transitions.ts](./transitions.ts).
