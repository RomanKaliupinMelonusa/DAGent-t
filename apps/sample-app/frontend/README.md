# frontend/

Next.js frontend with dual-mode authentication (demo + Entra ID) and runtime Zod schema validation.

## Quick Start

```bash
cp .env.local.example .env.local   # configure environment
npm install
npm run dev                         # start dev server on :3000
```

Make sure the backend is running on port 7071 for the demo login endpoint.

## Auth Modes

Controlled by `NEXT_PUBLIC_AUTH_MODE`:

| Mode | Flow | Header |
|------|------|--------|
| `demo` | Username/password form → POST /auth/login → sessionStorage token | `X-Demo-Token` |
| `entra` | MSAL redirect → Entra ID → localStorage token | `Authorization: Bearer` |

## Switching to Entra ID

1. Create an Entra ID app registration in Azure Portal
2. Set environment variables in `.env.local`:
   ```
   NEXT_PUBLIC_AUTH_MODE=entra
   NEXT_PUBLIC_ENTRA_CLIENT_ID=your-client-id
   NEXT_PUBLIC_ENTRA_TENANT_ID=your-tenant-id
   ```
3. Update the scope in `src/lib/authConfig.ts` to match your app registration

## Runtime Schema Validation

API responses are validated at runtime using shared Zod schemas from `@branded/schemas`. The `apiFetch()` function accepts an optional Zod schema parameter:

```typescript
import { HelloResponseSchema } from "@branded/schemas";
import { apiFetch } from "@/lib/apiClient";

// Validated — throws ApiError("VALIDATION_ERROR") if response doesn't match schema
const data = await apiFetch("/hello", {}, HelloResponseSchema);
```

Error responses are always parsed against `ApiErrorResponseSchema` for structured error handling.

## Key Files

| File | Purpose |
|------|---------|
| `src/app/providers.tsx` | Dual-mode auth provider (DemoProviders / EntraProviders) |
| `src/app/audit/page.tsx` | Audit log dashboard — data table with loading/error/empty states |
| `src/lib/demoAuthContext.tsx` | React context for demo auth state (validates with `DemoLoginResponseSchema`) |
| `src/lib/authConfig.ts` | MSAL configuration for Entra ID |
| `src/lib/apiClient.ts` | Authenticated fetch wrapper with optional Zod validation |
| `src/components/DemoLoginForm.tsx` | Login form UI (fires fire-and-forget audit POST on success) |
| `src/components/NavBar.tsx` | Dual-mode navigation bar (Home, About, Audit, theme toggle) |
| `src/components/ui/primitives.tsx` | Shared UI primitives (Button, Input, Card) |

## Tests

Unit tests use Jest with `next/jest`. Run with `npm test`.

| File | Tests | Coverage |
|------|-------|----------|
| `src/lib/__tests__/apiClient.test.ts` | 9 | Dual-mode auth headers, error parsing, Zod validation |
| `src/components/__tests__/DemoLoginForm.test.tsx` | 5 | Login form rendering, submission, error handling |
| `src/app/audit/__tests__/page.test.tsx` | 4 | Audit table rendering, error state, empty state, API call |

**Total: 18 unit tests passing.**

## Build

```bash
npm run build    # static export to out/
npm start        # serve the static build
```
