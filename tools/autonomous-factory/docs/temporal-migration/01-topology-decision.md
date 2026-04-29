# 01 — Topology Decision Record

> Operations + engineering jointly fill in this document during Phase 0/1 of Session 1. It captures the **decisions** the architecture document ([00-spec.md](00-spec.md)) demands; it does not duplicate architecture.
>
> Status: **Draft — pending sign-off.** Decisions below are recommendations; replace `[TBD]` markers with the chosen value before merging.

> ⚠️ **Outstanding decisions block Session 1 exit gate.** Decisions D1–D6 and the cost-estimate table cells must be filled in by Operations before the Session 1 exit checklist in [`session-1-foundation.md`](session-1-foundation.md) can be signed. Item A5 (non-prod cluster provisioning) also requires operational sign-off in this doc — tracked as D7 below.

---

## Decision Summary

| # | Decision | Recommendation | Chosen | Owner |
|---|---|---|---|---|
| D1 | Managed Postgres provider | Neon (free tier non-prod, $25/mo prod) | [TBD] | Operations |
| D2 | Non-prod Temporal hosting | Hetzner CX22 (~€4/mo) or Temporal Cloud (free tier) | [TBD] | Operations |
| D3 | Production Temporal hosting | k8s on existing cluster, or Temporal Cloud | [TBD] | Operations |
| D4 | OTLP target | Honeycomb free tier (20M events/mo) | [TBD] | Engineering |
| D5 | Temporal namespace strategy | Single `dagent-prod` initially; per-tenant namespaces deferred | [TBD] | Engineering |
| D6 | Secret management | 1Password vault item `temporal-prod-creds` | [TBD] | Operations |
| D7 | Non-prod cluster provisioned & reachable | Yes / pending | [TBD] | Operations |

---

## Cost Estimate (initial — single feature concurrency)

| Component | Provider | Monthly cost |
|---|---|---|
| Temporal frontend+history+matching | [D2] | $[TBD] |
| Postgres | [D1] | $[TBD] |
| OTLP backend | [D4] | $[TBD] (free tier expected) |
| Worker fleet | existing infra | $0 incremental |
| **Total** | | **$[TBD] / mo** |

Production target (multi-feature concurrency) cost estimate to be added as a follow-up under "## Scaled Production" once Session 4 establishes worker concurrency requirements.

---

## DR Sketch

| Failure mode | Recovery |
|---|---|
| Worker crash | Activity heartbeat timeout → workflow auto-retries on next worker. RTO: <5 min. |
| Single Temporal node loss | Redeploy from container image; Postgres holds state. RTO: <30 min. |
| Postgres data loss | PITR restore from managed provider (Neon: 7-day default). RPO: <1 min, RTO: <2h. |
| Region loss | Out of scope for initial topology; Session 8 hardening pass adds multi-region. |

Full DR drill scheduled for Session 5 / Phase 8.

---

## R12 Ergonomics Verdict

> Filled in at the end of Phase 2 (after task B6 succeeds), before Session 1 exit review.

- [x] SDK installed cleanly on Node 22 + ESM. Notes: SDK ships dual CJS/ESM builds; orchestrator is `"type":"module"` and Temporal types resolve under `NodeNext`. **Caveats:** (1) `tsx`'s global `Module._resolveFilename` hook is incompatible with the worker's webpack-based workflow bundler — the bundler tries to resolve `.ts` paths inside `node_modules`. The production path must be precompiled JS (`tsc -p tsconfig.temporal.json` → `dist/temporal/`, then `node dist/temporal/worker/main.js`). (2) The webpack chain (`schema-utils → ajv-keywords`) requires `ajv@^8`, while ESLint v9 internally loads `@eslint/eslintrc` and `eslint/lib/shared/ajv.js` which both `require("ajv")` v6 *eagerly at module load*. Co-installing both versions via npm `overrides` was unreliable; resolution is a deterministic [postinstall shim](../../../scripts/postinstall-ajv-shim.mjs) that nests `ajv@6.14.0` (and `uri-js`) inside `node_modules/eslint/node_modules/` and `node_modules/@eslint/eslintrc/node_modules/`. Idempotent, runs automatically on `npm install`.
- [x] `TestWorkflowEnvironment` startup overhead acceptable. Notes: Not used. Initial attempt with `TestWorkflowEnvironment.createTimeSkipping()` failed with the same webpack/ajv-keywords resolution error (it bundles workflows in-process). Pivoted to an end-to-end integration test that spawns the compiled worker + client against a real cluster — this matches the production path 1:1 and is what `npm run temporal:test:integration` runs. Total round-trip: ~1.5s including bundle.
- [x] `proxyActivities` / `Context.current()` mental model accepted by team. Notes: The ergonomics in `src/temporal/workflow/hello.workflow.ts` and `src/temporal/activities/hello.activity.ts` are clean. The clear separation between deterministic workflow code and side-effectful activity code maps directly onto the `kernel`/`adapters` split already familiar from the existing orchestrator architecture. ESLint determinism scope (3 rules, all firing on the fixture) makes the boundary mechanically enforceable rather than convention-only.
- [x] No showstopper.

