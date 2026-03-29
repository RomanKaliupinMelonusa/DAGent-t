# Feature: User Profile & Preferences Dashboard

## Goal
Add an authenticated "User Profile" page where users can view their details, update their display name, and toggle a system theme preference. Covers shared Zod schemas, a backend Azure Function (GET/PATCH), a Next.js frontend page with form, and comprehensive tests (unit + E2E including a 400 negative scenario).

## Scope
- **Backend:** New `fn-profile.ts` Azure Function at `/api/profile` (GET + PATCH) with in-function demo token auth
- **Frontend:** New `/profile` page, NavBar link, loading/error/success states
- **Schemas:** New `profile.ts` in `@branded/schemas` with `UserProfileSchema` + `ProfileUpdateSchema`
- **Infra:** OpenAPI spec update in `api-sample.openapi.yaml` for APIM routing
- **Tests:** Schema unit tests, backend unit tests, frontend unit tests (3 rendering states), E2E happy path + 400 negative

---

## Requirements

### 1. Shared Schemas (`packages/schemas`)

- [ ] Create `packages/schemas/src/profile.ts`
- [ ] Define `ThemeSchema = z.enum(["light", "dark", "system"])` — reused by both schemas
- [ ] Define `UserProfileSchema = z.object({ id: z.string().uuid(), displayName: z.string().min(2).max(50), email: z.string().email(), theme: ThemeSchema })`
- [ ] Define `ProfileUpdateSchema = z.object({ displayName: z.string().min(2).max(50), theme: ThemeSchema })`
- [ ] Export inferred types: `UserProfile`, `ProfileUpdate`, `Theme`
- [ ] Follow file structure of existing `hello.ts` and `auth.ts` (JSDoc header + `import { z } from "zod"`)
- [ ] Update `packages/schemas/src/index.ts` — add barrel exports for `UserProfileSchema`, `ProfileUpdateSchema`, `ThemeSchema`, `UserProfile`, `ProfileUpdate`, `Theme` from `"./profile.js"` (follow existing export pattern with named schema exports + type re-exports)
- [ ] Add tests to `packages/schemas/src/__tests__/schemas.test.ts`:
  - `UserProfileSchema`: valid parse; rejects non-uuid id; rejects displayName <2 chars; rejects displayName >50 chars; rejects invalid email; rejects invalid theme value; rejects empty object
  - `ProfileUpdateSchema`: valid parse; rejects displayName <2 chars; rejects invalid theme; accepts all three valid theme values ("light", "dark", "system")

### 2. Backend API (`apps/sample-app/backend`)

- [ ] Create `backend/src/functions/fn-profile.ts`
- [ ] Route: `profile`, methods: `["GET", "PATCH"]`, `authLevel: "function"`
- [ ] Copy the `safeEqual(a, b)` constant-time comparison helper from `fn-demo-login.ts` (lines 34-40) — uses `crypto.timingSafeEqual` with `Buffer.from()` and self-comparison on length mismatch
- [ ] Auth guard: read `request.headers.get("x-demo-token")`, compare against `process.env.DEMO_TOKEN ?? ""` via `safeEqual()`. If missing or mismatched token, return 401 `{ error: "UNAUTHORIZED", message: "Missing or invalid demo token." }` (follows `ApiErrorResponse` envelope from `@branded/schemas`)
- [ ] **Note on auth header:** The spec says "Authorization: Bearer" but `apiClient.ts` sends `X-Demo-Token` in demo mode (see `getDemoAuthHeaders()` at `frontend/src/lib/apiClient.ts` lines 63-66). Validate what the frontend actually sends.
- [ ] GET handler: return 200 with hardcoded mock profile: `{ id: "00000000-0000-0000-0000-000000000001", displayName: "Demo User", email: "demo@example.com", theme: "system" }`
- [ ] PATCH handler: parse body via `request.json()` wrapped in try/catch (return 400 `{ error: "INVALID_INPUT", message: "Invalid JSON body." }` on parse failure — same pattern as `fn-demo-login.ts` lines 68-73). Validate with `ProfileUpdateSchema.safeParse(body)` — on failure return 400 with Zod error paths formatted as `"path: message; path: message"` (exact format from `fn-demo-login.ts` lines 78-83). On success return 200 with merged profile (spread mock profile + parsed update fields).
- [ ] `export default profileHandler` for unit test imports
- [ ] Imports: `{ app, HttpRequest, HttpResponseInit, InvocationContext }` from `@azure/functions`; `{ timingSafeEqual }` from `crypto`; `{ ProfileUpdateSchema, type UserProfile, type ApiErrorResponse }` from `@branded/schemas`
- [ ] Create `backend/src/functions/__tests__/fn-profile.test.ts`:
  - Reuse `createMockContext()` pattern from `fn-demo-login.test.ts` (lines 17-27: `log/error/warn/trace/debug` as `jest.fn()`, `invocationId`)
  - Custom `createMockRequest({ method, body, headers })` — mock `request.headers.get(name)` to return from headers map; mock `request.json()` for body; mock `request.method`
  - Set `process.env.DEMO_TOKEN = "test-token"` in `beforeEach`; restore env in `afterAll`
  - Tests: 401 no token (GET); 401 wrong token (GET); GET 200 valid UserProfile shape (validate with `UserProfileSchema.safeParse`); PATCH 200 valid body `{ displayName: "New Name", theme: "dark" }` returns merged profile; PATCH 400 1-char displayName — check `error: "INVALID_INPUT"`; PATCH 400 invalid theme `"blue"`; PATCH 400 unparseable JSON body

