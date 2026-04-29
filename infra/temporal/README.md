# Temporal — Local Cluster

Docker-compose stack for running a full Temporal cluster (server + UI + Postgres) locally and in CI. Used by the Temporal migration (see [../../tools/autonomous-factory/docs/temporal-migration/](../../tools/autonomous-factory/docs/temporal-migration/)).

## Two run modes

Pick whichever matches the test you are running:

| Mode | Command | When to use |
|---|---|---|
| **Dev server** (in-memory) | `temporal server start-dev` | Fast iteration; hello-world; signal/query smoke tests. No persistence across restarts. |
| **Full compose stack** (Postgres-backed) | `docker compose -f infra/temporal/docker-compose.yml up -d` | Replay tests; crash-recovery tests; anything that needs durable history. |

Both expose the frontend on `localhost:7233` and the Web UI on `localhost:8233`.

## Quick start (compose)

```bash
# from repo root
docker compose -f infra/temporal/docker-compose.yml up -d
temporal operator cluster health     # should print SERVING
open http://localhost:8233           # Temporal Web UI

# tear down (preserve data)
docker compose -f infra/temporal/docker-compose.yml down

# tear down + wipe volumes
docker compose -f infra/temporal/docker-compose.yml down -v
```

## Quick start (dev server)

```bash
temporal server start-dev --ui-port 8233
# Frontend on :7233, UI on :8233, in-memory persistence.
# Ctrl-C exits and discards all history.
```

## Image pinning

Compose pins images to a specific minor tag (`temporalio/auto-setup:1.24.2`, `temporalio/ui:2.30.3`, `postgres:15.6`). Before Session 8 (replay tests require byte-stable history format) tighten these to immutable SHA digests:

```bash
docker buildx imagetools inspect temporalio/auto-setup:1.24.2 --raw | jq -r '.manifests[0].digest'
```

…and replace the tag with `temporalio/auto-setup:1.24.2@sha256:<digest>`.

## What is intentionally not here

- **Elasticsearch / advanced visibility**: not needed for current parity tests.
- **TLS / mTLS**: dev cluster only. Production topology lands in [01-topology-decision.md](../../tools/autonomous-factory/docs/temporal-migration/01-topology-decision.md).
- **Multi-namespace seeding**: the orchestrator uses the `default` namespace until a multi-tenant story is decided.

## Workspace dep-resolution gotcha (read once)

The orchestrator's Temporal worker bundles workflows with webpack, which transitively requires `ajv@^8`. ESLint v9 in the same workspace eagerly imports `ajv@6` via `@eslint/eslintrc` and `eslint/lib/shared/ajv.js`. npm 10 nested `overrides` did **not** reliably co-install both versions in this workspace topology, so `scripts/postinstall-ajv-shim.mjs` deterministically nests `ajv@6.14.0` (plus `uri-js`) inside the eslint chain on every `npm install`. The shim is idempotent and runs automatically. If you reinstall and `npm run lint` errors with `Cannot set properties of undefined (setting 'defaultMeta')`, run `node scripts/postinstall-ajv-shim.mjs` manually — the postinstall hook may have been skipped (e.g. by `--ignore-scripts`).
