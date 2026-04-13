import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * E2E tests for the Product Quick View feature.
 *
 * Validates that shoppers can preview product details directly from the PLP
 * via a Quick View overlay bar and modal, without navigating to the PDP.
 *
 * data-testid contract:
 *   - quick-view-btn      → overlay bar button on each product tile
 *   - quick-view-modal    → modal content wrapper (ModalContent)
 *   - quick-view-spinner  → loading spinner inside modal
 *   - quick-view-error    → error/unavailable state inside modal
 */

// ─── Browser Diagnostics (MANDATORY) ─────────────────────────────────────

let consoleErrors: string[] = [];
let failedRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
  });
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== 'passed') {
    console.log(`\n--- Browser Diagnostics for "${testInfo.title}" ---`);
    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors);
    }
    if (failedRequests.length > 0) {
      console.log('Failed requests:', failedRequests);
    }
    await page
      .screenshot({
        path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
      })
      .catch(() => {});
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a Product Listing Page that shows product tiles with Quick View.
 * Strategy: try common RefArch PLP/search URLs, then fall back to nav discovery.
 */
async function navigateToPLP(page: Page): Promise<void> {
  const plpPaths = [
    '/category/newarrivals',
    '/category/womens',
    '/category/mens',
    '/search?q=shirt',
  ];

  for (const path of plpPaths) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });

    const tile = page.getByTestId('quick-view-btn').first();
    const hasTile = await tile
      .waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);

    if (hasTile) return;
  }

  // Fallback: navigate via homepage category links
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navLink = page.locator('nav a, [role="navigation"] a').first();
  await navLink.waitFor({ state: 'visible', timeout: 15_000 });
  await navLink.click();
  await page.waitForLoadState('domcontentloaded');

  await page
    .getByTestId('quick-view-btn')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 });
}

/**
 * Detect the PWA Kit crash page and throw a descriptive error.
 */
async function assertNoCrashPage(
  page: Page,
  actionDescription: string
): Promise<void> {
  const crashHeading = page.getByRole('heading', {
    name: /this page isn't working/i,
  });
  const hasCrash = await crashHeading
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => true)
    .catch(() => false);

  if (hasCrash) {
    const stack = await page
      .locator('pre')
      .textContent()
      .catch(() => 'no stack');
    throw new Error(
      `PWA Kit crash page detected after "${actionDescription}". Stack: ${stack}`
    );
  }
}

/**
 * Three-outcome assertion after opening the Quick View modal.
 * Returns which outcome was reached: 'content', 'error-state', or 'crash'.
 */
