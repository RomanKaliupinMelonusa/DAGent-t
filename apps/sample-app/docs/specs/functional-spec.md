# Functional Spec

## Features

### 1. Hello Endpoint (v1)

A sample protected endpoint demonstrating the dual-mode auth pattern. Accepts an optional `name` query parameter and returns a greeting with timestamp.

### 2. Demo Authentication (v1)

Username/password login form with token-based auth. Controlled by `AUTH_MODE` feature flag:
- **Demo mode:** Shared credentials validated against env vars; token stored in sessionStorage.
- **Entra mode:** MSAL redirect to Azure Entra ID; token stored in localStorage.

### 3. User Profile & Preferences (v2 — `user-profile-2`)

Authenticated profile page where users can view their details and update preferences.

**Capabilities:**
- View profile (display name, email, ID)
- Edit display name (2–50 characters)
- Select theme preference (light / dark / system)
- Error and success feedback banners

**Backend:** `fn-profile.ts` with in-function `X-Demo-Token` auth, `GET` returns hardcoded mock profile, `PATCH` validates with `ProfileUpdateSchema` and returns merged result (no persistence — mock data).

**Frontend:** `/profile` page with auth guard, loading/error/success states, form with display name input and theme dropdown.

**Schemas:** `UserProfileSchema`, `ProfileUpdateSchema`, `ThemeSchema` in `@branded/schemas`.

## Test Coverage

| Area | Tests | Suites |
|------|-------|--------|
| Schemas (`@branded/schemas`) | 48 | 1 |
| Backend (Azure Functions) | 27 | 3 (+1 skipped integration) |
| Frontend (Next.js) | 19 | 3 |
| E2E (Playwright) | 2 | 1 (`profile.spec.ts`) |
| **Total** | **96** | **8** |
