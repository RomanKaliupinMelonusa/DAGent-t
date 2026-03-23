## Integration Testing

<!-- TODO: Document your integration testing patterns here.
     This file is included in the integration-test agent's instructions.

     Suggested topics:
     - How to authenticate against live endpoints (DefaultAzureCredential, API keys, etc.)
     - Test database setup and teardown
     - Environment variables required for integration tests
     - Test data isolation strategy
     - Which endpoints to test and expected response shapes
-->

- Integration tests run against the live deployed backend URL.
- Use `RUN_INTEGRATION=true` environment variable to enable integration tests.
- Set `INTEGRATION_API_BASE_URL` to the deployed backend URL.
