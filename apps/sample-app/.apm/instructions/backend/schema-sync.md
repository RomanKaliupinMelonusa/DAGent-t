# Schema Synchronization Rules

## Single Source of Truth

All shared data models MUST be defined as Zod schemas. TypeScript types are always derived via `z.infer<typeof Schema>` — never hand-written alongside a schema.

## Schema Location

- Shared schemas live in `packages/schemas/` (workspace package `@branded/schemas`).
- If no `packages/schemas/` directory exists yet, co-locate schemas in `backend/src/schemas/` and export them for frontend consumption.

## Contract Rules

1. **Additive changes are safe** — new optional fields, new union members, new schemas.
2. **Breaking changes require coordination** — removing fields, changing types, renaming keys. Flag these in the SPEC and ensure both backend and frontend are updated in the same pipeline run.
3. **Every schema must have a corresponding test** — at minimum a round-trip parse test with valid and invalid inputs.

## Export Conventions

```typescript
// Define schema
export const WidgetSchema = z.object({ ... });

// Export inferred type alongside
export type Widget = z.infer<typeof WidgetSchema>;
```

## Validation Pattern

- Backend: use `.parse()` at API boundaries (throws on invalid input).
- Frontend: use `.safeParse()` for form validation (returns error details without throwing).
