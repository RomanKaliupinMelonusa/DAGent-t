---
name: test-storefront-unit
command: "cd {appRoot} && npx jest --verbose"
description: "Run PWA Kit storefront unit tests with Jest"
---

# Storefront Unit Tests

Run unit tests for the PWA Kit commerce storefront.

## When to Use

- After implementing page or component changes
- After modifying configuration that affects rendering
- During code cleanup to verify no regressions

## What It Does

- Executes all test suites in the storefront app
- Validates component rendering with mocked commerce-sdk-react hooks
- Reports coverage for modified files