**Verdict:** **pass-with-notes** — proceed to Session 2.

Two production-relevant lessons must propagate forward:
1. **Workers run from compiled JS, not `tsx`.** Document in Session 2 onward; the worker's webpack bundler and `tsx` are incompatible.
2. **The `ajv` shim is workspace-wide infrastructure.** It belongs in any topology decision involving the orchestrator's `node_modules` (e.g. CI image bake, devcontainer rebuild, future eject from npm overrides). The shim is small (~80 lines, idempotent) and tracked at `scripts/postinstall-ajv-shim.mjs`.

---

## Open Question — TestWorkflowEnvironment vs Real-Cluster Tests

### Context

Session 1's plan called for workflow unit tests using `@temporalio/testing`'s `TestWorkflowEnvironment` (in-process Temporal). During Phase 2, that path was abandoned because `TestWorkflowEnvironment` runs the same webpack bundler that hit the `ajv-keywords` / `ajv@8` resolution conflict (resolved later by the postinstall shim, but only after the integration test had already pivoted). The Session 1 integration test now spawns the compiled worker against a real cluster instead — see `tools/autonomous-factory/src/temporal/__tests__/hello.integration.test.ts`.

### Why it matters

Session 2 (DagState parity tests) and Session 3 (per-activity unit / snapshot suites) both currently spec `TestWorkflowEnvironment` as the test harness. Real-cluster tests are slower (~1.5s per test versus in-process) and require a Temporal cluster to be running (dev server or docker-compose), which complicates pure-domain unit tests and CI parallelism.

### Options

- **A. Re-attempt `TestWorkflowEnvironment`** now that the `ajv` shim is in place — it may resolve the bundler conflict. Cost: roughly half a day of investigation; risk that the shim addresses the lint chain but leaves an in-process bundler-only failure mode untouched.
- **B. Pivot Sessions 2 & 3 to real-cluster integration tests for everything.** Cost: doc updates only, but slower CI and tighter coupling between unit-level tests and infra availability.
- **C. Hybrid.** Pure `DagState` (Session 2 domain port) is just a class — test it with Vitest, no Temporal at all. Use real-cluster tests for activities (Session 3), where a real cluster is honest about the production path anyway. Avoids the question entirely for Session 2 and contains the cost to Session 3.

### Recommendation

**Option C.** `DagState` is a plain class and does not need a Temporal-aware test harness. Activity tests are heavier and a real cluster matches the production path. If a need for in-process workflow tests resurfaces in Session 4 (workflow code, signals, queries), revisit Option A then with the shim already in place.

### Decision required by

Before Session 2 kickoff.

### Owner

Engineering lead.

---

## Open Question — Vendor the `ajv` shim packages

### Context

`scripts/postinstall-ajv-shim.mjs` calls `npm pack ajv@6.14.0` and `npm pack uri-js@4.4.1` from inside the `npm install` postinstall hook to stage tarballs into the eslint chain. This works but has three weaknesses:

1. **Network dependency at every install.** A clean clone in an offline / air-gapped CI runner fails — the shim needs network.
2. **No integrity verification.** The packages are downloaded fresh from the registry without a SHA / `dist.integrity` check. The repo's `package-lock.json` integrity guards do not cover them.
3. **Re-entrant npm.** `execSync('npm pack ...')` runs while the parent `npm install` is mid-flight. Officially undefined behavior; works today on npm 10 but could break on a future minor.

### Options

- **A. Vendor the tarballs.** Commit `ajv-6.14.0.tgz` and `uri-js-4.4.1.tgz` (~120KB combined) under `scripts/vendor/` and have the shim `tar -xzf` from there instead of `npm pack`. Removes all three weaknesses.
- **B. Add SHA verification only.** Read expected `dist.integrity` from a constants file at the top of the shim and verify the packed tarball matches. Keeps network dependency but eliminates supply-chain risk.
- **C. Status quo.** Accept the risks; revisit if a real failure surfaces.

### Recommendation

**Option A.** Cost is ~120KB of git blob and a manual upgrade workflow when ajv v6 has security advisories (it is in maintenance mode, so churn should be near zero). Removes three independent failure modes.

### Decision required by

Before Session 2 starts cutting domain-port code that depends on `npm run lint` being green in offline / cached CI environments.

### Owner

Engineering lead.

---

## References

- [00-spec.md](00-spec.md) — Operational topology diagrams; risk register R6, R11, R12
- [README.md](README.md) — Migration master plan
- [session-1-foundation.md](session-1-foundation.md) — Tasks A4, A5
