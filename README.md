# DAGent — Demo Branch (`demo/single-file-pipeline`)

> **DO NOT MERGE.** This branch is a stripped-down demo of the
> agentic-pipeline core idea. Production code lives on
> `project/temporal-migration`.

Write a spec. Get a tested Pull Request — through a single ~1,200-LOC
pipeline you can read in one sitting. Six nodes, JSON state on disk,
index-jump failure routing, and a `try/catch/finally` PR-creation
finalizer that always runs. No Temporal, no DAG kernel, no distributed
system.

## Quick start

```bash
npm install
npm run demo -- \
  --slug demo-quick-view \
  --app apps/commerce-storefront \
  --spec apps/commerce-storefront/quick_view_new_spec.md \
  --e2e-guide demo/inputs/e2e-guide.md
```

Resume after a crash:

```bash
npm run demo -- --resume demo-quick-view --app apps/commerce-storefront
```

## What's here

| Path | Purpose |
|---|---|
| [demo/](demo/) | Pipeline source (~1,200 LOC across 7 TS files) |
| [demo/README.md](demo/README.md) | Architecture + run instructions |
| [demo/prompts/](demo/prompts/) | Auto-generated agent prompts (`npm run build:prompts`) |
| [demo/scripts/](demo/scripts/) | Reused shell wrappers: `agent-branch.sh`, `agent-commit.sh`, `setup-roam.sh`, `poll-ci.sh` |
| [apps/commerce-storefront/.apm/](apps/commerce-storefront/.apm/) | Source-of-truth APM instructions/agents (read by the prompt flattener) |
| [apps/commerce-storefront/](apps/commerce-storefront/) | The PWA Kit storefront target app |

## What was here

The pre-prune branch (`project/temporal-migration`) carried a Temporal
worker, DAG kernel, APM compiler, telemetry, triage LLM, lifecycle
hooks, archive subsystem, admin CLI — roughly 20× the surface area.
This branch keeps only what a budget owner needs to see working in 15
minutes:

1. End-to-end agentic delivery with integration testing.
2. Mixed agent + script nodes.
3. Per-node tool/folder allowlists (RBAC).
4. Failure routing between nodes with a global retry cap.


## License & status

Demo branch. Not for production. See [demo/README.md](demo/README.md).
