## E2E Testing Mandate

<!-- TODO: Document your E2E testing requirements here.
     This file is included in the live-ui agent's instructions.

     Suggested topics:
     - Which user flows must be validated in E2E tests
     - Authentication setup for E2E (demo mode, test accounts, etc.)
     - Playwright configuration and browser settings
     - Screenshot and video capture policies
     - CORS and API gateway validation steps
-->

- Every user-facing feature MUST have Playwright E2E test coverage.
- E2E tests run against the live deployed frontend URL.
- Infrastructure changes (CORS, gateway, IAM) mandate E2E validation even without frontend code changes.
