# Feature: System Health Badge

## Goal
Add a health-check endpoint on the backend and a "System Status" badge in the frontend navigation bar that displays real-time backend availability.

## Requirements
- [ ] Shared Zod schema `HealthResponseSchema` in `@branded/schemas` with `status: "ok"` (literal) and `timestamp` (ISO 8601 datetime)
- [ ] OpenAPI spec updated with `GET /health` returning the `HealthResponse` JSON shape
- [ ] Azure Function `fn-health` at route `/health` returning `{ status: "ok", timestamp }` with `authLevel: "anonymous"`
- [ ] Unit test for `fn-health` validating 200 response and schema conformance
- [ ] NavBar displays a "System Online" badge (green) on successful `/api/health` fetch, or "Offline" (red) on failure
- [ ] Unit test for the NavBar health badge (online and offline states)
- [ ] Playwright E2E test asserting "System Online" text is visible on the page

## Scope
- **Schemas:** Create `packages/schemas/src/health.ts` with `HealthResponseSchema` and `HealthResponse` type. Update `packages/schemas/src/index.ts` barrel exports.
- **Backend:** Create `backend/src/functions/fn-health.ts` — HTTP GET, anonymous auth, route `/health`. Returns `{ status: "ok", timestamp: new Date().toISOString() }`. Create `backend/src/functions/__tests__/fn-health.test.ts`.
- **Frontend:** Update `frontend/src/components/NavBar.tsx` — add a `HealthBadge` component inside `NavBarShell` that fetches `/api/health` on mount using plain `fetch()` (not `apiFetch()` — health is unauthenticated). Render green circle + "System Online" on success, red circle + "Offline" on failure. Use `data-testid="health-badge"`. Create `frontend/src/components/__tests__/NavBar.test.tsx`.
- **Infra:** Update `infra/api-specs/api-sample.openapi.yaml` — add `GET /health` path with 200 response schema.
- **E2E:** Create `e2e/health.spec.ts` — navigate to `/`, assert `health-badge` contains "System Online".

## Acceptance Criteria
1. `cd packages/schemas && npm run build` compiles without errors
2. `cd backend && npx jest fn-health --verbose` passes — 200 status, valid ISO timestamp, schema conformance
3. `cd frontend && npx jest NavBar --verbose` passes — "System Online" on fetch success, "Offline" on fetch failure
4. `GET /api/health` returns `{ "status": "ok", "timestamp": "<ISO-8601>" }` with HTTP 200 and no authentication required
5. NavBar renders a green badge with "System Online" when the backend is reachable
6. NavBar renders a red badge with "Offline" when the backend is unreachable
7. Playwright E2E test `health.spec.ts` passes against a running instance
8. All existing tests continue to pass (no regressions)

## Technical Notes
- The health endpoint uses `authLevel: "anonymous"` — it is a public probe that must work without credentials.
- The frontend `HealthBadge` uses plain `fetch()` instead of the auth-aware `apiFetch()` wrapper, because `apiFetch()` throws `ApiError("AUTH_ERROR")` when no token is present, and the health badge must render for unauthenticated visitors.
- The `HealthBadge` state machine: `"loading"` → fetch → `"online"` (on success) or `"offline"` (on error/non-ok).
- If APIM has a blanket auth policy, `/health` may need a passthrough exception in `apim.tf`. Flag this during infra work but do not modify Terraform unless required for the endpoint to function.

## References
- Schema pattern: `packages/schemas/src/hello.ts`
- Function pattern: `backend/src/functions/fn-hello.ts`
- Test pattern (backend): `backend/src/functions/__tests__/fn-hello.test.ts`
- Test pattern (frontend): `frontend/src/components/__tests__/DemoLoginForm.test.tsx`
- API client: `frontend/src/lib/apiClient.ts` (reference only — do NOT use `apiFetch` for health)
- NavBar component: `frontend/src/components/NavBar.tsx`
- OpenAPI spec: `infra/api-specs/api-sample.openapi.yaml`
- E2E pattern: `e2e/authenticated-hello.spec.ts`
- Playwright config: `playwright.config.ts`
