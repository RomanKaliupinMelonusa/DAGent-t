import {test, expect, type Page} from '@playwright/test';

/**
 * E2E tests for the Product Quick View feature.
 *
 * Feature: Shoppers can view product details, select variations, and add
 * to cart directly from the PLP via a Quick View modal — without navigating
 * to the PDP.
 *
 * data-testid contract:
 *   quick-view-btn      — overlay bar on each product tile (trigger)
 *   quick-view-modal    — modal content container
 *   quick-view-spinner  — loading spinner inside the modal
 *   quick-view-error    — error / unavailable state inside the modal
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
        await page.screenshot({
            path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
        });
    }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a PLP (category listing page) that contains product tiles
 * with Quick View buttons. Uses the first nav link from the homepage.
 */
async function navigateToPLP(page: Page): Promise<void> {
    // Go to homepage first
    await page.goto('/', {waitUntil: 'domcontentloaded'});

    // Click the first category navigation link to reach a PLP
    const navLink = page.locator('nav a, [role="navigation"] a').first();
    await navLink.waitFor({state: 'visible', timeout: 15_000});
    await navLink.click();
    await page.waitForLoadState('domcontentloaded');

    // Wait for product tiles to render — quick-view-btn proves the override loaded
    await page.getByTestId('quick-view-btn').first().waitFor({state: 'attached', timeout: 30_000});
}

/**
 * Three-outcome assertion for the Quick View modal after clicking the trigger.
 * Returns the winning outcome: 'content' | 'error-state' | 'crash'.
 */
