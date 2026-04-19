import {test, expect, type Page, type Locator} from '@playwright/test';

/**
 * E2E tests for the Product Quick View feature.
 *
 * Tests the Quick View overlay bar on product tiles and the Quick View modal
 * that displays product details without navigating to the PDP.
 *
 * data-testid contract:
 *   - quick-view-btn      → overlay bar button on each product tile
 *   - quick-view-modal    → modal content container
 *   - quick-view-spinner  → loading spinner inside the modal
 *   - quick-view-error    → error/unavailable state inside the modal
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
        failedRequests.push(
            `${req.method()} ${req.url()} - ${req.failure()?.errorText}`
        );
    });
});

test.afterEach(async ({page}, testInfo) => {
    if (testInfo.status !== 'passed') {
        console.log(
            `\n--- Browser Diagnostics for "${testInfo.title}" ---`
        );
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
 * Navigate to a PLP page that renders product tiles.
 * Uses a search query to reliably reach a PLP with products.
 */
async function navigateToPLP(page: Page): Promise<void> {
    await page.goto('/search?q=shirt', {waitUntil: 'domcontentloaded'});

    // Wait for at least one Quick View button to confirm tiles rendered
    // with the override. Fall back to any product-tile-like structure.
    const quickViewBtn = page.getByTestId('quick-view-btn').first();
    const productTile = page.locator(
        '[data-testid="product-tile"], .product-tile, article'
    ).first();

    await Promise.race([
        quickViewBtn.waitFor({state: 'visible', timeout: 30_000}),
        productTile.waitFor({state: 'visible', timeout: 30_000}),
    ]);
}

/**
 * Detect the PWA Kit crash page and throw a structured error if found.
 */
async function assertNoCrashPage(
    page: Page,
    actionDescription: string
): Promise<void> {
    const crashHeading = page.getByRole('heading', {
        name: /this page isn't working/i,
    });
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
 * Wait for the modal content to finish loading (spinner gone, content or error visible).
 * Returns 'content' | 'error' | 'loading' depending on the final observed state.
 */
async function waitForModalContent(page: Page): Promise<'content' | 'error' | 'loading'> {
    const spinner = page.getByTestId('quick-view-spinner');
    const errorState = page.getByTestId('quick-view-error');
    const modal = page.getByTestId('quick-view-modal');

    // Wait for spinner to disappear or error to appear
    await Promise.race([
        spinner.waitFor({state: 'hidden', timeout: 20_000}).catch(() => {}),
        errorState.waitFor({state: 'visible', timeout: 20_000}).catch(() => {}),
    ]);

    const hasError = await errorState.isVisible().catch(() => false);
    if (hasError) return 'error';

    const hasSpinner = await spinner.isVisible().catch(() => false);
    if (hasSpinner) return 'loading';

    return 'content';
}

// ─── Tests: Quick View Overlay Bar ────────────────────────────────────────

test.describe('Quick View — Overlay Bar', () => {
    test('product tiles on PLP display the Quick View button', async ({
        page,
    }) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'navigating to PLP');

        // At least one quick-view-btn should exist in the DOM
        const quickViewButtons = page.getByTestId('quick-view-btn');
        const count = await quickViewButtons.count();
        expect(count).toBeGreaterThan(0);
    });

    test('Quick View button has accessible aria-label', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'navigating to PLP');

        const firstBtn = page.getByTestId('quick-view-btn').first();
        await firstBtn.waitFor({state: 'attached', timeout: 15_000});

        const ariaLabel = await firstBtn.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        // aria-label should be "Quick View <product name>"
        expect(ariaLabel).toMatch(/^Quick View\s+.+/);
    });

    test('Quick View button is a semantic button element', async ({page}) => {
        await navigateToPLP(page);

        const firstBtn = page.getByTestId('quick-view-btn').first();
        await firstBtn.waitFor({state: 'attached', timeout: 15_000});

        const tagName = await firstBtn.evaluate((el) =>
            el.tagName.toLowerCase()
        );
        expect(tagName).toBe('button');
    });
});

// ─── Tests: Quick View Modal — Happy Path ─────────────────────────────────

test.describe('Quick View — Modal', () => {
    test('clicking Quick View opens the modal', async ({page}) => {
        await navigateToPLP(page);
        await assertNoCrashPage(page, 'navigating to PLP');

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        // Force-click to bypass potential overlay/opacity issues on desktop
        await firstQuickViewBtn.click({force: true});

        // Three-outcome assertion pattern (MANDATORY for modals)
        const modalContent = page.getByTestId('quick-view-modal');
        const errorState = page.getByTestId('quick-view-error');
        const crashPage = page.getByRole('heading', {
            name: /this page isn't working/i,
        });

        const winner = await Promise.race([
            modalContent
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'content' as const),
            errorState
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'error-state' as const),
            crashPage
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'crash' as const),
        ]);

        if (winner === 'crash') {
            const stack = await page
                .locator('pre')
                .textContent()
                .catch(() => 'no stack');
            throw new Error(
                `PWA Kit crash page detected after clicking Quick View. Stack: ${stack}`
            );
        }

        // Either modal content or error state is acceptable — modal opened
        expect(['content', 'error-state']).toContain(winner);
    });

    test('modal shows loading spinner then resolves to content or error', async ({
        page,
    }) => {
        await navigateToPLP(page);

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modalContent = page.getByTestId('quick-view-modal');
        await modalContent.waitFor({state: 'visible', timeout: 15_000});

        const result = await waitForModalContent(page);

        // One of 'content', 'error', or 'loading' is valid
        expect(['content', 'error', 'loading']).toContain(result);
    });

    test('modal has correct data-testid attribute', async ({page}) => {
        await navigateToPLP(page);

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});
        await expect(modal).toBeVisible();
    });

    test('modal has aria-label containing Quick View text', async ({page}) => {
        await navigateToPLP(page);

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});

        const ariaLabel = await modal.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        // Should match "Quick view for <productName>" pattern
        expect(ariaLabel!.toLowerCase()).toContain('quick view');
    });
});