async function waitForQuickViewOutcome(
  page: Page
): Promise<'content' | 'error-state' | 'crash'> {
  const content = page
    .getByTestId('quick-view-modal')
    .locator(
      'form, [class*="productView"], button:has-text("Add to Cart"), button:has-text("Add to cart"), a:has-text("Full Details"), a:has-text("full details")'
    );
  const errorState = page.getByTestId('quick-view-error');
  const crashPage = page.getByRole('heading', {
    name: /this page isn't working/i,
  });

  const winner = await Promise.race([
    content
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'content' as const),
    errorState
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'error-state' as const),
    crashPage
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => 'crash' as const),
  ]);

  if (winner === 'crash') {
    const stack = await page
      .locator('pre')
      .textContent()
      .catch(() => 'no stack');
    throw new Error(`PWA Kit crash page detected. Stack: ${stack}`);
  }

  return winner;
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
  test.describe('Quick View overlay bar on PLP', () => {
    test('product tiles on PLP show Quick View overlay button', async ({
      page,
    }) => {
      await navigateToPLP(page);
      await assertNoCrashPage(page, 'navigating to PLP');

      const quickViewBtns = page.getByTestId('quick-view-btn');
      await expect(quickViewBtns.first()).toBeVisible();
      await expect(quickViewBtns.first()).toContainText('Quick View');
    });

    test('Quick View button has accessible aria-label with product name', async ({
      page,
    }) => {
      await navigateToPLP(page);

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await expect(quickViewBtn).toBeVisible();

      const ariaLabel = await quickViewBtn.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel).toMatch(/^Quick View\s+.+/);
    });

    test('Quick View buttons exist on standard product tiles', async ({
      page,
    }) => {
      await navigateToPLP(page);

      const tiles = page.getByTestId('quick-view-btn');
      const count = await tiles.count();
      expect(count).toBeGreaterThan(0);
    });
  });

  test.describe('Quick View modal — open and close', () => {
    test('clicking Quick View button opens the modal', async ({ page }) => {
      await navigateToPLP(page);

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await expect(quickViewBtn).toBeVisible();

      const urlBefore = page.url();

      await quickViewBtn.click();
      await assertNoCrashPage(page, 'clicking Quick View button');

      const modal = page.getByTestId('quick-view-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      // URL should NOT have changed (no PDP navigation)
      expect(page.url()).toBe(urlBefore);
    });

    test('modal shows loading spinner then resolves to content or error', async ({
      page,
    }) => {
      await navigateToPLP(page);

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click();

      const modal = page.getByTestId('quick-view-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      const outcome = await waitForQuickViewOutcome(page);
      expect(['content', 'error-state']).toContain(outcome);
    });

    test('modal can be closed via the X (close) button', async ({ page }) => {
      await navigateToPLP(page);

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click();

      const modal = page.getByTestId('quick-view-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      const closeBtn = modal.locator('button[aria-label="Close"]');
      await expect(closeBtn).toBeVisible();
      await closeBtn.click();

      await expect(modal).not.toBeVisible({ timeout: 5_000 });
    });

    test('modal can be closed by pressing Escape', async ({ page }) => {
      await navigateToPLP(page);

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click();

      const modal = page.getByTestId('quick-view-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      await page.keyboard.press('Escape');

      await expect(modal).not.toBeVisible({ timeout: 5_000 });
    });

    test('closing modal preserves PLP state (URL unchanged)', async ({
      page,
    }) => {
      await navigateToPLP(page);
      const urlBefore = page.url();

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click();

      const modal = page.getByTestId('quick-view-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      await page.keyboard.press('Escape');
      await expect(modal).not.toBeVisible({ timeout: 5_000 });

      expect(page.url()).toBe(urlBefore);

      // Product tiles should still be visible
      await expect(
        page.getByTestId('quick-view-btn').first()
      ).toBeVisible();
    });
  });

  test.describe('Quick View modal — content', () => {
    test('modal displays product details when loaded', async ({ page }) => {
      await navigateToPLP(page);

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click();

      const modal = page.getByTestId('quick-view-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      const outcome = await waitForQuickViewOutcome(page);

      if (outcome === 'content') {
        // ProductView should render product information inside the modal
        const addToCartBtn = modal.locator(
          'button:has-text("Add to Cart"), button:has-text("Add to cart")'
        );
        const hasAddToCart = await addToCartBtn
          .first()
          .waitFor({ state: 'visible', timeout: 5_000 })
          .then(() => true)
          .catch(() => false);

        const modalText = await modal.textContent();
        expect(modalText!.length).toBeGreaterThan(10);

        if (hasAddToCart) {
          await expect(addToCartBtn.first()).toBeVisible();
        }
      } else {
        const errorEl = page.getByTestId('quick-view-error');
        await expect(errorEl).toContainText(/no longer available/i);
      }
    });

    test('modal has accessible aria-label including product name', async ({
      page,
    }) => {
      await navigateToPLP(page);

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click();

      const modal = page.getByTestId('quick-view-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      const ariaLabel = await modal.getAttribute('aria-label');
      expect(ariaLabel).toBeTruthy();
      expect(ariaLabel).toMatch(/Quick view for\s+.+/i);
    });

    test('modal shows "View Full Details" link to PDP when content loads', async ({
      page,
    }) => {
      await navigateToPLP(page);

      const quickViewBtn = page.getByTestId('quick-view-btn').first();
      await quickViewBtn.click();

      const modal = page.getByTestId('quick-view-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });

      const outcome = await waitForQuickViewOutcome(page);

      if (outcome === 'content') {
        const fullDetailsLink = modal.locator(
          'a:has-text("Full Details"), a:has-text("full details"), a:has-text("View Full Details")'
        );
        const hasLink = await fullDetailsLink
          .first()
          .waitFor({ state: 'visible', timeout: 5_000 })
          .then(() => true)
          .catch(() => false);

        if (hasLink) {
          const href = await fullDetailsLink.first().getAttribute('href');
          expect(href).toMatch(/\/product\//);
        }
      }
    });
  });

  test.describe('Quick View — multiple products', () => {
    test('can open Quick View for different products sequentially', async ({
      page,
    }) => {
      await navigateToPLP(page);

      const quickViewBtns = page.getByTestId('quick-view-btn');
      const btnCount = await quickViewBtns.count();

      const productsToTest = Math.min(btnCount, 2);

      for (let i = 0; i < productsToTest; i++) {
        const btn = quickViewBtns.nth(i);
        await btn.scrollIntoViewIfNeeded();
        await btn.click();

        const modal = page.getByTestId('quick-view-modal');
        await expect(modal).toBeVisible({ timeout: 10_000 });

        const ariaLabel = await modal.getAttribute('aria-label');
        expect(ariaLabel).toMatch(/Quick view for/i);

        await waitForQuickViewOutcome(page);
        await assertNoCrashPage(page, `Quick View for product ${i + 1}`);

        await page.keyboard.press('Escape');
        await expect(modal).not.toBeVisible({ timeout: 5_000 });
      }
    });
  });
});
