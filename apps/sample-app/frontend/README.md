# frontend/

Next.js frontend with dual-mode authentication (demo + Entra ID).

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

## Key Files

| File | Purpose |
|------|---------|
| `src/app/providers.tsx` | Dual-mode auth provider (DemoProviders / EntraProviders) |
| `src/lib/demoAuthContext.tsx` | React context for demo auth state |
| `src/lib/authConfig.ts` | MSAL configuration for Entra ID |
| `src/lib/apiClient.ts` | Authenticated fetch wrapper (dual-mode headers) |
| `src/components/DemoLoginForm.tsx` | Login form UI |
| `src/components/NavBar.tsx` | Dual-mode navigation bar |

## Build

```bash
npm run build    # static export to out/
npm start        # serve the static build
```