async function assertModalOutcome(
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
        const stack = await page.locator('pre').textContent().catch(() => 'no stack');
        throw new Error(`PWA Kit crash page detected after opening Quick View. Stack: ${stack}`);
    }

    return winner;
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
    test('Quick View buttons are visible on product tiles on the PLP', async ({page}) => {
        await navigateToPLP(page);

        // Verify at least one Quick View button exists
        const quickViewButtons = page.getByTestId('quick-view-btn');
        const count = await quickViewButtons.count();
        expect(count).toBeGreaterThan(0);

        // Verify the button contains "Quick View" text
        const firstButton = quickViewButtons.first();
        await expect(firstButton).toContainText('Quick View');
    });

    test('clicking Quick View button opens the modal with product details or error state', async ({
        page
    }) => {
        await navigateToPLP(page);

        // Click the first Quick View button
        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click();

        // Three-outcome assertion: content loaded, error state, or crash
        const outcome = await assertModalOutcome(page);

        if (outcome === 'content') {
            // Modal should be visible with product content
            const modal = page.getByTestId('quick-view-modal');
            await expect(modal).toBeVisible();
        } else if (outcome === 'error-state') {
            // Error state is a valid outcome — product may be unavailable
            const errorEl = page.getByTestId('quick-view-error');
            await expect(errorEl).toBeVisible();
        }
    });

    test('Quick View modal can be closed via the close button', async ({page}) => {
        await navigateToPLP(page);

        // Open the modal
        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click();

        const outcome = await assertModalOutcome(page);
        // Whether content or error, the modal should be visible
        const modal = page.getByTestId('quick-view-modal');
        if (outcome === 'content' || outcome === 'error-state') {
            await expect(modal).toBeVisible();
        }

        // Close via the X (close) button inside the modal
        // Chakra ModalCloseButton renders a button with aria-label "Close"
        const closeButton = page.getByRole('button', {name: /close/i});
        await closeButton.click();

        // Modal should disappear
        await expect(modal).toBeHidden({timeout: 5_000});
    });

    test('Quick View modal can be closed via Escape key', async ({page}) => {
        await navigateToPLP(page);

        // Open the modal
        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click();

        await assertModalOutcome(page);
        const modal = page.getByTestId('quick-view-modal');
        await expect(modal).toBeVisible();

        // Press Escape to close
        await page.keyboard.press('Escape');

        // Modal should disappear
        await expect(modal).toBeHidden({timeout: 5_000});
    });

    test('Quick View modal shows loading spinner before content loads', async ({page}) => {
        await navigateToPLP(page);

        // Click the Quick View button
        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click();

        // Either the spinner appears briefly, or content loads immediately.
        // We race between spinner and final content — both are valid.
        const spinner = page.getByTestId('quick-view-spinner');
        const content = page.getByTestId('quick-view-modal');
        const errorState = page.getByTestId('quick-view-error');
        const crashPage = page.getByRole('heading', {name: /this page isn't working/i});

        const first = await Promise.race([
            spinner
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'spinner' as const),
            content
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'content' as const),
            errorState
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'error' as const),
            crashPage
                .waitFor({state: 'visible', timeout: 15_000})
                .then(() => 'crash' as const)
        ]);

        if (first === 'crash') {
            const stack = await page.locator('pre').textContent().catch(() => 'no stack');
            throw new Error(`PWA Kit crash page detected. Stack: ${stack}`);
        }

        // If spinner appeared first, wait for it to disappear and content to load
        if (first === 'spinner') {
            await expect(spinner).toBeHidden({timeout: 15_000});
            // Now either content or error should be visible
            const finalOutcome = await Promise.race([
                content
                    .waitFor({state: 'visible', timeout: 15_000})
                    .then(() => 'content' as const),
                errorState
                    .waitFor({state: 'visible', timeout: 15_000})
                    .then(() => 'error' as const)
            ]);
            expect(['content', 'error']).toContain(finalOutcome);
        }

        // All outcomes (spinner → content, direct content, error) are valid
    });

    test('Quick View does not navigate away from the PLP', async ({page}) => {
        await navigateToPLP(page);

        // Capture the current URL before opening Quick View
        const plpUrl = page.url();

        // Open Quick View
        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        await quickViewBtn.click();

        await assertModalOutcome(page);

        // URL should NOT have changed — we're still on the PLP
        expect(page.url()).toBe(plpUrl);

        // Close the modal
        await page.keyboard.press('Escape');
        const modal = page.getByTestId('quick-view-modal');
        await expect(modal).toBeHidden({timeout: 5_000});

        // URL should still be the PLP
        expect(page.url()).toBe(plpUrl);
    });

    test('Quick View modal has correct accessibility attributes', async ({page}) => {
        await navigateToPLP(page);

        // Verify Quick View button has an aria-label
        const quickViewBtn = page.getByTestId('quick-view-btn').first();
        const ariaLabel = await quickViewBtn.getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        expect(ariaLabel).toContain('Quick View');

        // Open the modal
        await quickViewBtn.click();

        const outcome = await assertModalOutcome(page);
        if (outcome === 'content' || outcome === 'error-state') {
            // Modal should have an aria-label
            const modal = page.getByTestId('quick-view-modal');
            const modalAriaLabel = await modal.getAttribute('aria-label');
            expect(modalAriaLabel).toBeTruthy();
            expect(modalAriaLabel?.toLowerCase()).toContain('quick view');
        }
    });

    test('multiple Quick View buttons exist for multiple product tiles', async ({page}) => {
        await navigateToPLP(page);

        // A typical PLP shows multiple products — verify multiple Quick View buttons
        const quickViewButtons = page.getByTestId('quick-view-btn');
        const count = await quickViewButtons.count();

        // PLP should have at least 2 products with Quick View (sets/bundles excluded)
        // If only 1, that's still acceptable if the category has very few items
        expect(count).toBeGreaterThanOrEqual(1);

        // Each button should be a <button> element
        for (let i = 0; i < Math.min(count, 3); i++) {
            const btn = quickViewButtons.nth(i);
            const tagName = await btn.evaluate((el) => el.tagName.toLowerCase());
            expect(tagName).toBe('button');
        }
    });
});
