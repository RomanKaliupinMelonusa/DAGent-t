# Architecture Report: audit-dashboard

## Executive Summary

The audit-dashboard feature introduces a full-stack audit logging system that tracks user actions (login, profile views, etc.) and surfaces them through an admin-facing dashboard. It provisions a new Azure Cosmos DB (Serverless, SQL API) for telemetry storage—isolated from transactional data—wired to the backend via Managed Identity RBAC with zero API keys. The key architectural decision is a fire-and-forget write pattern from the login flow, ensuring audit telemetry never blocks the user-critical authentication path.

## System Context Diagram (C4 Level 1)

```mermaid
C4Context
    title System Context — Audit Dashboard

    Person(user, "Authenticated User", "Logs in via demo or Entra ID mode")

    System_Boundary(sb, "Sample App") {
        System(frontend, "Next.js Frontend", "React SPA at /audit displaying audit log table")
        System(apim, "Azure APIM", "API gateway enforcing dual-mode auth policies")
        System(backend, "Azure Functions Backend", "Node.js HTTP triggers: POST/GET /audit")
    }

    SystemDb(cosmos, "Azure Cosmos DB", "Serverless SQL API — AuditDB/AuditLogs container")
    System_Ext(entra, "Microsoft Entra ID", "OAuth2/OIDC identity provider (production mode)")

    Rel(user, frontend, "Browses /audit page")
    Rel(frontend, apim, "GET /audit, POST /audit", "HTTPS + auth header")
    Rel(apim, backend, "Proxied requests", "Function key auth")
    Rel(backend, cosmos, "Read/write audit events", "DefaultAzureCredential RBAC")
    Rel(user, entra, "Authenticates (entra mode)", "OAuth2 redirect")
```

## Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant FE as Next.js Frontend
    participant APIM as Azure APIM
    participant FN as fn-audit (Azure Functions)
    participant DB as Cosmos DB (AuditLogs)

    Note over User,DB: Happy Path — Login + Audit Write + Dashboard View

    User->>FE: Submit login credentials
    FE->>FE: DemoAuthContext.login() succeeds
    FE-->>APIM: POST /audit (fire-and-forget)
    Note right of FE: .catch(() => {}) — never blocks login
    APIM->>FN: POST /audit (validated auth)
    FN->>FN: Zod validate AuditLogCreateSchema
    FN->>FN: Generate UUID id + ISO timestamp
    FN->>DB: container.items.create(auditLog)
    DB-->>FN: 201 Created
    FN-->>APIM: 201 + AuditLog JSON
    APIM-->>FE: 201

    User->>FE: Navigate to /audit page
    FE->>APIM: GET /audit (auth header)
    APIM->>FN: GET /audit (validated auth)
    FN->>DB: SELECT TOP 50 * FROM c ORDER BY c.timestamp DESC
    DB-->>FN: Array of audit records
    FN->>FN: Zod validate each record (defence-in-depth)
    FN-->>APIM: 200 + AuditLog[]
    APIM-->>FE: 200 + AuditLog[]
    FE->>FE: Render data table (User ID, Action, Timestamp)
```

## Entity-Relationship Diagram

```mermaid
erDiagram
    AUDIT_LOG {
        string id PK "UUID — server-generated"
        string userId "Partition key — user identifier"
        string action "Event type (e.g. USER_LOGIN)"
        string timestamp "ISO-8601 datetime — server-generated"
    }

    USER ||--o{ AUDIT_LOG : "generates"
```

## Component Inventory

| File | Module | Purpose | Status |
|------|--------|---------|--------|
| `packages/schemas/src/audit.ts` | Shared Schemas | Zod schemas: `AuditLogSchema`, `AuditLogCreateSchema`, and inferred TypeScript types | New |
| `packages/schemas/src/index.ts` | Shared Schemas | Barrel export — re-exports audit schema symbols | Modified |
| `backend/src/functions/fn-audit.ts` | Backend | HTTP triggers for `POST /audit` (write) and `GET /audit` (read) with lazy Cosmos client singleton | New |
| `backend/src/functions/__tests__/fn-audit.test.ts` | Backend Tests | Unit tests with mocked `@azure/cosmos` — covers 201, 400, 500 for POST; 200, 500 for GET | New |
| `backend/package.json` | Backend | Added `@azure/cosmos` and `@azure/identity` dependencies | Modified |
| `frontend/src/app/audit/page.tsx` | Frontend | Client component — data table with loading, error, and empty states | New |
| `frontend/src/app/audit/__tests__/page.test.tsx` | Frontend Tests | Unit tests with mocked `apiFetch` — covers data, error, and empty states | New |
| `frontend/src/components/NavBar.tsx` | Frontend | Added "Audit" navigation link between About and theme toggle | Modified |
| `frontend/src/components/DemoLoginForm.tsx` | Frontend | Fire-and-forget `POST /audit` with `USER_LOGIN` action on successful login | Modified |
| `infra/cosmos.tf` | Infrastructure | Terraform: Cosmos DB account (Serverless), SQL database `AuditDB`, container `AuditLogs`, RBAC role assignment | New |
| `infra/main.tf` | Infrastructure | Added `COSMOS_ENDPOINT` app setting to Function App configuration | Modified |
| `infra/outputs.tf` | Infrastructure | Added `cosmosdb_account_name` and `cosmosdb_endpoint` outputs | Modified |
| `infra/api-specs/api-sample.openapi.yaml` | Infrastructure | Added `/audit` GET and POST path definitions + `AuditLog`/`AuditLogCreate` schemas | Modified |
| `e2e/audit.spec.ts` | E2E Tests | Playwright tests: navigate to `/audit`, verify table renders with audit rows | New |
| `.apm/hooks/validate-infra.sh` | Deployment Hooks | Data-plane reachability check for Cosmos DB endpoint (accept 200/401) | Modified |
| `.apm/hooks/validate-app.sh` | Deployment Hooks | Curl check for `GET /api/audit` endpoint (fail on 000/502/503) | Modified |
