# Framework-Driven Diagnostic Fixtures

> **Status:** P1 — Next evolution of the SDET diagnostic system shipped on 2026-03-26.
> **Affects:** `live-ui` agent, `e2e-testing-mandate.md`, `apps/sample-app/e2e/fixtures/`

---

## The Boundary Problem

Every agentic pipeline faces the same architectural tension: **what should the AI know (prompting)** vs. **what should the system enforce (engineering)**. As the pipeline matures, responsibilities migrate from prompt instructions into deterministic infrastructure — the same way manual QA procedures evolve into CI gates.

The SDET upgrade shipped diagnostic interception as a **prompt-driven mandate**. This was the correct first move — it proved the concept in a single iteration. But the current approach has structural limits that block enterprise scaling.

---

## Current State: Prompt-Driven Boilerplate

The APM instruction `e2e-testing-mandate.md` tells the LLM to manually emit ~20 lines of diagnostic code (console listeners, network interceptors, try/catch block) into every E2E test it generates.

**What works:**
- Zero infrastructure changes required — shipped by editing agent instructions only
- Highly flexible — add `localStorage` tracking with one line in the markdown prompt

**What doesn't scale:**
- **Token tax.** Output tokens are the most expensive and slowest part of an LLM call. 20 lines of repetitive boilerplate per test file slows the pipeline and burns API credits across every pipeline run.
- **Hallucination risk.** LLMs are probabilistic. The agent may eventually omit the `try/catch` block or misplace a `page.on` listener after navigation. If it forgets, the recovery loop goes blind — no diagnostics surface, and the triage agent receives an opaque failure.
- **Maintenance drag.** A human reviewing agent-generated E2E tests must read past 20 lines of diagnostic scaffolding to reach the actual assertions. This hurts PR review velocity.

---

## Target State: Framework-Driven Fixtures

The AI agent writes **pure tests** — navigation, interactions, assertions. Diagnostic capture is shifted into the **Playwright framework** via a custom fixture that automatically intercepts browser events and dumps logs on failure.

**Why it's better:**
- **100% deterministic.** The LLM cannot "forget" to capture network logs. Diagnostics are baked into the test runner — they execute on every test regardless of what the agent writes.
- **Token savings.** The agent writes 5 lines of business logic instead of 25. Across a feature with multiple E2E specs, this compounds into significant cost and latency reduction.
- **Centralized updates.** Changing how errors are formatted for the triage loop means updating one TypeScript file — not an APM prompt that depends on the LLM applying it correctly.
- **Human readability.** Agent-generated tests look identical to clean, hand-written E2E tests. No diagnostic noise in PRs.

**Tradeoff:**
- Requires upfront engineering — a custom Playwright fixture must be written and maintained in the target app repository.

---

## Implementation Plan

### Step 1: Create custom diagnostic fixture

`apps/sample-app/e2e/fixtures/diagnostic.fixture.ts`

This overrides Playwright's default `page` object to automatically attach listeners and hooks into `testInfo.status` to print diagnostics on failure:

```typescript
import { test as base } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const consoleLogs: string[] = [];
    const failedRequests: string[] = [];

    page.on('console', msg => { if (msg.type() === 'error') consoleLogs.push(msg.text()); });
    page.on('requestfailed', req => failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`));
    page.on('response', res => { if (!res.ok()) failedRequests.push(`${res.request().method()} ${res.url()} - ${res.status()}`); });

    await use(page);

    if (testInfo.status === 'failed') {
      console.log('\n--- Browser Diagnostics ---');
      if (consoleLogs.length) console.log(`Console errors:\n${consoleLogs.join('\n')}`);
      if (failedRequests.length) console.log(`Failed/non-OK requests:\n${failedRequests.join('\n')}`);
    }
  },
});
export { expect } from '@playwright/test';
```

### Step 2: Compose with existing auth fixture

The `demo-auth.fixture.ts` already extends `test` with authenticated session setup. The diagnostic fixture must compose with it — not replace it. Two options:

- **Option A:** Diagnostic fixture extends `base`, auth fixture extends diagnostic fixture (chain: `base` → `diagnostic` → `demo-auth`). Auth tests get both capabilities automatically.
- **Option B:** Both fixtures extend `base` independently, and a combined `test` object merges them via `mergeTests()`. More flexible but requires Playwright 1.39+.

Recommended: **Option A** — simpler, single import path, no version dependency.

### Step 3: Simplify the APM prompt

Replace the entire "Deep Diagnostic Interception" section in `e2e-testing-mandate.md` with:

> **MANDATORY:** Import `test` and `expect` from `./fixtures/diagnostic.fixture.ts` (or `./fixtures/demo-auth.fixture.ts` for authenticated tests — it re-exports the diagnostic fixture). Write assertions normally. Do NOT wrap assertions in try/catch blocks. Do NOT add `page.on('console')` or `page.on('requestfailed')` listeners — the framework handles this automatically.

### Step 4: Update `agents.ts` Phase 3a

Remove the instruction in Phase 3a step 5 about using `page.route()` try/catch patterns. Replace with a note that the fixture handles diagnostic capture — the agent only needs to write the scenario logic.

---

## Migration Path

This is a **non-breaking evolution** — the prompt-driven approach continues working until the fixture is in place. Migration sequence:

1. Write and test `diagnostic.fixture.ts` in the sample app
2. Refactor `demo-auth.fixture.ts` to chain from diagnostic fixture
3. Verify existing E2E tests pass with the new fixture chain
4. Simplify `e2e-testing-mandate.md` to the single-rule version
5. Update `agents.ts` Phase 3a to remove boilerplate instructions
6. Delete this file from `06-roadmap/` — the feature is now part of the platform

---

## The Architect's Principle

> **Prompt what the AI should think. Engineer what the system must guarantee.**

The prompt-driven approach proved that deep diagnostics feeding a recovery loop works. The framework-driven approach makes it structurally impossible to forget. As the pipeline matures, every reliability-critical behavior should follow this migration path: **prompt → validate → codify.**
