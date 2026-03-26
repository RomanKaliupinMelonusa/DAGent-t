## E2E Testing Mandate

- Every user-facing feature MUST have Playwright E2E test coverage.
- E2E tests run against the live deployed frontend URL.
- Infrastructure changes (CORS, gateway, IAM) mandate E2E validation even without frontend code changes.

## Deep Diagnostic Interception (Mandatory)

Every Playwright test the agent generates MUST include browser-level diagnostic capture. Silent browser failures (console errors, failed network requests) are invisible to standard assertions but critical for the self-healing triage loop. Without this instrumentation, the `pipeline:fail` diagnostic trace will lack the context needed to route fixes to the correct dev agent.

### Required Setup — Inject Into Every Test

The following instrumentation MUST be added to the setup of every Playwright test (inside `test()` or `test.beforeEach()`), **before** any navigation or interaction:

```typescript
const consoleLogs: string[] = [];
page.on('console', msg => { if (msg.type() === 'error') consoleLogs.push(msg.text()); });

const failedRequests: string[] = [];
page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`));
page.on('response', response => { if (!response.ok()) failedRequests.push(`${response.request().method()} ${response.url()} - ${response.status()}`); });
```

### Required Failure Handling — Surface Diagnostics on Assertion Failure

If a UI assertion fails in the generated test, the `catch` block MUST append the `consoleLogs` and `failedRequests` arrays to the test failure output. This ensures the triage loop receives full browser context alongside the assertion error.

Pattern:
```typescript
try {
  // ... Playwright assertions (expect, waitForSelector, etc.)
} catch (error) {
  const diagnostics = [
    consoleLogs.length ? `Console errors:\n${consoleLogs.join('\n')}` : '',
    failedRequests.length ? `Failed/non-OK requests:\n${failedRequests.join('\n')}` : '',
  ].filter(Boolean).join('\n\n');

  if (diagnostics) {
    throw new Error(`${(error as Error).message}\n\n--- Browser Diagnostics ---\n${diagnostics}`);
  }
  throw error;
}
```

### Rules

1. **No exceptions.** Every generated Playwright test must include the diagnostic setup and failure handling above. Tests without this instrumentation are non-compliant.
2. **Placement:** The `page.on()` listeners must be registered BEFORE `page.goto()` or any navigation call, so they capture events from the very first page load.
3. **Scope:** Capture `console.error` only (not `log`, `warn`, `info`) to keep noise low. Capture both `requestfailed` events AND non-OK responses (`response.status() >= 400`).
4. **Existing fixtures:** The diagnostic setup is compatible with `demo-auth.fixture.ts` — the fixture manages authentication, while this instrumentation captures runtime diagnostics. Both can coexist in the same test.
