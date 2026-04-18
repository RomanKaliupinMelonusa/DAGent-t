## E2E Testing Mandate

- Every user-facing feature MUST have Playwright E2E test coverage.
- E2E tests run against the live deployed frontend URL.
- Infrastructure changes (CORS, gateway, IAM) mandate E2E validation even without frontend code changes.

## Deep Diagnostic Interception (Mandatory)

Every Playwright test the agent generates MUST include browser-level diagnostic capture. Silent browser failures (console errors, failed network requests) are invisible to standard assertions but critical for the self-healing triage loop. Without this instrumentation, the `report_outcome` (status: "failed") diagnostic trace will lack the context needed to route fixes to the correct dev agent.

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

**Important:** Wrap the **entire test body** in a single try/catch — do NOT wrap individual `expect()` calls. Playwright's auto-retrying assertions (`toBeVisible()`, `toHaveText()`, etc.) rely on their own timeout and retry semantics. Wrapping them individually defeats the retry contract and produces false negatives.

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

## Senior E2E Best Practices & Anti-Patterns (CRITICAL)

To prevent flaky tests, race conditions, and excessive agent debugging loops, you MUST adhere to the following Playwright architectural standards.

### 1. Network Synchronization (The Mutation Rule)
**Rule:** When clicking a button triggers an API mutation (POST, PUT, PATCH, DELETE), you MUST wait for the network response before proceeding. If you do not wait, the test will navigate or exit, aborting the request and causing flaky failures.

**✅ DO THIS (Explicit Promise Setup):**
```typescript
// 1. Setup the wait promise BEFORE the action
const patchPromise = page.waitForResponse(res =>
  res.url().includes('/api/') && res.status() === 200
);
// 2. Perform the action
await page.getByRole('button', { name: 'Submit' }).click();
// 3. Await the network resolution
await patchPromise;
```

**❌ DO NOT DO THIS (Click and Pray):**
```typescript
await page.getByRole('button', { name: 'Submit' }).click();
// The test might end here, aborting the request!
```

### 2. Web-First Auto-Retrying Assertions
**Rule:** Never assert on static state. Always use `await expect(locator)...` so Playwright auto-retries until the condition is met.

**✅ DO THIS:**
```typescript
await expect(page.getByText('Success')).toBeVisible();
```
**❌ DO NOT DO THIS:**
```typescript
const isVisible = await page.getByText('Success').isVisible();
expect(isVisible).toBeTruthy(); // Will fail immediately if the DOM hasn't updated yet!
```

### 3. Resilient Locators
**Rule:** Never use CSS selectors (`.class > div`) or XPath. You MUST use user-facing locators (`getByRole`, `getByText`, `getByLabel`, `getByTestId`). Tests should break when functionality breaks, not when styling changes.

### 4. HARD BANS
- **BANNED:** `await page.waitForTimeout(...)`. Never use hardcoded sleeps. Use web-first assertions or `waitForResponse`.
- **BANNED:** `page.waitForLoadState('networkidle')`. This is flaky in modern SPAs with constant background polling. Await specific API responses or UI elements instead.
