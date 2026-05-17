# PWA Kit Reference Snapshot

Vendored API-surface snapshot of `@salesforce/retail-react-app` at the version pinned in `.apm/apm.yml` → `config.dependencies.pinned`.

**Do not edit by hand.** Regenerate with:

```bash
node tools/autonomous-factory/scripts/snapshot-pwa-kit-api.mjs apps/commerce-storefront
```

## What lives here

- `VERSION` — the installed package version the snapshot was taken from.
- `api-surface.json` — sorted list of exported identifiers under `app/components`, `app/hooks`, `app/pages`, each of the form `<file-relative-path>:<exportName>`.

## Why

The storefront agents reason about the PWA Kit base template (`ProductViewModal`, `useProduct`, `useProductViewModal`, …). Without a vendored snapshot, a silent `npm install` bump would rewire their mental model with no triage signal. The preflight in `tools/autonomous-factory/src/lifecycle/dependency-pinning.ts`:

1. **Fails fatally** when the installed version falls outside `config.dependencies.pinned` (hard guard).
2. **Emits an advisory diff** against this snapshot and injects it into the prompts of `storefront-dev`, `storefront-debug`, and `e2e-author` (soft warning for in-range patch drift).

## Upgrading

1. Bump the pin in `apps/commerce-storefront/.apm/apm.yml`.
2. Run `npm install` inside `apps/commerce-storefront/`.
3. Regenerate this snapshot with the command above.
4. Commit the new `api-surface.json` + `VERSION` alongside the pin bump.
