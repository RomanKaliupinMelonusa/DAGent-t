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

## Known Framework Issues

Before debugging test failures, check `instructions/frontend/known-framework-issues.md` for known framework-level bugs. If a failure matches a listed issue:
1. Apply `test.skip('KFI-NNN: <reason>')` to the affected test.
2. Record the skip in your `report_outcome` (with docNote).
3. Do NOT spend more than 3 shell commands attempting to fix a known framework bug.
