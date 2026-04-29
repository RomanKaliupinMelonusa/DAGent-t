# `src/temporal/workflow/`

Deterministic workflow code. Runs inside Temporal's replay sandbox.

## Hard rules

- No filesystem, no network, no `child_process`.
- No `Date`, `Date.now()`, `Math.random()`, `setTimeout`, `setInterval`.
- No imports from `adapters/`, `ports/`, `handlers/`, `kernel/`, `loop/`.
- No imports from any LLM SDK.
- Activities are reached via `proxyActivities<typeof activities>()`, **not** by importing activity files directly.

All bans are enforced by [`../../../eslint.config.js`](../../../eslint.config.js). The `__fixtures__/` directory is exempt from the determinism rule because it deliberately violates it for the lint regression test.
