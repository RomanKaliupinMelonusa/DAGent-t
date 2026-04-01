## Integration Testing

- Integration tests run against the live deployed backend URL.
- Use `RUN_INTEGRATION=true` environment variable to enable integration tests.
- Set `INTEGRATION_API_BASE_URL` to the deployed backend URL.

## Integration Test Coverage Mandate

When creating or modifying any HTTP-triggered backend endpoint (any `fn-*.ts` file that registers an `httpTrigger`), you MUST add corresponding test blocks to the existing `.integration.test.ts` suite (e.g., `backend/src/functions/smoke.integration.test.ts`).

Cover at minimum:
- Authenticated 200 happy path
- 401 unauthenticated rejection
- One validation error path (400)

Unit tests alone are insufficient — the post-deploy `integration-test` agent will fail the pipeline if coverage is missing.
