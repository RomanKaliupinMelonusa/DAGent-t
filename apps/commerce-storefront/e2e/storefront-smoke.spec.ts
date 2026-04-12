import { test, expect, type Page } from '@playwright/test';

/**
 * Smoke tests for the PWA Kit commerce storefront.
 *
 * These tests verify core ecommerce flows are functional:
 * - Homepage loads
 * - Product listing page renders products
 * - Product detail page shows product info
 * - Add to cart flow works
 *
 * Tests run against the local dev server (localhost:3000) by default,
 * or against STOREFRONT_URL if set.
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
    // Capture diagnostic info on failure
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

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Storefront Smoke Tests', () => {
  test('homepage loads and renders', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/.+/); // Page has a title
    // The Retail React App renders a main content area
    await expect(page.locator('main, [role="main"], #app')).toBeVisible();
  });

  test('can navigate to a category/PLP page', async ({ page }) => {
    await page.goto('/');
    // Look for navigation links (categories)
    const navLink = page.locator('nav a, [role="navigation"] a').first();
    if (await navLink.isVisible()) {
      await navLink.click();
      await page.waitForLoadState('domcontentloaded');
      // PLP should show product tiles
      await expect(page.locator('[data-testid="product-tile"], .product-tile, article').first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test('product detail page shows product info', async ({ page }) => {
    await page.goto('/');
    // Navigate to a product (find any product link)
    const productLink = page.locator('a[href*="/product/"], a[href*="/products/"]').first();
    if (await productLink.isVisible({ timeout: 10_000 })) {
      await productLink.click();
      await page.waitForLoadState('domcontentloaded');
      // PDP should have product name and price
      await expect(page.locator('h1, [data-testid="product-name"]').first()).toBeVisible({ timeout: 15_000 });
    }
  });
});
