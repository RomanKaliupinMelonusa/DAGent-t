# Session 6 — Production Hardening (Multi-Tenancy + Operational Maturity)

> Split out from the original Session 5 Phase 8. Session 5 ships the
> minimum cutover surface: drain, deletions (Phase 7), workflow
> versioning policy, replay-in-CI, Dockerfile, basic DR runbook. Session
> 6 is the partner-readiness layer that follows the 30-day stabilization
> window.
>
> **Audience:** Planning Agents supervising the post-cutover hardening
> arc and human reviewers approving production scale-out and partner
> onboarding.

---

## Why this is its own session

Session 5 Phase 8 originally bundled six hardening workstreams together.
In review the dependency graph split cleanly into:

1. **Cutover-blocking** items that have to land at-or-before deletion
   (workflow versioning, replay-in-CI, Dockerfile + boot test, basic DR
   runbook). These stay in Session 5.
2. **Production-shape** items that are valuable but not gating for the
   irreversible delete: multi-tenancy, Helm + HPA, secrets-provider
   port, full DR drill. These lift into Session 6.

Bundling category 2 into Session 5 stretched the irreversible window
unnecessarily. Splitting:

- Makes Session 5 reversible-up-to-deletion *and* shorter (3–5 days).
- Lets the 30-day stabilization window run uncluttered by partner-prep
  work.
- Gives partner-onboarding (Antigravity, Salesforce per principal-
  architect notes) its own scoped supervisor brief.

---

## Pre-flight (post-Session-5)

- [ ] Session 5 Phase 7 deletions all merged on `main`.
- [ ] 30-day stabilization window complete; retrospective archived.
- [ ] Replay tests have been green for 30 consecutive days (Session 5
      Group G).
- [ ] Worker Dockerfile + basic Helm manifests live in staging
      (Session 5 H1 + a minimal H4 stub).
- [ ] Basic DR runbook exists (Session 5 J1 + J2); full drill is the
      Session 6 J3 deliverable.

---

## Phases included

This session covers the production-shape work that originally sat in
Session 5 Phase 8 Groups F, J (full drill), and the SecretsProvider /
Helm / HPA tail of H. Workflow versioning policy (Group E) and
replay-in-CI (Group G) remain Session 5 work.

| Group | Scope | Original session | Notes |
|---|---|---|---|
| F | Multi-tenancy: namespaces, workflow ID prefixing, task queue isolation, RBAC sketch, **`SecretsProvider` port + 2 adapters** | Was S5 P8 | Per D5-7, F lands first because partner pilots need namespaces + secrets before any onboarding. |
| H4–H6 | Helm chart, HPA policy, load test for horizontal scaling | Was S5 P8 | H1 (Dockerfile) + H2 (health check) + H3 (graceful shutdown) + H7 (cold-build CI) stay in S5. |
| J3–J4 | Full DR drill on staging, region-failure tabletop | Was S5 P8 | J1 (backup policy) + J2 (DR runbook draft) stay in S5. |

---

## Planning Agent prompt

```
You are the Planning Agent for Session 6 of the Temporal migration —
production hardening, post-cutover. Session 5 (cutover) has shipped;
the legacy kernel/loop/state-store are deleted; replay-in-CI and the
Dockerfile are live. Your job is to land partner-readiness work.

Your charter:

Group F — Multi-tenancy:
1. Namespace-per-tenant decision and workflow ID convention.
2. Task queue convention `<tenant>-<priority>`.
3. Tenant-scoped worker fleet (`WORKER_TENANT=<tenant>`).
4. SecretsProvider port + 2 concrete adapters (Vault, AWS SM, GCP SM,
   or Azure KV — minimum two).
5. RBAC sketch — design only, impl is an out-of-scope ticket.

Group H4–H6 — Worker fleet:
6. Helm chart for worker fleet.
7. HPA policy on Temporal task queue depth.
8. Load test: 10 concurrent features, verify horizontal scaling.

Group J3–J4 — Disaster recovery:
9. Full DR drill end-to-end on staging (includes ajv-shim cold-restore
   verification).
10. Region-failure tabletop exercise.

Invariants:
- Multi-tenancy MUST land before any partner pilot runs against
  production. (D5-7)
- Helm chart + HPA must be deployed to staging before the load test.
- DR drill must succeed end-to-end before declaring the partner-
  readiness sign-off complete.

Stop and request human review if:
- Any partner-pilot kickoff is requested before Group F lands.
- HPA load test reveals scaling issues that aren't queue-depth-bound.
- DR drill reveals an unrecoverable state path (engine bug, not infra).
```

---

## Tasks

Identical to the original Session 5 Phase 8 specification for the
groups listed above. See `session-5-cutover-and-harden.md` (the
`Phase 8 Tasks — Hardening` section, Groups F / H4-H6 / J3-J4) for
the per-task table; this doc is the planning wrapper, not a
duplication.

---

## Files affected

**Created:**
- `infra/temporal/helm/worker/` (entire — chart + values + templates)
- `infra/temporal/helm/worker/templates/hpa.yaml`
- `tools/autonomous-factory/scripts/load-test.sh`
- `src/ports/secrets-provider.ts` + 2 concrete adapters under
  `src/adapters/secrets-*`
- DR drill report (committed to docs)
- Partner-onboarding runbook (referenced by Antigravity / Salesforce
  workstreams)

**Modified:**
- `src/temporal/worker/main.ts` (tenant-scoped worker fleet,
  `WORKER_TENANT` env)
- `src/temporal/client/run-feature.ts` (workflow ID convention)
- `tools/autonomous-factory/docs/temporal-migration/11-dr-runbook.md`
  (drill outcomes appended)

---

## Test strategy

1. **Multi-tenancy isolation** — two tenants' workflows cannot read
   each other's queries (assertion test).
2. **SecretsProvider** — round-trip for both adapters; missing-secret
   path returns the documented `SecretsProviderError`.
3. **Load test** — 10 concurrent features, HPA fires within SLO, all
   complete cleanly.
4. **DR drill** — full restore on staging; in-flight workflows resume;
   ajv-shim cold-restore verified; deltas documented.

---

## Exit criteria

- [ ] Multi-tenancy live in staging; isolation test green.
- [ ] `SecretsProvider` port + 2 adapters merged.
- [ ] Helm chart deployed; HPA policy proven by load test.
- [ ] DR drill completed; runbook updated with deltas.
- [ ] Partner-onboarding documentation reviewed by operations.
- [ ] Engineering + operations sign-off on partner-pilot readiness.

---

## Estimated effort

- Group F: 3–4 days
- Groups H4–H6: 2–3 days
- Groups J3–J4: 1–2 days (DR drill is the long pole)
- **Session total: 6–9 working days.**
