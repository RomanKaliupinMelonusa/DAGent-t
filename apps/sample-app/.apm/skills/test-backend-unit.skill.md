---
name: test-backend-unit
command: "cd {appRoot}/backend && npx jest --verbose"
description: "Run backend unit tests with Jest"
---

# Backend Unit Tests

Run unit tests for the backend service.

## When to Use

- After implementing backend logic changes
- After modifying shared schemas that affect backend types
- During code cleanup to verify no regressions

## What It Does

- Executes all test suites in `backend/`
- Validates schema compliance
- Reports coverage for modified files
