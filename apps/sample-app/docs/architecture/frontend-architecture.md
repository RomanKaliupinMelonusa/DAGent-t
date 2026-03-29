# Frontend Architecture

Next.js frontend with dual-mode authentication (demo + Entra ID) and runtime Zod schema validation.

## Pages

| Route | File | Auth Guard | Description |
|-------|------|------------|-------------|
| `/` | `app/page.tsx` | `DemoGate` (global) | Home — demonstrates Hello endpoint |
| `/about` | `app/about/page.tsx` | `DemoGate` (global) | About page |
| `/profile` | `app/profile/page.tsx` | `DemoGate` + in-component redirect | User profile form (display name + theme) |

## Profile Page

`profile/page.tsx` is a client component (`"use client"`) that:

1. Fetches the user's profile via `apiFetch("/profile", {}, UserProfileSchema)` on mount
2. Renders a form with display name input and theme dropdown (light/dark/system)
3. Submits updates via `PATCH /profile` with Zod-validated response
4. Shows loading, error, and success states with appropriate `data-testid` attributes

Defense-in-depth: the page checks `useDemoAuth().isAuthenticated` and redirects to `/` if false, in addition to the global `DemoGate` provider.

## Navigation

`NavBar.tsx` renders navigation links in `NavBarShell`:

| Link | Route |
|------|-------|
| Home | `/` |
| About | `/about` |
| Profile | `/profile` |

## Auth Context

### Demo Mode (`NEXT_PUBLIC_AUTH_MODE=demo`)

`demoAuthContext.tsx` manages demo auth state:
- Login calls `POST /auth/login` via `NEXT_PUBLIC_DEMO_AUTH_URL` (separate from `NEXT_PUBLIC_API_BASE_URL`)
- Token stored in `sessionStorage`
- API calls use `X-Demo-Token` header

### URL Configuration

| Env Var | Purpose | Example |
|---------|---------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | API calls (e.g., `/profile`, `/hello`) | `https://apim-sample-app-001.azure-api.net/sample` |
| `NEXT_PUBLIC_DEMO_AUTH_URL` | Demo auth login endpoint | `https://apim-sample-app-001.azure-api.net/demo-auth` |
| `NEXT_PUBLIC_AUTH_MODE` | Auth mode toggle | `demo` or `entra` |
| `NEXT_PUBLIC_ENTRA_CLIENT_ID` | Entra ID client ID (entra mode only) | UUID |
| `NEXT_PUBLIC_ENTRA_TENANT_ID` | Entra ID tenant ID (entra mode only) | UUID |

The separation of `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_DEMO_AUTH_URL` is required because APIM routes demo auth and sample API under different path prefixes (`/demo-auth` vs `/sample`).

## API Client

`apiClient.ts` provides `apiFetch<T>(path, options, schema?)`:
- Auto-injects auth headers based on mode (`X-Demo-Token` or `Authorization: Bearer`)
- Optional Zod schema parameter for runtime response validation
- Structured error handling via `ApiError` class

## Test Inventory

| File | Tests | Scope |
|------|-------|-------|
| `apiClient.test.ts` | 9 | Dual-mode auth headers, error parsing, Zod validation |
| `DemoLoginForm.test.tsx` | 5 | Login form rendering, submission, error handling |
| `ProfilePage.test.tsx` | 5 | Loading state, success form, error on save, button disabled |

**Total: 19 frontend tests passing.**
