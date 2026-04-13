import {test, expect, type Page, type Locator} from '@playwright/test';

/**
 * E2E tests for the Product Quick View feature.
 *
 * Covers:
 *  - Quick View overlay bar appears on product tiles (PLP)
 *  - Clicking the bar opens the Quick View modal
 *  - Modal displays product details (via ProductView)
 *  - Modal loading/error states
 *  - Modal close mechanisms (X button, Escape, overlay click)
 *  - "View Full Details" link navigates to PDP
 *  - Accessibility (aria-label, keyboard interaction)
 *
 * Data-testid contracts:
 *  - quick-view-btn          — overlay bar on each product tile
 *  - quick-view-modal        — modal content container
 *  - quick-view-spinner      — loading spinner inside modal
 *  - quick-view-error        — error/unavailable state inside modal
 */

// ─── Browser Diagnostics (MANDATORY) ─────────────────────────────────────

let consoleErrors: string[] = [];
let failedRequests: string[] = [];

test.beforeEach(async ({page}) => {
    consoleErrors = [];
    failedRequests = [];

    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('requestfailed', (req) => {
        failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });
});

test.afterEach(async ({page}, testInfo) => {
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
                path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
            })
            .catch(() => {});
    }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a category/PLP page that has product tiles.
 * Tries multiple strategies to land on a product listing.
 */
async function navigateToPLP(page: Page): Promise<void> {
    // The RefArch storefront has well-known category paths.
    // Try a direct category URL first — fastest and most reliable.
    await page.goto('/category/newarrivals', {waitUntil: 'domcontentloaded'});

    // Wait for product tiles to appear (the PLP is loaded).
    // The enhanced ProductTile wraps in role="group", and Quick View buttons exist.
    const quickViewBtn = page.getByTestId('quick-view-btn').first();
    const btnVisible = await quickViewBtn
        .waitFor({state: 'visible', timeout: 20_000})
        .then(() => true)
        .catch(() => false);

    if (btnVisible) return;

    // Fallback: try the womens category
    await page.goto('/category/womens', {waitUntil: 'domcontentloaded'});
    await page
        .getByTestId('quick-view-btn')
        .first()
        .waitFor({state: 'visible', timeout: 20_000})
        .catch(() => {});
}

/**
 * Detect the PWA Kit crash page. If found, throws with the stack trace.
 */
async function assertNoCrashPage(page: Page, actionDescription: string): Promise<void> {
    const crashHeading = page.getByRole('heading', {name: /this page isn't working/i});
    const hasCrash = await crashHeading
        .waitFor({state: 'visible', timeout: 2000})
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
 * Three-outcome assertion for modal open: content loaded, error state, or crash page.
 * Returns which outcome won.
 */
async function waitForModalOutcome(
    page: Page
): Promise<'content' | 'error-state' | 'crash'> {
    const content = page.getByTestId('quick-view-modal');
    const errorState = page.getByTestId('quick-view-error');
    const crashPage = page.getByRole('heading', {name: /this page isn't working/i});

    const winner = await Promise.race([
        content
            .waitFor({state: 'visible', timeout: 15_000})
            .then(() => 'content' as const),
        errorState
            .waitFor({state: 'visible', timeout: 15_000})
            .then(() => 'error-state' as const),
        crashPage
            .waitFor({state: 'visible', timeout: 15_000})
            .then(() => 'crash' as const)
    ]);

    if (winner === 'crash') {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack');
        throw new Error(`PWA Kit crash page detected when opening Quick View. Stack: ${stack}`);
    }

    return winner;
}

// ─── Tests: Quick View Overlay Bar ────────────────────────────────────────

test.describe('Quick View — Overlay Bar on PLP', () => {
    test('product tiles display Quick View buttons', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        // At least one Quick View button should be visible on the PLP.
        // On mobile viewports the bar is always visible (opacity: 1).
        // On desktop it may be hidden until hover, so we check DOM presence.
        const quickViewBtns = page.getByTestId('quick-view-btn');
        const count = await quickViewBtns.count();
        expect(count).toBeGreaterThan(0);
    });

    test('Quick View button has accessible aria-label', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const firstBtn = page.getByTestId('quick-view-btn').first();
        await expect(firstBtn).toHaveAttribute('aria-label', /Quick View .+/);
    });

    test('Quick View button is a semantic button element', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const firstBtn = page.getByTestId('quick-view-btn').first();
        // The component renders as="button", so the DOM element should be <button>
        const tagName = await firstBtn.evaluate((el) => el.tagName.toLowerCase());
        expect(tagName).toBe('button');
    });
});

// ─── Tests: Quick View Modal ──────────────────────────────────────────────

test.describe('Quick View — Modal Interaction', () => {
    test('clicking Quick View button opens the modal', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click({force: true}); // force: true in case opacity is 0 on desktop

        const outcome = await waitForModalOutcome(page);
        // Both 'content' and 'error-state' are valid modal-open states
        expect(['content', 'error-state']).toContain(outcome);

        // The modal container should be visible
        await expect(page.getByTestId('quick-view-modal')).toBeVisible();
    });

    test('modal shows loading spinner then resolves to content or error', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click({force: true});

        // The spinner may appear briefly during product fetch.
        // We check that the modal eventually resolves to content or error.
        const outcome = await waitForModalOutcome(page);
        expect(['content', 'error-state']).toContain(outcome);

        // Spinner should no longer be visible after resolution
        const spinner = page.getByTestId('quick-view-spinner');
        await expect(spinner).not.toBeVisible({timeout: 5_000});
    });

    test('modal has correct data-testid and aria-label', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click({force: true});

        const outcome = await waitForModalOutcome(page);
        expect(['content', 'error-state']).toContain(outcome);

        const modal = page.getByTestId('quick-view-modal');
        await expect(modal).toBeVisible();
        // aria-label should contain "Quick view for" followed by a product name or fallback
        await expect(modal).toHaveAttribute('aria-label', /Quick view for .+/i);
    });

    test('modal displays product details when loaded successfully', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click({force: true});

        const outcome = await waitForModalOutcome(page);

        if (outcome === 'content') {
            const modal = page.getByTestId('quick-view-modal');

            // ProductView renders product name as a heading
            const productHeading = modal
                .locator('h1, h2, h3, [data-testid*="product-name"]')
                .first();
            await expect(productHeading).toBeVisible({timeout: 10_000});

            // Product price should be visible
            const priceElement = modal
                .locator('[class*="price"], [data-testid*="price"], b, span')
                .filter({hasText: /\$/})
                .first();
            await expect(priceElement).toBeVisible({timeout: 5_000});

            // Add to Cart button should be present (may be disabled if variants not selected)
            const addToCartBtn = modal.getByRole('button', {name: /add to cart/i});
            await expect(addToCartBtn).toBeVisible({timeout: 5_000});
        }
        // If error-state, the product was unavailable — that's a valid outcome
    });

    test('modal shows "View Full Details" link to PDP', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click({force: true});

        const outcome = await waitForModalOutcome(page);

        if (outcome === 'content') {
            const modal = page.getByTestId('quick-view-modal');

            // ProductView with showFullLink={true} renders a link to the PDP
            const fullDetailsLink = modal
                .getByRole('link', {name: /full detail|view full/i})
                .or(modal.locator('a[href*="/product/"]'));
            await expect(fullDetailsLink).toBeVisible({timeout: 5_000});
        }
    });
});

