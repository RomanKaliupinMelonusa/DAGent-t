## Frontend Auth Architecture (Dual-Mode)

### Provider Structure

`providers.tsx` branches based on `NEXT_PUBLIC_AUTH_MODE`:

- **Demo mode**: `DemoAuthProvider` → `DemoGate` (shows `DemoLoginForm` if unauthenticated) → children
- **Entra mode**: `MsalProvider` → `MsalAuthenticationTemplate` (redirect-based) → children

### Key Rules

1. **NavBar is split into two variants** (`NavBarDemo` / `NavBarEntra`) because MSAL hooks can only be called inside `<MsalProvider>`. Never combine them.

2. **`apiClient.ts` uses `getAuthHeaders()`** which returns either `{ "X-Demo-Token": token }` or `{ "Authorization": "Bearer <msal-token>" }` depending on mode. All API calls go through this.

3. **MSAL is dynamically imported** in `EntraProviders` via `require()` to avoid loading MSAL when in demo mode. Do not convert to static imports.

4. **sessionStorage** is used for demo tokens (cleared on tab close). **localStorage** is used for MSAL cache (persists across tabs).

5. **Token for demo mode** is stored under key `"demo_auth"` in sessionStorage as `{ token, displayName }`. The E2E fixture (`demo-auth.fixture.ts`) writes to this same key for programmatic auth injection.

### Adding Authenticated API Calls

```typescript
import { apiFetch } from "@/lib/apiClient";

// Auth headers are injected automatically based on mode
const data = await apiFetch<MyType>("/my-endpoint");
```
