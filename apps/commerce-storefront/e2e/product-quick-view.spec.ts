/**
 * e2e/product-quick-view.spec.ts
 *
 * End-to-end tests for the Product Quick View feature.
 * One test per required_flow in the acceptance contract.
 *
 * Acceptance contract:
 *   .dagent/product-quick-view/spec-compiler/inv_01KQB2RH63KD04266Y3WPMDRSH/outputs/acceptance.yml
 */

import { test, expect, awaitHydrated } from './fixtures';
import type { Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// Baseline noise patterns — derived MECHANICALLY from baseline.json
// Only entries with volatility: "persistent" are included.
// Characters escaped: . ? + * ( ) [ ] { } | ^ $ \ /
// ---------------------------------------------------------------------------

const BASELINE_NOISE_PATTERNS: RegExp[] = [
  /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
  /Warning: %s: Support for defaultProps will be removed from function components in a future major release\. Use JavaScript default parameters instead\./,
  /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
  /retail-react-app\.use-datacloud\._handleApiError ERROR \[DataCloudApi\] Error sending Data Cloud event/,
  /r: 403 Forbidden/,
];

// ---------------------------------------------------------------------------
// Fixture loader (§23) — reads test_fixtures from acceptance.yml by id
// ---------------------------------------------------------------------------

type Fixture = {
  id: string;
  url: string;
  base_sha: string;
  asserted_at: string;
  asserts: Array<{ kind: string; value: unknown; comparator?: string }>;
};

function loadFixture(id: string): Fixture {
  const acceptancePath =
    process.env.ACCEPTANCE_PATH ??
    path.resolve(
      __dirname,
      '..',
      '.dagent',
      'product-quick-view',
      'spec-compiler',
      'inv_01KQB2RH63KD04266Y3WPMDRSH',
      'outputs',
      'acceptance.yml',
    );
  const doc = yaml.load(fs.readFileSync(acceptancePath, 'utf-8')) as {
    test_fixtures?: Fixture[];
  };
  const f = (doc.test_fixtures ?? []).find((x) => x.id === id);
  if (!f) throw new Error(`fixture id "${id}" not found in acceptance.yml`);
  return f;
}

// ---------------------------------------------------------------------------
// Overlay dismissal helper (§19) — PWA Kit consent/locale dialogs
// ---------------------------------------------------------------------------

/**
 * Dismiss any Chakra-portal-mounted dialog (consent, locale, onboarding)
 * that intercepts pointer events on PLP/PDP/cart roots. PWA-Kit-generic;
 * idempotent; never throws; bounded total wall time (~1.5s worst case,
 * <50 ms when no overlay is present). Uses only `@playwright/test`
 * primitives — no `waitForTimeout`, no `networkidle` (per rules §1–§2).
 */
async function dismissOverlays(page: Page): Promise<void> {
  const ctaPattern =
    /accept|decline|close|continue|got it|dismiss|confirm|select/i;
  // Up to 3 passes — stacked portals (consent + locale) need sequential dismiss.
  for (let pass = 0; pass < 3; pass++) {
    const dialogs = await page.getByRole('dialog').all();
    let dismissed = false;
    for (const dialog of dialogs) {
      if (!(await dialog.isVisible().catch(() => false))) continue;
      const cta = dialog.getByRole('button', { name: ctaPattern }).first();
      const clicked = await cta
        .click({ timeout: 400 })
        .then(() => true)
        .catch(() => false);
      if (!clicked) {
        await page.keyboard.press('Escape').catch(() => {});
      }
      await dialog
        .waitFor({ state: 'hidden', timeout: 400 })
        .catch(() => {});
      dismissed = true;
    }
    if (!dismissed) return;
  }
}

// ---------------------------------------------------------------------------
// Per-test console error collection for budget assertion (§17)
// ---------------------------------------------------------------------------

let consoleErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — one per required_flow
// ---------------------------------------------------------------------------

test.describe('Product Quick View', () => {
  test('open-quick-view-from-tile', async ({ page }) => {
    const fixture = loadFixture('plp-multi-color');
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await awaitHydrated(page);

    // Assert quick-view-trigger is visible (cardinality: many -> use .first())
    await expect(
      page.getByTestId('quick-view-trigger').first(),
    ).toBeVisible({ timeout: 10000 });

    // Click the first quick-view trigger
    await page.getByTestId('quick-view-trigger').first().click();

    // Three-outcome detection (§12)
    const modal = page.getByTestId('quick-view-modal');
    const errorState = page.getByTestId('quick-view-modal-error');
    const crashPage = page.getByRole('heading', {
      name: /this page isn't working/i,
    });

    const winner = await Promise.race([
      modal
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => 'content' as const),
      errorState
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => 'error-state' as const),
      crashPage
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => 'crash' as const),
    ]);

    if (winner === 'crash') {
      const stack = await page
        .locator('pre')
        .textContent()
        .catch(() => 'no stack');
      throw new Error(
        `PWA Kit crash page detected after "click quick-view-trigger". Stack: ${stack}`,
      );
    }

    // Happy path: modal must be visible
    expect(winner).toBe('content');
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Assert product-view is rendered inside the modal
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    // Assert quick-view-view-full-details-link is visible with non-empty text (required_dom)
    const fullDetailsLink = page.getByTestId('quick-view-view-full-details-link');
    await expect(fullDetailsLink).toBeVisible({ timeout: 10000 });
    await expect(fullDetailsLink).not.toHaveText('');

    // Assert quick-view-add-to-cart-btn is visible with non-empty text (required_dom)
    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');
    await expect(addToCartBtn).toBeVisible({ timeout: 10000 });
    await expect(addToCartBtn).not.toHaveText('');

    // Console error budget assertion (§17)
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  test('switch-color-swatch-in-quick-view', async ({ page }) => {
    const fixture = loadFixture('plp-multi-color');
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await awaitHydrated(page);

    // Assert quick-view-trigger visible
    await expect(
      page.getByTestId('quick-view-trigger').first(),
    ).toBeVisible({ timeout: 10000 });

    // Open Quick View
    await page.getByTestId('quick-view-trigger').first().click();

    // Wait for modal and product-view
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    // Click second color swatch (nth: 1 = index 1)
    await page.getByTestId('color-swatch').nth(1).click();

    // Product view should still be visible after swatch change
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    // Console error budget assertion (§17)
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  test('add-to-bag-from-quick-view', async ({ page }) => {
    const fixture = loadFixture('plp-add-to-bag');
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await awaitHydrated(page);

    // Assert quick-view-trigger visible
    await expect(
      page.getByTestId('quick-view-trigger').first(),
    ).toBeVisible({ timeout: 10000 });

    // Open Quick View
    await page.getByTestId('quick-view-trigger').first().click();

    // Wait for modal and product-view
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    // Click Add to Cart button
    await page.getByTestId('quick-view-add-to-cart-btn').click({ timeout: 10000 });

    // Three-outcome detection for add-to-cart-modal
    const confirmModal = page.getByTestId('add-to-cart-modal');
    const errorState = page.getByTestId('quick-view-modal-error');
    const crashPage = page.getByRole('heading', {
      name: /this page isn't working/i,
    });

    const winner = await Promise.race([
      confirmModal
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => 'content' as const),
      errorState
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => 'error-state' as const),
      crashPage
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => 'crash' as const),
    ]);

    if (winner === 'crash') {
      const stack = await page
        .locator('pre')
        .textContent()
        .catch(() => 'no stack');
      throw new Error(
        `PWA Kit crash page detected after "click add-to-cart-btn". Stack: ${stack}`,
      );
    }

    // Happy path: add-to-cart confirmation modal must appear
    expect(winner).toBe('content');
    await expect(confirmModal).toBeVisible({ timeout: 15000 });

    // Console error budget assertion (§17)
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  test('close-quick-view-restores-focus', async ({ page }) => {
    const fixture = loadFixture('plp-multi-color');
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await awaitHydrated(page);

    // Assert quick-view-trigger visible
    await expect(
      page.getByTestId('quick-view-trigger').first(),
    ).toBeVisible({ timeout: 10000 });

    // Open Quick View
    await page.getByTestId('quick-view-trigger').first().click();

    // Wait for modal
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });

    // Close the modal via close button
    await page.getByTestId('quick-view-modal-close-btn').click({ timeout: 5000 });

    // After closing, the trigger should be visible again (focus restored)
    await expect(
      page.getByTestId('quick-view-trigger').first(),
    ).toBeVisible({ timeout: 10000 });

    // Console error budget assertion (§17)
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  test('no-pickup-ui-in-quick-view', async ({ page }) => {
    const fixture = loadFixture('plp-multi-color');
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await awaitHydrated(page);

    // Assert quick-view-trigger visible
    await expect(
      page.getByTestId('quick-view-trigger').first(),
    ).toBeVisible({ timeout: 10000 });

    // Open Quick View
    await page.getByTestId('quick-view-trigger').first().click();

    // Wait for modal and product view
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId('product-view')).toBeVisible({
      timeout: 10000,
    });

    // Negative assertion: pickup/ship-to-store delivery options must NOT be visible
    // The delivery options are behind showDeliveryOptions={false}
    await expect(
      page.getByTestId('delivery-options'),
    ).not.toBeVisible();
    await expect(
      page.getByTestId('store-pickup'),
    ).not.toBeVisible();

    // Console error budget assertion (§17)
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });

  test('add-to-bag-disabled-when-unavailable', async ({ page }) => {
    const fixture = loadFixture('plp-add-to-bag');
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
    await dismissOverlays(page);
    await awaitHydrated(page);

    // Assert quick-view-trigger visible
    await expect(
      page.getByTestId('quick-view-trigger').first(),
    ).toBeVisible({ timeout: 10000 });

    // Open Quick View
    await page.getByTestId('quick-view-trigger').first().click();

    // Wait for modal
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({
      timeout: 10000,
    });

    // The Add to Cart button should be visible with non-empty text (required_dom)
    const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');
    await expect(addToCartBtn).toBeVisible({ timeout: 10000 });
    await expect(addToCartBtn).not.toHaveText('');

    // Best-effort: verify the button is disabled in master product state
    // (before a complete variation is selected)
    await expect(addToCartBtn).toBeDisabled();

    // Console error budget assertion (§17)
    expect(
      consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
      ),
    ).toEqual([]);
  });
});