### 3. Infrastructure

- [ ] Update `infra/api-specs/api-sample.openapi.yaml` — add `/profile` path after existing `/hello`:
  - GET: `operationId: getProfile`, responses: 200 (UserProfile object schema with id string format uuid, displayName string, email string format email, theme string enum ["light","dark","system"]), 401
  - PATCH: `operationId: updateProfile`, requestBody (ProfileUpdate: displayName + theme), responses: 200, 400, 401
  - Inline schemas matching Zod definitions

### 4. Frontend UI (`apps/sample-app/frontend`)

- [ ] Create `frontend/src/app/profile/page.tsx`:
  - `"use client"` directive (required — uses hooks, matches `page.tsx` pattern)
  - Auth guard: `const { isAuthenticated } = useDemoAuth()` + `const router = useRouter()`. `useEffect(() => { if (!isAuthenticated) router.replace("/") }, [isAuthenticated, router])` — defense-in-depth alongside global `DemoGate` in `providers.tsx`
  - State: `profile: UserProfile | null`, `isLoading: true` (initial), `isSaving: false`, `error: string | null`, `success: boolean`, form fields: `displayName: string`, `theme: string`
  - Fetch on mount: `useEffect(() => { apiFetch("/profile", {}, UserProfileSchema).then(p => { setProfile(p); setDisplayName(p.displayName); setTheme(p.theme); }).catch(e => setError(e instanceof ApiError ? e.message : String(e))).finally(() => setIsLoading(false)) }, [])`
  - Loading state: `<div data-testid="profile-loading" className="flex justify-center py-12"><span>Loading profile…</span></div>`
  - Error banner: `<div data-testid="profile-error" className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text" role="alert">{error}</div>` (styling from `page.tsx` lines 58-61)
  - Success banner: `<div data-testid="profile-success" className="rounded-lg border border-success-border bg-success-bg px-4 py-3 text-sm text-success-text">Profile updated!</div>`
  - Form: `<form onSubmit={handleSave}>`
    - `<label>Display Name</label>` + `<Input data-testid="profile-displayname" value={displayName} onChange={...} />`
    - `<label>Theme</label>` + `<select data-testid="profile-theme" value={theme} onChange={...} className="border border-border-input bg-surface-alt rounded-lg px-3 py-2 text-sm...">` with `<option>` for light/dark/system
    - `<Button data-testid="save-profile-btn" type="submit" disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>`
  - Save handler: `e.preventDefault()`, clear error/success, set isSaving=true, `apiFetch("/profile", { method: "PATCH", body: JSON.stringify({ displayName, theme }) }, UserProfileSchema)` — on success set profile + success=true, on error set error message, finally isSaving=false
  - Use `Button`, `Input` from `@/components/ui/primitives` (same imports as `page.tsx`)
  - Card layout: `rounded-lg border border-border bg-surface-card p-6 transition-colors duration-200` (matching `page.tsx` card sections)

- [ ] Update `frontend/src/components/NavBar.tsx`:
  - In `NavBarShell` component (around line 52), add Profile link between About link and closing `</nav>`:
    ```tsx
    <Link href="/profile" className={navLinkClass("/profile", pathname)}>Profile</Link>
    ```

### 5. Testing Requirements

