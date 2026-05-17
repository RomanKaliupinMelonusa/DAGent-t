/**
 * _baseline-capture.spec.ts — Lightweight baseline signal collector.
 *
 * NOT a real test — always passes. Navigates target URLs, collects
 * console errors and failed network requests, and outputs JSON to
 * stdout. Used as a Playwright MCP fallback by the baseline-analyzer
 * agent when MCP tools return empty results.
 *
 * Usage:
 *   npx playwright test e2e/_baseline-capture.spec.ts --reporter=json
 */

import { test } from './fixtures';
import { dismissOverlays } from './helpers';
import type { ConsoleMessage, Request } from '@playwright/test';

const TARGETS = [
  { name: 'PLP', url: '/category/newarrivals' },
  { name: 'PDP', url: '/category/newarrivals' }, // will navigate to first tile
  { name: 'Search', url: '/search?q=shirt' },
  { name: 'Cart', url: '/cart' },
];

interface CapturedSignal {
  pattern: string;
  source_page: string;
  count: number;
}

const consoleErrors: CapturedSignal[] = [];
const networkFailures: CapturedSignal[] = [];

function addSignal(
  bucket: CapturedSignal[],
  pattern: string,
  sourcePage: string,
): void {
  const existing = bucket.find(
    (s) => s.pattern === pattern && s.source_page === sourcePage,
  );
  if (existing) {
    existing.count++;
  } else {
    bucket.push({ pattern, source_page: sourcePage, count: 1 });
  }
}

/** Strip ANSI codes, timestamps, UUIDs, and line numbers for stable matching. */
function normalize(msg: string): string {
  return msg
    .replace(/\x1B\[[0-9;]*m/g, '')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\dZ]*/g, '<ISO>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/:\d+:\d+/g, ':<line>:<col>')
    .trim();
}

for (const target of TARGETS) {
  test(`baseline capture: ${target.name}`, async ({ page }) => {
    const pageConsoleErrors: string[] = [];
    const pageNetworkFailures: string[] = [];

    const onConsole = (msg: ConsoleMessage) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const text = normalize(msg.text());
        if (text.length > 5) pageConsoleErrors.push(text);
      }
    };

    const onRequestFailed = (req: Request) => {
      const text = `${req.method()} ${new URL(req.url()).pathname}`;
      pageNetworkFailures.push(normalize(text));
    };

    page.on('console', onConsole);
    page.on('requestfailed', onRequestFailed);

    try {
      if (target.name === 'PDP') {
        // Navigate to PLP first, then click the first product tile.
        await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await dismissOverlays(page);
        const tile = page.locator('[data-testid^="product-tile"]').first();
        const tileVisible = await tile
          .waitFor({ state: 'visible', timeout: 5_000 })
          .then(() => true)
          .catch(() => false);
        if (tileVisible) {
          await tile.click();
          await page.waitForURL(/\/product\//, { timeout: 10_000 }).catch(() => {});
        }
      } else {
        await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      }
      await dismissOverlays(page);
      // Allow time for async errors and failed requests to surface.
      await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
    } finally {
      page.off('console', onConsole);
      page.off('requestfailed', onRequestFailed);
    }

    // Merge into global buckets.
    for (const msg of pageConsoleErrors) {
      addSignal(consoleErrors, msg, target.name);
    }
    for (const msg of pageNetworkFailures) {
      addSignal(networkFailures, msg, target.name);
    }
  });
}

test.afterAll(() => {
  // Output baseline JSON to stdout for the agent to parse.
  const output = {
    schemaVersion: 1,
    producedBy: 'baseline-capture-spec',
    producedAt: new Date().toISOString(),
    console_errors: consoleErrors,
    network_failures: networkFailures,
  };
  // eslint-disable-next-line no-console
  console.log(`\n__BASELINE_JSON_START__\n${JSON.stringify(output, null, 2)}\n__BASELINE_JSON_END__\n`);
});