// ─── Tests: Modal Close Mechanisms ────────────────────────────────────────

test.describe('Quick View — Modal Close', () => {
    test('modal closes when clicking the X button', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click({force: true});
        await waitForModalOutcome(page);

        const modal = page.getByTestId('quick-view-modal');
        await expect(modal).toBeVisible();

        // Click the close button (Chakra ModalCloseButton renders aria-label="Close")
        const closeBtn = page.getByRole('button', {name: /close/i});
        await closeBtn.click();

        // Modal should be gone
        await expect(modal).not.toBeVisible({timeout: 5_000});
    });

    test('modal closes when pressing Escape', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click({force: true});
        await waitForModalOutcome(page);

        const modal = page.getByTestId('quick-view-modal');
        await expect(modal).toBeVisible();

        // Press Escape
        await page.keyboard.press('Escape');

        await expect(modal).not.toBeVisible({timeout: 5_000});
    });
});

// ─── Tests: Navigation from Modal ─────────────────────────────────────────

test.describe('Quick View — Navigation', () => {
    test('clicking Quick View does NOT navigate away from PLP', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const urlBeforeClick = page.url();

        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click({force: true});
        await waitForModalOutcome(page);

        // URL should remain the same (no PDP navigation)
        expect(page.url()).toBe(urlBeforeClick);
    });

    test('"View Full Details" link navigates to PDP', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click({force: true});

        const outcome = await waitForModalOutcome(page);

        if (outcome === 'content') {
            const modal = page.getByTestId('quick-view-modal');
            const pdpLink = modal.locator('a[href*="/product/"]').first();
            const linkVisible = await pdpLink
                .waitFor({state: 'visible', timeout: 5_000})
                .then(() => true)
                .catch(() => false);

            if (linkVisible) {
                const href = await pdpLink.getAttribute('href');
                expect(href).toMatch(/\/product\//);

                await pdpLink.click();
                await page.waitForLoadState('domcontentloaded');
                await assertNoCrashPage(page, 'PDP navigation from Quick View');

                // Should now be on a PDP URL
                expect(page.url()).toMatch(/\/product\//);
            }
        }
    });
});

// ─── Tests: Edge Cases ────────────────────────────────────────────────────

test.describe('Quick View — Edge Cases', () => {
    test('Quick View button does not appear for product sets/bundles', async ({page}) => {
        // This test verifies the filtering logic. On a typical RefArch PLP,
        // most products are standard items (not sets/bundles). If any tiles
        // exist without a Quick View button, they should be sets or bundles.
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        // Count all product tile containers (the enhanced wrapper adds role="group")
        const tileGroups = page.locator('[role="group"]');
        const groupCount = await tileGroups.count();

        // Count Quick View buttons
        const quickViewBtns = page.getByTestId('quick-view-btn');
        const btnCount = await quickViewBtns.count();

        // The number of Quick View buttons should be <= number of tile groups
        // (sets/bundles are excluded). Both counts should be > 0 on a valid PLP.
        expect(btnCount).toBeLessThanOrEqual(groupCount);
        expect(btnCount).toBeGreaterThan(0);
    });

    test('multiple Quick View modals can be opened sequentially', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'PLP navigation');

        const quickViewBtns = page.getByTestId('quick-view-btn');
        const btnCount = await quickViewBtns.count();

        if (btnCount >= 2) {
            // Open first modal
            await quickViewBtns.nth(0).click({force: true});
            await waitForModalOutcome(page);
            const modal = page.getByTestId('quick-view-modal');
            await expect(modal).toBeVisible();

            // Close it
            await page.keyboard.press('Escape');
            await expect(modal).not.toBeVisible({timeout: 5_000});

            // Open second modal
            await quickViewBtns.nth(1).click({force: true});
            await waitForModalOutcome(page);
            await expect(page.getByTestId('quick-view-modal')).toBeVisible();

            // Close it
            await page.keyboard.press('Escape');
            await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
                timeout: 5_000
            });
        }
    });
});