- [ ] **Schema unit tests** — see Step 3 above (in `schemas.test.ts`)
- [ ] **Backend unit tests** — see Step 5 above (in `fn-profile.test.ts`)
- [ ] **Frontend unit tests** — create `frontend/src/components/__tests__/ProfilePage.test.tsx`:
  - Mock modules (follow `DemoLoginForm.test.tsx` patterns):
    - `jest.mock("@/lib/apiClient")` → mock `apiFetch`, import real `ApiError`
    - `jest.mock("@/lib/demoAuthContext")` → mock `useDemoAuth` returning `{ isAuthenticated: true, displayName: "Demo", token: "tok", login: jest.fn(), logout: jest.fn() }`
    - `jest.mock("next/navigation")` → mock `useRouter` (push/replace as jest.fn()), `usePathname` returns "/profile"
  - Mock profile: `{ id: "00000000-0000-0000-0000-000000000001", displayName: "Demo User", email: "demo@example.com", theme: "system" }`
  - **Loading state test**: `apiFetch.mockReturnValue(new Promise(() => {}))` (never resolves) → render → `expect(screen.getByTestId("profile-loading")).toBeInTheDocument()`
  - **Success state test**: `apiFetch.mockResolvedValue(mockProfile)` → render → `await waitFor(() => expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument())` → verify `screen.getByTestId("profile-displayname")` has value "Demo User"
  - **Error state test (save)**: first `apiFetch` call resolves with profile, second call rejects with `new ApiError("VALIDATION_ERROR", "Display name too short", 400)` → click save → `await waitFor(() => expect(screen.getByTestId("profile-error")).toHaveTextContent("Display name too short"))`
  - **Button disabled test**: mock PATCH as pending promise → click save → button has text "Saving..." and is disabled

- [ ] **E2E happy path** — create `e2e/profile.spec.ts`:
  - Import `{ test, expect }` from `"./fixtures/demo-auth.fixture"` (pattern from `authenticated-hello.spec.ts`)
  - Attach deep diagnostics in `beforeEach`: `page.on("console", msg => { if (msg.type() === "error") console.log("CONSOLE:", msg.text()) })` and `page.on("requestfailed", req => console.log("REQFAIL:", req.url()))`
  - Navigate to `/profile` → wait for `profile-loading` to disappear (timeout 15s) → verify displayName input visible → fill with "Updated User" → click `save-profile-btn` → verify no error banner visible

- [ ] **E2E negative test (400 Bad Request)**: In same `profile.spec.ts`:
  - Use `page.route()` to intercept PATCH to `**/api/profile` and fulfill with `{ status: 400, contentType: "application/json", body: JSON.stringify({ error: "INVALID_INPUT", message: "displayName: String must contain at least 2 character(s)" }) }`
  - Navigate to `/profile` → wait for load → click save → `await expect(authenticatedPage.getByTestId("profile-error")).toBeVisible({ timeout: 10_000 })` → verify error text contains "at least 2 character"

---

## Acceptance Criteria

1. `cd apps/sample-app/packages/schemas && npm test` — all profile schema tests pass
2. `cd apps/sample-app/backend && npm test` — fn-profile unit tests pass (401 no token, 401 wrong token, GET 200, PATCH 200, PATCH 400 short name, PATCH 400 bad theme, PATCH 400 bad JSON)
3. `cd apps/sample-app/frontend && npm test` — ProfilePage unit tests pass (loading state, success form, error on save, button disabled during save)
4. `cd apps/sample-app/backend && npm run build:typecheck` — no type errors
5. `cd apps/sample-app/frontend && npx tsc --noEmit` — no type errors
6. `cd apps/sample-app && npx playwright test e2e/profile.spec.ts` — E2E happy path + 400 negative both pass
7. NavBar shows "Profile" link alongside Home and About
8. Manual smoke: start backend + frontend, log in, navigate to `/profile`, form loads, save works, 1-char name shows error banner

---

## Implementation Reference Map

### Existing patterns to follow (read, don't modify):

