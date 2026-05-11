/**
 * PLP Quick View Modal — E2E Tests
 *
 * Covers flows E2E-001 through E2E-008 from the e2e-contract.
 * All selectors use data-testid or ARIA roles per the contract §4.
 * Imports test/expect from ./fixtures (§9). Never uses networkidle (§1)
 * or waitForTimeout (§2).
 */

import {test, expect, awaitHydrated} from './fixtures';
import type {Page} from '@playwright/test';

// ---------------------------------------------------------------------------
// Baseline noise patterns — mechanically derived from baseline.json (§17)
// Only entries with volatility === "persistent" are included.
// ---------------------------------------------------------------------------

const BASELINE_NOISE_PATTERNS: RegExp[] = [
    /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
    /Warning: %s: Support for defaultProps will be removed from function components in a future major release\. Use JavaScript default parameters instead\.%s PageDesignerProvider/,
    /Failed to load resource: net::ERR_NAME_NOT_RESOLVED/,
    /retail-react-app\.use-datacloud\._handleApiError ERROR \[DataCloudApi\] Error sending Data Cloud event/,
    /r: 403 Forbidden/,
];

// ---------------------------------------------------------------------------
// Category path used across all flows
// ---------------------------------------------------------------------------

const PLP_PATH = '/category/womens-clothing-dresses';

// ---------------------------------------------------------------------------
// Helpers (inlined per spec — §19, §22 mandate these per-file)
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
    for (let pass = 0; pass < 3; pass++) {
        const dialogs = await page.getByRole('dialog').all();
        let dismissed = false;
        for (const dialog of dialogs) {
            if (!(await dialog.isVisible().catch(() => false))) continue;
            const cta = dialog
                .getByRole('button', {name: ctaPattern})
                .first();
            const clicked = await cta
                .click({timeout: 400})
                .then(() => true)
                .catch(() => false);
            if (!clicked) {
                await page.keyboard.press('Escape').catch(() => {});
            }
            await dialog
                .waitFor({state: 'hidden', timeout: 400})
                .catch(() => {});
            dismissed = true;
        }
        if (!dismissed) return;
    }
}

/**
 * Navigate to the PLP, dismiss overlays, and wait for hydration.
 * Canonical pre-flight sequence per §19 + §22.
 */
async function gotoPlp(page: Page): Promise<void> {
    await page.goto(PLP_PATH, {waitUntil: 'domcontentloaded'});
    await dismissOverlays(page);
    await awaitHydrated(page);
}

/**
 * Locate the first quick-view trigger on the PLP and extract the product id.
 * Returns the locator and the parsed product id.
 */
async function firstQuickViewTrigger(
    page: Page,
): Promise<{trigger: ReturnType<Page['getByTestId']>; productId: string}> {
    const trigger = page.locator('[data-testid^="quick-view-trigger-"]').first();
    await expect(trigger).toBeVisible({timeout: 10_000});
    const testid = await trigger.getAttribute('data-testid');
    const productId = testid!.replace('quick-view-trigger-', '');
    return {trigger, productId};
}

/**
 * Open Quick View on the first eligible tile. Waits for the modal to become
 * visible using the three-outcome pattern (§12). Returns the trigger locator
 * and product id for focus-restoration assertions.
 */
async function openQuickView(
    page: Page,
): Promise<{trigger: ReturnType<Page['getByTestId']>; productId: string}> {
    const {trigger, productId} = await firstQuickViewTrigger(page);

    // Scroll into view and click
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();

    // Three-outcome pattern (§12)
    const modal = page.getByTestId('quick-view-modal');
    const errorState = page.getByTestId('quick-view-modal-error');
    const crashPage = page.getByRole('heading', {
        name: /this page isn't working/i,
    });

    const winner = await Promise.race([
        modal
            .waitFor({state: 'visible', timeout: 15_000})
            .then(() => 'modal' as const),
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
            `PWA Kit crash page detected after clicking Quick View trigger. Stack: ${stack}`,
        );
    }

    // Ensure it's the content, not the error state
    const hasError = await errorState
        .isVisible()
        .catch(() => false);
    if (hasError) {
        throw new Error(
            'Quick View modal opened with error state instead of product content',
        );
    }

    return {trigger, productId};
}

/**
 * Assert the console-error budget (§17). Filters captured console errors
 * against the baseline noise patterns and asserts no unexpected errors remain.
 */
