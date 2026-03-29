# @branded/schemas

Shared Zod schemas for the sample-app backend and frontend. Single source of truth for all API request/response types — both runtime validation and TypeScript types are derived from the same schema definitions.

## Quick Start

```bash
npm run build    # compile TypeScript to dist/
npm test         # run schema unit tests
```

## Schemas

| Schema | File | Endpoint | Description |
|--------|------|----------|-------------|
| `HelloResponseSchema` | `src/hello.ts` | `GET /hello` | `{ message: string, timestamp: ISO-8601 }` |
| `DemoLoginRequestSchema` | `src/auth.ts` | `POST /auth/login` | `{ username: string, password: string }` |
| `DemoLoginResponseSchema` | `src/auth.ts` | `POST /auth/login` | `{ token: string, displayName: string }` |
| `UserProfileSchema` | `src/profile.ts` | `GET /profile` | `{ id: uuid, displayName: string(2–50), email: email, theme: Theme }` |
| `ProfileUpdateSchema` | `src/profile.ts` | `PATCH /profile` | `{ displayName: string(2–50), theme: Theme }` |
| `ThemeSchema` | `src/profile.ts` | `GET/PATCH /profile` | `"light" \| "dark" \| "system"` |
| `ApiErrorCodeSchema` | `src/errors.ts` | All endpoints | `"INVALID_INPUT" \| "UNAUTHORIZED" \| "NOT_FOUND" \| "SERVER_ERROR"` |
| `ApiErrorResponseSchema` | `src/errors.ts` | All endpoints | `{ error: ApiErrorCode, message: string }` |

## Usage

```typescript
import { HelloResponseSchema, type HelloResponse } from "@branded/schemas";

// Runtime validation
const result = HelloResponseSchema.safeParse(data);
if (result.success) {
  const response: HelloResponse = result.data;
}

// Type-only import (zero runtime cost)
import type { DemoLoginRequest } from "@branded/schemas";
```

## Package Config

- **Module format:** ESM (`"type": "module"`)
- **Exports:** `dist/index.js` (runtime) + `dist/index.d.ts` (types)
- **Peer dependency:** `zod ^3.24.0`
- **Node:** >= 22.0.0

## Adding New Schemas

1. Create a new file in `src/` (e.g., `src/my-endpoint.ts`)
2. Define Zod schemas and export inferred types
3. Re-export from `src/index.ts`
4. Run `npm test` to verify
