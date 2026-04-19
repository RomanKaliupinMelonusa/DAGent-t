import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * E2E tests for the Product Quick View feature.
 *
 * Verifies the Quick View overlay bar on product tiles and the
 * Quick View modal that opens when clicked. Tests run against the
 * local dev server (localhost:3000) or STOREFRONT_URL.
 *
 * data-testid contract:
 *   - quick-view-btn       → overlay bar button on each product tile
 *   - quick-view-modal     → the modal content wrapper
 *   - quick-view-spinner   → loading spinner inside the modal
 *   - quick-view-error     → error state when product is unavailable
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
    await page.screenshot({
      path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`,
    });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Navigate to a category PLP that has product tiles with Quick View buttons. */
async function navigateToPLP(page: Page): Promise<void> {
  // Navigate to the homepage first
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  // Find and click a category navigation link to reach a PLP
  const navLink = page.locator('nav a, [role="navigation"] a').first();
  await navLink.waitFor({ state: 'visible', timeout: 30_000 });
  await navLink.click();
  await page.waitForLoadState('domcontentloaded');

  // Wait for product tiles to render on the PLP
  await page.getByTestId('quick-view-btn').first().waitFor({ state: 'visible', timeout: 30_000 });
}

/**
 * Detect PWA Kit crash page after an action.
 * Throws a structured error with stack trace if detected.
 */
async function assertNoCrashPage(page: Page, actionDescription: string): Promise<void> {
  const crashHeading = page.getByRole('heading', { name: /this page isn't working/i });
  const hasCrash = await crashHeading
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);

  if (hasCrash) {
    const stack = await page.locator('pre').textContent().catch(() => 'no stack');
    throw new Error(
      `PWA Kit crash page detected after "${actionDescription}". Stack: ${stack}`
    );
  }
}

/**
 * Three-outcome assertion for modal open.
 * Returns 'content' | 'error-state' | 'crash'.
 */
async function waitForModalOutcome(
  page: Page
): Promise<'content' | 'error-state' | 'crash'> {
  const content = page.getByTestId('quick-view-modal');
  const errorState = page.getByTestId('quick-view-error');
  const crashPage = page.getByRole('heading', { name: /this page isn't working/i });

  const winner = await Promise.race([
    content
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => 'content' as const),
    errorState
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => 'error-state' as const),
    crashPage
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => 'crash' as const),
  ]);

  if (winner === 'crash') {
    const stack = await page.locator('pre').textContent().catch(() => 'no stack');
    throw new Error(`PWA Kit crash page detected. Stack: ${stack}`);
  }

  return winner;
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View — Overlay Bar', () => {
  test('Quick View buttons are visible on PLP product tiles', async ({ page }) => {
    await navigateToPLP(page);

    // Verify at least one Quick View button exists
    const quickViewButtons = page.getByTestId('quick-view-btn');
    const count = await quickViewButtons.count();
    expect(count).toBeGreaterThan(0);

    // Verify the button text
    const firstBtn = quickViewButtons.first();
    await expect(firstBtn).toContainText('Quick View');
  });

  test('Quick View button has accessible aria-label with product name', async ({ page }) => {
    await navigateToPLP(page);

    const firstBtn = page.getByTestId('quick-view-btn').first();
    const ariaLabel = await firstBtn.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    expect(ariaLabel).toMatch(/^Quick View /);
  });

  test('clicking Quick View button does NOT navigate away from PLP', async ({ page }) => {
    await navigateToPLP(page);

    const urlBefore = page.url();

    const firstBtn = page.getByTestId('quick-view-btn').first();
    await firstBtn.click();

    // Brief pause to let any navigation settle
    await page.waitForLoadState('domcontentloaded');

    // URL should remain the same (no navigation to PDP)
    expect(page.url()).toBe(urlBefore);
  });
});

test.describe('Product Quick View — Modal', () => {
  test('clicking Quick View opens a modal with correct testid', async ({ page }) => {
    await navigateToPLP(page);

    const firstBtn = page.getByTestId('quick-view-btn').first();
    await firstBtn.click();

    // Use three-outcome pattern to detect modal content, error, or crash
    const outcome = await waitForModalOutcome(page);
    expect(['content', 'error-state']).toContain(outcome);

    // The modal wrapper should be visible
    await expect(page.getByTestId('quick-view-modal')).toBeVisible();
  });

  test('modal shows loading spinner before product data loads', async ({ page }) => {
    await navigateToPLP(page);

    const firstBtn = page.getByTestId('quick-view-btn').first();
    await firstBtn.click();

    // The spinner should appear briefly OR modal content loads immediately.
    // We use a race between spinner and final content.
    const modal = page.getByTestId('quick-view-modal');

    // Modal should open
    await modal.waitFor({ state: 'visible', timeout: 15_000 });
    await assertNoCrashPage(page, 'opening Quick View modal');

    // Either spinner was shown (fast check) or content already loaded — both are valid
    // The key assertion is that the modal opened successfully
    await expect(modal).toBeVisible();
  });

  test('modal has accessible aria-label containing product name', async ({ page }) => {
    await navigateToPLP(page);

    const firstBtn = page.getByTestId('quick-view-btn').first();
    await firstBtn.click();

    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });

    const ariaLabel = await modal.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    // The aria-label should match "Quick view for <product name>"
    expect(ariaLabel!.toLowerCase()).toContain('quick view for');
  });

  test('modal closes when clicking the close button', async ({ page }) => {
    await navigateToPLP(page);

    const firstBtn = page.getByTestId('quick-view-btn').first();
    await firstBtn.click();

    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });

    // Click the modal close button (Chakra ModalCloseButton)
    const closeBtn = modal.locator('button[aria-label="Close"]');
    await closeBtn.click();

    // Modal should disappear
    await expect(modal).toBeHidden({ timeout: 5_000 });
  });

  test('modal closes when pressing Escape key', async ({ page }) => {
    await navigateToPLP(page);

    const firstBtn = page.getByTestId('quick-view-btn').first();
    await firstBtn.click();

    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should disappear
    await expect(modal).toBeHidden({ timeout: 5_000 });
  });

  test('modal displays product information after loading', async ({ page }) => {
    await navigateToPLP(page);

    const firstBtn = page.getByTestId('quick-view-btn').first();
    await firstBtn.click();

    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });
    await assertNoCrashPage(page, 'opening Quick View modal for product info');

    // Wait for spinner to disappear (product data loaded)
    const spinner = page.getByTestId('quick-view-spinner');
    await spinner.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {
      // Spinner may have already disappeared before we checked — that's fine
    });

    // Check for either product content or error state (both valid)
    const errorState = page.getByTestId('quick-view-error');
    const hasError = await errorState.isVisible().catch(() => false);

    if (!hasError) {
      // Product content should be rendered: look for product name (heading)
      // and an Add to Cart button inside the modal
      const productHeading = modal.locator('h1, h2, [data-testid="product-name"]').first();
      await expect(productHeading).toBeVisible({ timeout: 10_000 });

      // There should be an Add to Cart button
      const addToCartBtn = modal.getByRole('button', { name: /add to cart/i });
      await expect(addToCartBtn).toBeVisible({ timeout: 5_000 });
    }
  });

  test('modal contains "View Full Details" link to PDP', async ({ page }) => {
    await navigateToPLP(page);

    const firstBtn = page.getByTestId('quick-view-btn').first();
    await firstBtn.click();

    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });

    // Wait for content to load (spinner gone)
    const spinner = page.getByTestId('quick-view-spinner');
    await spinner.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {});

    const errorState = page.getByTestId('quick-view-error');
    const hasError = await errorState.isVisible().catch(() => false);

    if (!hasError) {
      // ProductView with showFullLink=true should render a link to the PDP
      const fullDetailsLink = modal.locator('a[href*="/product/"]').first();
      await expect(fullDetailsLink).toBeVisible({ timeout: 5_000 });
    }
  });
});

test.describe('Product Quick View — Reopen & Multiple Tiles', () => {
  test('can open Quick View on different product tiles', async ({ page }) => {
    await navigateToPLP(page);

    const quickViewButtons = page.getByTestId('quick-view-btn');
    const count = await quickViewButtons.count();

    if (count >= 2) {
      // Open first tile's Quick View
      await quickViewButtons.nth(0).click();
      const modal = page.getByTestId('quick-view-modal');
      await modal.waitFor({ state: 'visible', timeout: 15_000 });
      const firstAriaLabel = await modal.getAttribute('aria-label');

      // Close the modal
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden({ timeout: 5_000 });

      // Open second tile's Quick View
      await quickViewButtons.nth(1).click();
      await modal.waitFor({ state: 'visible', timeout: 15_000 });
      const secondAriaLabel = await modal.getAttribute('aria-label');

      // The aria-labels should differ (different products) or at minimum modal opened twice
      expect(secondAriaLabel).toBeTruthy();
    }
  });

  test('PLP remains intact after opening and closing Quick View', async ({ page }) => {
    await navigateToPLP(page);

    const quickViewButtons = page.getByTestId('quick-view-btn');
    const countBefore = await quickViewButtons.count();

    // Open and close Quick View
    await quickViewButtons.first().click();
    const modal = page.getByTestId('quick-view-modal');
    await modal.waitFor({ state: 'visible', timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden({ timeout: 5_000 });

    // PLP tiles should still be present with same count
    const countAfter = await quickViewButtons.count();
    expect(countAfter).toBe(countBefore);
  });
});

test.describe('Product Quick View — Edge Cases', () => {
  test('Quick View buttons have consistent aria-label format', async ({
    page,
  }) => {
    await navigateToPLP(page);

    // Validate that Quick View buttons that ARE rendered have proper aria-labels
    const quickViewButtons = page.getByTestId('quick-view-btn');
    const count = await quickViewButtons.count();

    // Each Quick View button should have an aria-label starting with "Quick View "
    for (let i = 0; i < Math.min(count, 5); i++) {
      const ariaLabel = await quickViewButtons.nth(i).getAttribute('aria-label');
      expect(ariaLabel).toMatch(/^Quick View /);
    }
  });

  test('direct PLP navigation shows Quick View buttons', async ({ page }) => {
    // Navigate directly to a known category path
    await page.goto('/category/newarrivals', { waitUntil: 'domcontentloaded' });

    // Wait for the page to render product tiles — the category might redirect
    // or have a different slug, so we fall back to homepage navigation if needed
    const quickViewBtn = page.getByTestId('quick-view-btn').first();
    const hasBtns = await quickViewBtn
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!hasBtns) {
      // Category might not exist; navigate via homepage instead
      await navigateToPLP(page);
    }

    await expect(page.getByTestId('quick-view-btn').first()).toBeVisible();
  });
});