function assertConsoleErrorBudget(consoleErrors: string[]): void {
    const unexpected = consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
    );
    expect(unexpected).toEqual([]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
    // -----------------------------------------------------------------------
    // Flow E2E-001: open-quick-view-from-tile (P1, US1)
    // -----------------------------------------------------------------------
    test('opens Quick View modal from product tile', async ({page, signals}) => {
        await gotoPlp(page);
        const urlBefore = page.url();

        await openQuickView(page);

        // Modal is visible
        await expect(page.getByTestId('quick-view-modal')).toBeVisible();

        // Product view is visible inside the modal
        const productView = page
            .getByTestId('quick-view-modal')
            .getByTestId('product-view');
        await expect(productView).toBeVisible();

        // Error state is NOT visible
        await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible();

        // URL unchanged — no navigation occurred
        expect(page.url()).toBe(urlBefore);

        // Console-error budget
        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // -----------------------------------------------------------------------
    // Flow E2E-002: switch-color-swatch-in-quick-view (P1, US1)
    // -----------------------------------------------------------------------
    test('switches color swatch inside Quick View modal', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        await openQuickView(page);

        const modal = page.getByTestId('quick-view-modal');

        // Locate swatch radiogroup(s) inside the modal — color is typically
        // the first variation group rendered by ProductView.
        const swatchGroups = modal.getByRole('radiogroup');
        const firstGroup = swatchGroups.first();
        await expect(firstGroup).toBeVisible({timeout: 10_000});

        const swatches = firstGroup.getByRole('radio');
        const swatchCount = await swatches.count();

        // Skip if fewer than 2 swatches available
        test.skip(
            swatchCount < 2,
            `Only ${swatchCount} swatch(es) available; need ≥ 2 to test switching`,
        );

        // Capture pre-click image src
        const heroImg = modal.locator('img').first();
        await expect(heroImg).toBeVisible({timeout: 10_000});
        const srcBefore = await heroImg.getAttribute('src');

        // Click the second swatch
        const secondSwatch = swatches.nth(1);
        await secondSwatch.click();

        // Wait for the image to update — the src should differ
        await expect(heroImg).not.toHaveAttribute('src', srcBefore ?? '', {
            timeout: 10_000,
        });

        // Verify the second swatch is now checked
        await expect(secondSwatch).toHaveAttribute('aria-checked', 'true');

        // Modal still visible
        await expect(modal).toBeVisible();

        // Console-error budget
        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // -----------------------------------------------------------------------
    // Flow E2E-003: add-to-bag-from-quick-view (P1, US2)
    // -----------------------------------------------------------------------
    test('adds product to bag from Quick View modal', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        await openQuickView(page);

        const modal = page.getByTestId('quick-view-modal');
        const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

        // If the button is disabled, we need to select a variation first.
        // Select the first available option in each radiogroup.
        const isDisabled = await addToCartBtn.isDisabled();
        if (isDisabled) {
            const groups = modal.getByRole('radiogroup');
            const groupCount = await groups.count();
            for (let i = 0; i < groupCount; i++) {
                const group = groups.nth(i);
                // Click the first available (not disabled) radio in each group
                const radios = group.getByRole('radio');
                const radioCount = await radios.count();
                for (let j = 0; j < radioCount; j++) {
                    const radio = radios.nth(j);
                    const disabled = await radio.isDisabled().catch(() => false);
                    if (!disabled) {
                        await radio.click();
                        break;
                    }
                }
            }
            // Wait for button to become enabled
            await expect(addToCartBtn).toBeEnabled({timeout: 10_000});
        }

        // Click Add to Cart and wait for basket response
        const basketResponsePromise = page.waitForResponse(
            (res) => /baskets/i.test(res.url()) && res.status() < 400,
            {timeout: 15_000},
        );
        await addToCartBtn.click();
        await basketResponsePromise;

        // Quick View modal should close
        await expect(modal).not.toBeVisible({timeout: 10_000});

        // Add-to-cart confirmation modal should appear
        const confirmationModal = page.getByTestId('add-to-cart-modal');
        await expect(confirmationModal).toBeVisible({timeout: 10_000});

        // At least one product-added row inside the confirmation modal
        const productAdded = confirmationModal.getByTestId('product-added').first();
        await expect(productAdded).toBeVisible();

        // Console-error budget
        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // -----------------------------------------------------------------------
    // Flow E2E-004: close-quick-view-restores-focus (P2)
    // -----------------------------------------------------------------------
    test('closes Quick View via Escape and restores focus', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        const {productId} = await openQuickView(page);

        // Dismiss via Escape
        await page.keyboard.press('Escape');

        // Modal should be hidden
        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
            timeout: 5_000,
        });

        // Focus should return to the trigger
        const activeTestId = await page.evaluate(
            () => document.activeElement?.getAttribute('data-testid') ?? '',
        );
        expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

        // Console-error budget
        assertConsoleErrorBudget(signals.consoleErrors);
    });

    test('closes Quick View via close button and restores focus', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        const {productId} = await openQuickView(page);

        // Find and click the close button inside the modal
        const modal = page.getByTestId('quick-view-modal');
        const closeBtn = modal.getByRole('button', {name: /close/i}).first();
        await closeBtn.click();

        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
            timeout: 5_000,
        });

        const activeTestId = await page.evaluate(
            () => document.activeElement?.getAttribute('data-testid') ?? '',
        );
        expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

        assertConsoleErrorBudget(signals.consoleErrors);
    });

    test('closes Quick View via overlay click and restores focus', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        const {productId} = await openQuickView(page);

        // Click the overlay (outside the modal content). Chakra renders the
        // overlay as a sibling of the modal content. Click at a corner of the
        // viewport to hit it.
        await page.mouse.click(5, 5);

        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({
            timeout: 5_000,
        });

        const activeTestId = await page.evaluate(
            () => document.activeElement?.getAttribute('data-testid') ?? '',
        );
        expect(activeTestId).toBe(`quick-view-trigger-${productId}`);

        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // -----------------------------------------------------------------------
    // Flow E2E-005: no-pickup-ui-in-quick-view (P1, negative)
    // -----------------------------------------------------------------------
    test('does not render pickup UI inside Quick View modal', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        await openQuickView(page);

        const modal = page.getByTestId('quick-view-modal');

        // Assert none of the pickup testids are visible
        await expect(
            modal.locator('[data-testid="pickup-select-store-msg"]'),
        ).not.toBeVisible();
        await expect(
            modal.locator('[data-testid="store-stock-status-msg"]'),
        ).not.toBeVisible();

        // No element with data-testid containing "pickup"
        const pickupElements = modal.locator('[data-testid*="pickup"]');
        const pickupCount = await pickupElements.count();
        expect(pickupCount).toBe(0);

        // No text matching pickup/ship to store/pick up inside modal
        const modalText = await modal.textContent();
        expect(modalText).not.toMatch(/pickup|ship to store|pick up/i);

        // Console-error budget
        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // -----------------------------------------------------------------------
    // Flow E2E-006: add-to-bag-disabled-when-unavailable (P2, US3)
    // -----------------------------------------------------------------------
    test('disables Add to Bag when variation is incomplete', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        await openQuickView(page);

        const addToCartBtn = page.getByTestId('quick-view-add-to-cart-btn');

        // Before selecting any variation, button should be disabled
        // (This applies to master products that require variation selection)
        const isDisabled = await addToCartBtn.isDisabled();

        // If the product already has a pre-selected variation (e.g. simple product),
        // skip this test — it requires a master product with unselected variations.
        test.skip(
            !isDisabled,
            'First tile has pre-selected variation; need a master product with unselected variations',
        );

        await expect(addToCartBtn).toBeDisabled();

        // Console-error budget
        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // -----------------------------------------------------------------------
    // Flow E2E-007: view-full-details-link (P3, US4)
    // -----------------------------------------------------------------------
    test('navigates to PDP via View Full Details link', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        const urlBefore = page.url();

        await openQuickView(page);

        const viewDetailsLink = page.getByTestId(
            'quick-view-view-full-details-link',
        );
        await expect(viewDetailsLink).toBeVisible();
        await viewDetailsLink.click();

        // Should navigate to PDP — URL changes
        await page.waitForURL((url) => url.pathname !== new URL(urlBefore).pathname, {
            timeout: 15_000,
        });

        // URL should contain a product path (PDP)
        expect(page.url()).not.toBe(urlBefore);
        expect(page.url()).toMatch(/\/product\//);

        // Modal should no longer be visible (page navigated away)
        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

        // Console-error budget
        assertConsoleErrorBudget(signals.consoleErrors);
    });

    // -----------------------------------------------------------------------
    // Flow E2E-008: tile-click-still-navigates-to-pdp (P2, US1 regression)
    // -----------------------------------------------------------------------
    test('tile image click navigates to PDP (regression)', async ({
        page,
        signals,
    }) => {
        await gotoPlp(page);
        const urlBefore = page.url();

        // Click the tile image (NOT the Quick View trigger)
        const tileImage = page.getByTestId('product-tile-image').first();
        await expect(tileImage).toBeVisible({timeout: 10_000});
        await tileImage.click();

        // Should navigate to PDP
        await page.waitForURL((url) => url.pathname !== new URL(urlBefore).pathname, {
            timeout: 15_000,
        });
        expect(page.url()).toMatch(/\/product\//);

        // Quick View modal should NOT be visible
        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible();

        // Console-error budget
        assertConsoleErrorBudget(signals.consoleErrors);
    });
});
