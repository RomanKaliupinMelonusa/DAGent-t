# Demo Pipeline — Single-File Engine

> **DO NOT MERGE.** This branch is a sales artifact demonstrating the
> agentic-pipeline core idea. Production code lives on
> `project/temporal-migration`. Never merge this branch back.

## What this is

A ~450-LOC linear pipeline that drives 5 agentic + script nodes from a
spec + e2e-guide to a draft PR. No Temporal, no DAG kernel, no
distributed system. State is JSON on disk. Failure routing is index
jumps. `Ctrl+C` is the admin interface.

```
dev → unit-test → e2e-author → e2e-runner → storefront-debug
                                    │             │
                                    └─→ debug ────┘
                                          │
                                          ↓ (success)
                                       unit-test
                              ───────────────────────
                              finally: pr-creation
```

## Run

```bash
npm run demo -- \
  --spec apps/commerce-storefront/quick_view_new_spec.md \
  --e2e-guide demo/inputs/e2e-guide.md \
  --slug demo-quick-view \
  --app apps/commerce-storefront

# Resume after a crash / Ctrl+C:
npm run demo -- --resume demo-quick-view --app apps/commerce-storefront
```

Outputs: `demo/.runs/<slug>/state.json`, per-node logs in `logs/`,
numbered snapshots in `snapshots/`.

## Layout

| File | Purpose |
|---|---|
| `run.ts` | Entry point + main loop (try/catch/finally) |
| `types.ts` | `Node`, `RunState`, `NodeOutput` |
| `state.ts` | JSON persistence + resume |
| `harness.ts` | RBAC + 4 SDK tools (`file_read`, `write_file`, `shell`, `report_outcome`) |
| `agent.ts` | `runAgentNode` — Copilot SDK session wrapper |
| `script.ts` | `runScriptNode` — `child_process.spawn` wrapper |
| `nodes.ts` | The 6-node array literal |
| `prompts/*.md` | Flattened agent prompts (auto-built from `.apm/`) |
| `build-prompts.mjs` | Flattener — idempotent, runs as `predemo` hook |
