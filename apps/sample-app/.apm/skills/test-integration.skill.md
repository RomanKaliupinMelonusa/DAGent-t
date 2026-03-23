---
name: test-integration
command: "cd {appRoot}/backend && npm run test:integration"
description: "Run backend integration tests against live endpoints"
---

# Integration Tests

Run integration tests against the live deployed backend endpoints.

## When to Use

- After deployment to verify live backend endpoints
- Post-deploy validation of API contracts

## What It Does

- Sends HTTP requests to the deployed backend URL
- Validates response schemas
- Checks authentication flows
- Verifies error codes and edge case handling