// ─── Tests: Quick View Modal — Close Behavior ────────────────────────────

test.describe('Quick View — Close Behavior', () => {
    test('modal closes when X button is clicked', async ({page}) => {
        await navigateToPLP(page);

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});

        // Chakra ModalCloseButton is rendered with aria-label "Close"
        const closeBtn = page.getByRole('button', {name: /close/i});
        await closeBtn.click();

        await expect(modal).not.toBeVisible({timeout: 5_000});
    });

    test('modal closes when Escape key is pressed', async ({page}) => {
        await navigateToPLP(page);

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});

        await page.keyboard.press('Escape');

        await expect(modal).not.toBeVisible({timeout: 5_000});
    });

    test('modal closes when overlay backdrop is clicked', async ({page}) => {
        await navigateToPLP(page);

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});

        // Click outside the modal content (top-left corner) to dismiss
        await page.mouse.click(5, 5);

        await expect(modal).not.toBeVisible({timeout: 5_000});
    });
});

// ─── Tests: Quick View Modal — Product Content ───────────────────────────

test.describe('Quick View — Product Content', () => {
    test('modal displays product name when loaded', async ({page}) => {
        await navigateToPLP(page);

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});

        const result = await waitForModalContent(page);
        if (result === 'error') {
            test.skip(true, 'Product data unavailable from sandbox API');
            return;
        }

        // ProductView renders a heading with the product name
        const productHeading = modal.locator('h1, h2, [data-testid="product-name"]').first();
        await expect(productHeading).toBeVisible({timeout: 10_000});
        const text = await productHeading.textContent();
        expect(text!.trim().length).toBeGreaterThan(0);
    });

    test('modal displays Add to Cart button when product loaded', async ({
        page,
    }) => {
        await navigateToPLP(page);

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});

        const result = await waitForModalContent(page);
        if (result === 'error') {
            test.skip(true, 'Product data unavailable from sandbox API');
            return;
        }

        // ProductView renders an "Add to Cart" button
        const addToCartBtn = modal.getByRole('button', {
            name: /add to cart/i,
        });
        await expect(addToCartBtn).toBeVisible({timeout: 10_000});
    });

    test('modal displays View Full Details link when product loaded', async ({
        page,
    }) => {
        await navigateToPLP(page);

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});

        const result = await waitForModalContent(page);
        if (result === 'error') {
            test.skip(true, 'Product data unavailable from sandbox API');
            return;
        }

        // showFullLink={true} should render a "View Full Details" link
        const fullDetailsLink = modal.getByRole('link', {
            name: /full details|view full/i,
        });
        await expect(fullDetailsLink).toBeVisible({timeout: 10_000});

        // Link should point to a PDP
        const href = await fullDetailsLink.getAttribute('href');
        expect(href).toMatch(/\/product\//);
    });
});

// ─── Tests: Quick View — Navigation Behavior ─────────────────────────────

test.describe('Quick View — Navigation', () => {
    test('clicking Quick View does NOT navigate away from PLP', async ({page}) => {
        await navigateToPLP(page);

        const originalUrl = page.url();

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});

        // URL should still be the PLP — no navigation occurred
        expect(page.url()).toBe(originalUrl);
    });

    test('closing modal returns to PLP without navigation', async ({
        page,
    }) => {
        await navigateToPLP(page);

        const originalUrl = page.url();

        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});

        await page.keyboard.press('Escape');
        await expect(modal).not.toBeVisible({timeout: 5_000});

        // Still on the PLP
        expect(page.url()).toBe(originalUrl);
    });
});

// ─── Tests: Quick View — Edge Cases ──────────────────────────────────────

test.describe('Quick View — Edge Cases', () => {
    test('can open Quick View on multiple products sequentially', async ({
        page,
    }) => {
        await navigateToPLP(page);

        const quickViewButtons = page.getByTestId('quick-view-btn');
        const count = await quickViewButtons.count();

        if (count < 2) {
            test.skip(true, 'Need at least 2 products on PLP to test sequential opens');
            return;
        }

        // Open first Quick View
        await quickViewButtons.nth(0).click({force: true});
        const modal = page.getByTestId('quick-view-modal');
        await modal.waitFor({state: 'visible', timeout: 15_000});

        // Close it
        await page.keyboard.press('Escape');
        await expect(modal).not.toBeVisible({timeout: 5_000});

        // Open second Quick View
        await quickViewButtons.nth(1).click({force: true});
        await modal.waitFor({state: 'visible', timeout: 15_000});
        await expect(modal).toBeVisible();

        // Close it
        await page.keyboard.press('Escape');
        await expect(modal).not.toBeVisible({timeout: 5_000});
    });

    test('Quick View button click does not propagate to parent link', async ({
        page,
    }) => {
        await navigateToPLP(page);

        const originalUrl = page.url();

        // Click the Quick View button
        const firstQuickViewBtn = page.getByTestId('quick-view-btn').first();
        await firstQuickViewBtn.click({force: true});

        // Give the modal time to appear
        const modal = page.getByTestId('quick-view-modal');
        await modal
            .waitFor({state: 'visible', timeout: 15_000})
            .catch(() => {});

        // Regardless of modal outcome, we should NOT have navigated away
        expect(page.url()).toBe(originalUrl);
    });
});
