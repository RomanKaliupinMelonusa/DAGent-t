---
name: test-frontend-unit
command: "cd {appRoot}/frontend && npx jest --verbose"
description: "Run frontend unit tests with Jest"
---

# Frontend Unit Tests

Run unit tests for the frontend application.

## When to Use

- After implementing frontend component or page changes
- After modifying shared schemas that affect frontend types
- During code cleanup to verify no regressions

## What It Does

- Executes all test suites in `frontend/`
- Validates component rendering
- Tests hooks, state management, and API client integration
- Reports coverage for modified files
