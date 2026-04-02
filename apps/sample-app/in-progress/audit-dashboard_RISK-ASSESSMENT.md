# Risk Assessment: audit-dashboard

## Key Architectural Decision Records (ADRs)

### ADR-1: Fire-and-Forget Audit Writes from Login Flow

- **Decision:** The `DemoLoginForm` fires `POST /audit` as a fire-and-forget call (`.catch(() => {})`) after successful authentication, rather than awaiting the result or using a synchronous write.
- **Context:** Login is the most user-critical path in the application. Any latency or failure in the audit subsystem must not degrade the login experience. The audit event is telemetry — its loss is acceptable; login failure is not.
- **Consequences:** Audit events from login may silently fail under Cosmos DB outages or network issues. There is no retry mechanism, so transient failures result in lost audit entries. This is an intentional trade-off: availability of the auth flow over completeness of the audit trail.

### ADR-2: Serverless Cosmos DB with RBAC-Only Access (Zero Keys)

- **Decision:** Provision Cosmos DB in Serverless capacity mode with `local_authentication_disabled = true`, enforcing Managed Identity RBAC as the sole access method. The Function App MI receives the `Cosmos DB Built-in Data Contributor` data-plane role.
- **Context:** The spec mandates zero API keys in code. Serverless capacity mode eliminates provisioned throughput cost for a low-volume telemetry workload. RBAC-only access eliminates an entire class of key-leak vulnerabilities and aligns with Azure security best practices.
- **Consequences:** Local development and testing require either a Cosmos DB emulator or mocked clients — the backend tests correctly mock `@azure/cosmos`. Serverless has a cold-start penalty on the first request after inactivity (~5-10s), which may affect the first `GET /audit` call after idle periods.

### ADR-3: Defence-in-Depth Schema Validation on Read Path

- **Decision:** The `GET /audit` handler validates every record returned from Cosmos DB against `AuditLogSchema` via `AuditLogSchema.parse(r)` before returning to the client.
- **Context:** Although `POST /audit` validates on write, Cosmos DB is a schemaless store. Records may be inserted by other processes, direct portal edits, or future migrations. Validating on read prevents malformed data from reaching the frontend.
- **Consequences:** Additional CPU overhead per request (Zod parse on each of up to 50 records). If a malformed record exists in Cosmos DB, the entire `GET /audit` call returns 500 rather than partial data — this is a strictness trade-off favoring data integrity over partial availability.

## Blast Radius

Based on Roam structural analysis (`roam_pr_risk` and `roam_explore`):

- **Files directly modified/created:** 16 (see Component Inventory in Architecture Report)
- **Files transitively affected:** 2 (Cosmos DB outputs consumed by infra dependency graph)
- **Modules touched:** 5 (Shared Schemas, Backend, Frontend, Infrastructure, E2E Tests)
- **Roam Risk Score:** 49/100 — **MODERATE**
- **Blast radius percentage:** 0% of existing symbols affected (all new code; no existing signatures modified)
- **Cluster spread:** 0 (changes are isolated to new symbols and leaf modifications)

**Key observation:** The feature is architecturally well-isolated. The only modifications to existing code are:
1. `NavBar.tsx` — additive link insertion (no signature change)
2. `DemoLoginForm.tsx` — additive fire-and-forget call (no signature change)
3. `main.tf` — additive app setting (no existing settings modified)
4. `outputs.tf` — additive outputs (no existing outputs modified)
5. `api-sample.openapi.yaml` — additive path definitions (no existing paths modified)

No existing function signatures, exports, or interfaces were changed.

## Short-Term Risks

### 1. Cosmos DB Cold-Start Latency (Severity: LOW)

Serverless Cosmos DB has a cold-start penalty of 5-10 seconds after inactivity. The first `GET /audit` request after an idle period may appear slow to users. The lazy singleton pattern in `fn-audit.ts` mitigates repeated SDK initialization but cannot eliminate the Cosmos DB service cold start.

**Mitigation:** Acceptable for an internal admin dashboard. If latency becomes problematic, consider a warm-up timer trigger or switching to provisioned throughput.

### 2. Unbounded Action String Content (Severity: LOW)

The `action` field accepts any string up to 256 characters. While length-limited, there is no allowlist of valid action types (e.g., `USER_LOGIN`, `PROFILE_VIEW`). Malicious or erroneous callers could insert arbitrary action strings.

**Mitigation:** The APIM auth policy ensures only authenticated users can call `POST /audit`. For stricter control, consider adding a Zod `.refine()` with an action enum in a future iteration.

### 3. No Pagination on GET /audit (Severity: LOW)

The `GET /audit` endpoint returns a hardcoded `TOP 50` result set with no cursor-based pagination. As the audit log grows, users can only see the most recent 50 events with no way to page backward.

**Mitigation:** Sufficient for MVP. Future work should add `?pageSize=N&continuationToken=X` parameters using Cosmos DB continuation tokens.

## Long-Term Technical Debt

### 1. Hardcoded Query Limit

The `SELECT TOP 50` query limit is hardcoded in `fn-audit.ts` (line 153). This should be extracted to an environment variable or query parameter to allow runtime configuration without redeployment.

### 2. No Event Schema Versioning

The `AuditLog` schema has no version field. If the schema evolves (e.g., adding `ipAddress`, `userAgent`, or `resourceId` fields), existing records in Cosmos DB will fail the strict Zod validation on the read path. A `schemaVersion` field or lenient parsing strategy should be introduced before schema evolution occurs.

### 3. Single-Region Deployment

The Cosmos DB account is provisioned with a single `geo_location` (the resource group's region). For a production audit trail that may have compliance requirements (e.g., data retention, disaster recovery), multi-region replication should be considered. Serverless mode currently does not support multi-region writes, so this would require a capacity mode change.

### 4. Missing Audit Event Correlation

Audit events contain `userId` and `action` but no correlation ID linking to the specific HTTP request or session. Adding a `correlationId` (e.g., from APIM's `x-request-id` header) would enable end-to-end traceability across the APIM → Functions → Cosmos DB pipeline.

## Suggested Reviewers

Based on `roam_pr_risk` output and code ownership:

| Reviewer | Rationale | Lines Owned |
|----------|-----------|-------------|
| RomanKaliupinMelonusa | Primary author, full codebase ownership | 9,080 |

> **Note:** This is a single-contributor repository. In a team setting, recommended reviewers would include: (1) a security engineer for the RBAC and auth policy changes, (2) an infrastructure engineer for the Cosmos DB Terraform, and (3) a frontend engineer for the React component and UX patterns.