| Pattern | File | Key Lines |
|---|---|---|
| Backend auth — `safeEqual()` constant-time compare | `backend/src/functions/fn-demo-login.ts` | Lines 34-40 |
| Backend — Zod body validation + error path formatting | `backend/src/functions/fn-demo-login.ts` | Lines 68-83 |
| Backend — `ApiErrorResponse` envelope | `packages/schemas/src/errors.ts` | Full file |
| Backend — function registration pattern | `backend/src/functions/fn-demo-login.ts` | Lines 106-110 |
| Backend tests — `createMockContext()` shape | `backend/src/functions/__tests__/fn-demo-login.test.ts` | Lines 17-27 |
| Backend tests — `createMockRequest()` | `backend/src/functions/__tests__/fn-demo-login.test.ts` | Lines 29-34 |
| Backend tests — env setup in `beforeEach`/`afterAll` | `backend/src/functions/__tests__/fn-demo-login.test.ts` | Lines 48-58 |
| Schema file structure | `packages/schemas/src/hello.ts` | Full file |
| Schema barrel exports | `packages/schemas/src/index.ts` | Full file |
| Schema test structure | `packages/schemas/src/__tests__/schemas.test.ts` | Full file |
| Frontend — `apiFetch` usage with schema validation | `frontend/src/app/page.tsx` | Lines 18-27 |
| Frontend — loading/error state pattern | `frontend/src/app/page.tsx` | Lines 9-30 |
| Frontend — danger error banner styling | `frontend/src/app/page.tsx` | Lines 58-61 |
| Frontend — card layout styling | `frontend/src/app/page.tsx` | Lines 43-44 |
| Frontend — `apiFetch<T>(path, options, schema)` signature | `frontend/src/lib/apiClient.ts` | Lines 159-163 |
| Frontend — `ApiError` class (code, message, status) | `frontend/src/lib/apiClient.ts` | Lines 41-50 |
| Frontend — `getDemoAuthHeaders()` sends `X-Demo-Token` | `frontend/src/lib/apiClient.ts` | Lines 60-66 |
| Frontend — `useDemoAuth()` returns `{ isAuthenticated, displayName, token, login, logout }` | `frontend/src/lib/demoAuthContext.tsx` | Lines 150+ |
| Frontend — `Button`/`Input` primitives (forwardRef, variants) | `frontend/src/components/ui/primitives.tsx` | Full file |
| Frontend — NavBar nav link pattern | `frontend/src/components/NavBar.tsx` | Lines 39-56 |
| Frontend tests — mock sessionStorage/fetch | `frontend/src/components/__tests__/DemoLoginForm.test.tsx` | Lines 16-38 |
| Frontend tests — jest config + module mapper | `frontend/jest.config.mjs` | Full file |
| E2E — fixture import + `authenticatedPage` usage | `e2e/authenticated-hello.spec.ts` | Full file |
| E2E — demo-auth fixture (token injection + reload) | `e2e/fixtures/demo-auth.fixture.ts` | Full file |
| E2E — playwright config | `playwright.config.ts` | Full file |
| OpenAPI spec format | `infra/api-specs/api-sample.openapi.yaml` | Full file |

### Key architectural decisions (pre-resolved):

1. **Backend auth uses `X-Demo-Token` header** (not `Authorization: Bearer`) — `apiClient.ts` sends `X-Demo-Token` via `getDemoAuthHeaders()` in demo mode. Entra mode uses `Authorization: Bearer` but that's APIM-validated.
2. **In-function auth validation** (not APIM-delegated like `fn-hello.ts`) — spec requires 401 returns; direct validation makes unit testing straightforward.
3. **`safeEqual()` is duplicated** from `fn-demo-login.ts` — avoids scope creep of extracting a shared auth util.
4. **Mock profile is hardcoded** — GET always returns same data, PATCH returns merged result but doesn't persist. Spec says "mocked."
5. **NavBar link added to shared `NavBarShell`** — affects both Demo and Entra variants automatically.
6. **E2E negative test uses `page.route()` interception** — reliable synthetic 400 response vs. depending on actual backend validation edge cases.
7. **Frontend test file in `components/__tests__/`** — matches existing `DemoLoginForm.test.tsx` location for consistency.

---

## New Files

- `packages/schemas/src/profile.ts`
- `backend/src/functions/fn-profile.ts`
- `backend/src/functions/__tests__/fn-profile.test.ts`
- `frontend/src/app/profile/page.tsx`
- `frontend/src/components/__tests__/ProfilePage.test.tsx`
- `e2e/profile.spec.ts`

## Modified Files

- `packages/schemas/src/index.ts` — add profile barrel exports
- `packages/schemas/src/__tests__/schemas.test.ts` — add profile schema tests
- `infra/api-specs/api-sample.openapi.yaml` — add `/profile` GET + PATCH paths
- `frontend/src/components/NavBar.tsx` — add Profile nav link in `NavBarShell`
