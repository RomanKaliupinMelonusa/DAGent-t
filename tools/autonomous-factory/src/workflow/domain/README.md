# `src/workflow/domain/` — Thin Barrel over `src/domain/`

> Single-file barrel. The real source lives in [`src/domain/`](../../domain/).

## Why this directory still exists

Workflow code imports the pure-domain functions through `./domain/index.js`
(or `../domain/index.js` from a sibling file). Keeping the barrel here lets
the workflow layer:

1. **Document the determinism boundary** — only the symbols re-exported from
   [`./index.ts`](./index.ts) are reachable from workflow scope. `progress-tracker`
   and `invocation-id` are intentionally omitted: the former is replaced by
   Temporal-native primitives (timeouts, signals, queries, child workflows);
   the latter pulls in `node:crypto.randomBytes` and is consumed only by
   activities.
2. **Insulate workflow imports from per-file paths under `src/domain/`** —
   refactors that re-shuffle modules in the canonical layer don't ripple
   into workflow code.

## No overrides

Earlier revisions of this directory shipped workflow-safe twins of
`error-signature.ts` (pure-JS SHA-256) and `transitions.ts` (caller-supplied
`now: string`). Both shapes have since been promoted to canonical in
`src/domain/`, so this barrel is now a verbatim re-export — no overrides,
no parity tests required.
