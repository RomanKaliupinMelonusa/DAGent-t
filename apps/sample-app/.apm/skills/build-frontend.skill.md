---
name: build-frontend
command: "cd {appRoot}/frontend && npm run build 2>&1 | tail -30"
description: "Run frontend production build to catch TypeScript errors"
---

# Frontend Build

Run a full frontend production build to catch TypeScript errors that `tsc --noEmit` may miss.

## When to Use

- After implementing frontend changes
- Before committing frontend code
- When unit tests pass but you suspect type errors

## What It Does

- Runs the complete frontend build pipeline
- Catches TypeScript errors in components and pages
- Validates dynamic imports and code splitting
- Detects missing or incorrect prop types
