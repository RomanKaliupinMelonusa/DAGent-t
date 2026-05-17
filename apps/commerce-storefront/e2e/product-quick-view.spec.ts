/**
 * product-quick-view.spec.ts — E2E tests for the PLP Quick View modal.
 *
 * Contract: contracts/e2e-tests.md
 * Flows: E2E-001 through E2E-008
 *
 * Import `test` / `expect` from the shared fixtures — NEVER from
 * `@playwright/test` directly.
 */

import {test, expect, awaitHydrated} from './fixtures'
import {dismissOverlays, assertNoCrashPage} from './helpers'
import type {Page, Locator} from '@playwright/test'

// ---------------------------------------------------------------------------
// Baseline noise patterns — derived from baseline JSON (persistent entries)
// ---------------------------------------------------------------------------

const BASELINE_NOISE_PATTERNS: RegExp[] = [
    /Warning: The result of getServerSnapshot should be cached to avoid an infinite loop/,
    /Warning:.*Support for defaultProps will be removed from function components.*PageDesignerProvider/,
    /TypeError: Failed to fetch at vendor\.js/,
    /Failed to fetch/,
    // SLAS / Shopper auth 403s are expected local-dev noise
    /\/oauth2\/authorize/,
    /\/callback/,
    /\/__mrt\/hmr/,
    // Network resource failures (DNS, images, external services)
    /Failed to load resource/,
    /net::ERR_NAME_NOT_RESOLVED/,
    // DataCloud API errors — external service not available in local dev
    /DataCloudApi/,
    /use-datacloud/,
    // Generic 403 errors from vendor bundle (auth-related)
    /403 Forbidden/,
    // 400 Bad Request errors from basket API (can occur when variant is not fully selected)
    /400 Bad Request/,
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLP_PATH = '/category/womens-clothing-dresses'

/** Navigate to PLP, await hydration, dismiss overlays. */
async function gotoPlp(page: Page): Promise<void> {
    await page.goto(PLP_PATH, {waitUntil: 'domcontentloaded'})
    await awaitHydrated(page)
    await dismissOverlays(page)
}

/** Returns the first Quick View trigger locator and its product ID. */
async function firstQuickViewTrigger(
    page: Page,
): Promise<{trigger: Locator; productId: string}> {
    const trigger = page.locator('[data-testid^="quick-view-trigger-"]').first()
    await expect(trigger).toBeVisible({timeout: 15_000})
    const testid = await trigger.getAttribute('data-testid')
    const productId = testid!.replace('quick-view-trigger-', '')
    return {trigger, productId}
}

/** Click the first Quick View trigger and wait for the modal. */
async function openQuickView(
    page: Page,
): Promise<{trigger: Locator; productId: string}> {
    const {trigger, productId} = await firstQuickViewTrigger(page)
    await trigger.click()
    await assertNoCrashPage(page, 'open Quick View')
    await expect(page.getByTestId('quick-view-modal')).toBeVisible({timeout: 15_000})
    return {trigger, productId}
}

/** Collect console errors for budget assertion. */
function collectConsoleErrors(page: Page): string[] {
    const errors: string[] = []
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            errors.push(msg.text())
        }
    })
    return errors
}

/** Assert console error budget — no novel errors beyond baseline. */
function assertConsoleErrorBudget(consoleErrors: string[]): void {
    const novel = consoleErrors.filter(
        (e) => !BASELINE_NOISE_PATTERNS.some((re) => re.test(e)),
    )
    expect(novel).toEqual([])
}

// ---------------------------------------------------------------------------
// Cold-start warm-up
// ---------------------------------------------------------------------------

test.describe('PLP Quick View Modal', () => {
    test.beforeAll(async ({browser}) => {
        // Throwaway navigation to absorb cold-start latency
        const page = await browser.newPage()
        await page.goto(PLP_PATH, {waitUntil: 'domcontentloaded'})
        await page.locator('[data-testid^="quick-view-trigger-"]').first().waitFor({state: 'visible', timeout: 30_000}).catch(() => {})
        await page.close()
    })

    // -----------------------------------------------------------------------
    // Flow E2E-001: open-quick-view-from-tile (P1, US1)
    // -----------------------------------------------------------------------
    test('E2E-001: open-quick-view-from-tile', async ({page}) => {
        const consoleErrors = collectConsoleErrors(page)
        await gotoPlp(page)
        const urlBefore = page.url()

        await openQuickView(page)

        // Modal is visible with product-view inside
        await expect(page.getByTestId('quick-view-modal')).toBeVisible()
        await expect(
            page.getByTestId('quick-view-modal').getByTestId('product-view'),
        ).toBeVisible({timeout: 15_000})

        // Error fallback is NOT visible
        await expect(page.getByTestId('quick-view-modal-error')).not.toBeVisible()

        // URL unchanged — no navigation
        expect(page.url()).toBe(urlBefore)

        assertConsoleErrorBudget(consoleErrors)
    })

    // -----------------------------------------------------------------------
    // Flow E2E-002: switch-color-swatch-in-quick-view (P1, US1)
    // -----------------------------------------------------------------------
    test('E2E-002: switch-color-swatch-in-quick-view', async ({page}) => {
        const consoleErrors = collectConsoleErrors(page)
        await gotoPlp(page)
        await openQuickView(page)

        // Wait for product-view to load inside modal
        const modal = page.getByTestId('quick-view-modal')
        await expect(modal.getByTestId('product-view')).toBeVisible({timeout: 15_000})

        // Locate color swatch group — typically a fieldset with label containing "color"
        // or radio buttons within a swatch group labeled "color"
        const colorSwatches = modal.locator(
            '[data-testid="product-view"] fieldset:has(legend:text-matches("color", "i")) input[type="radio"], ' +
            '[data-testid="product-view"] [role="radiogroup"]:has(label:text-matches("color", "i")) input[type="radio"], ' +
            '[data-testid="product-view"] [role="radiogroup"]:has([aria-label*="color" i]) input[type="radio"], ' +
            '[data-testid="product-view"] button[aria-label*="color" i]',
        )

        const count = await colorSwatches.count()
        test.skip(count < 2, 'Product has fewer than 2 color swatches — skipping')

        // Capture pre-click image src
        const galleryImg = modal.locator('[data-testid="product-view"] img').first()
        const srcBefore = await galleryImg.getAttribute('src')

        // Click the second color swatch
        await colorSwatches.nth(1).click()
        await assertNoCrashPage(page, 'switch color swatch')

        // Wait for image to update (src should differ)
        await expect(async () => {
            const srcAfter = await galleryImg.getAttribute('src')
            expect(srcAfter).not.toBe(srcBefore)
        }).toPass({timeout: 10_000})

        // Modal remains visible
        await expect(modal).toBeVisible()

        assertConsoleErrorBudget(consoleErrors)
    })

    // -----------------------------------------------------------------------
    // Flow E2E-003: add-to-bag-from-quick-view (P1, US2)
    // -----------------------------------------------------------------------
    test('E2E-003: add-to-bag-from-quick-view', async ({page}) => {
        const consoleErrors = collectConsoleErrors(page)
        const basketErrors: string[] = []

        // Track basket-related responses for error assertion
        page.on('response', (res) => {
            if (/baskets/i.test(res.url()) && res.status() >= 400) {
                basketErrors.push(`${res.request().method()} ${res.url()} -> ${res.status()}`)
            }
        })

        await gotoPlp(page)
        await openQuickView(page)

        const modal = page.getByTestId('quick-view-modal')
        await expect(modal.getByTestId('product-view')).toBeVisible({timeout: 15_000})

        // Select first available size if a size selector exists.
        // Chakra UI renders radio options as <div role="radio"> or <label> wrapping
        // a hidden <input>, so we use the role-based radiogroup locator.
        const sizeGroup = modal.locator(
            '[data-testid="product-view"] [role="radiogroup"]',
        ).filter({hasText: /size/i})
        const sizeGroupCount = await sizeGroup.count()
        if (sizeGroupCount > 0) {
            const firstSizeOption = sizeGroup.first().locator('[role="radio"]').first()
            const sizeOptionCount = await firstSizeOption.count()
            if (sizeOptionCount > 0) {
                await firstSizeOption.click()
                await assertNoCrashPage(page, 'select size')
            }
        }

        // Click Add to Bag
        const addBtn = page.getByTestId('quick-view-add-to-cart-btn')
        await expect(addBtn).toBeEnabled({timeout: 10_000})
        await addBtn.click()
        await assertNoCrashPage(page, 'add to bag')

        // Quick View modal should close
        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({timeout: 15_000})

        // Add-to-cart confirmation modal should appear
        await expect(page.getByTestId('add-to-cart-modal')).toBeVisible({timeout: 15_000})

        // At least one product-added row
        const addedRows = page.getByTestId('add-to-cart-modal').getByTestId('product-added')
        await expect(addedRows.first()).toBeVisible({timeout: 10_000})

        // No basket errors
        expect(basketErrors).toEqual([])

        assertConsoleErrorBudget(consoleErrors)
    })

    // -----------------------------------------------------------------------
    // Flow E2E-004: close-quick-view-restores-focus (P2)
    // -----------------------------------------------------------------------
    test('E2E-004: close-quick-view-restores-focus — Escape', async ({page}) => {
        const consoleErrors = collectConsoleErrors(page)
        await gotoPlp(page)
        const {productId} = await openQuickView(page)

        await page.keyboard.press('Escape')
        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({timeout: 10_000})

        // Focus should return to the originating trigger
        const activeTestId = await page.evaluate(() =>
            document.activeElement?.getAttribute('data-testid'),
        )
        expect(activeTestId).toBe(`quick-view-trigger-${productId}`)

        assertConsoleErrorBudget(consoleErrors)
    })

    test('E2E-004: close-quick-view-restores-focus — close button', async ({page}) => {
        const consoleErrors = collectConsoleErrors(page)
        await gotoPlp(page)
        const {productId} = await openQuickView(page)

        // Click the modal close button (Chakra ModalCloseButton)
        const modal = page.getByTestId('quick-view-modal')
        const closeBtn = modal.locator('button').filter({hasText: /close/i}).first()
        await closeBtn.click()
        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({timeout: 10_000})

        const activeTestId = await page.evaluate(() =>
            document.activeElement?.getAttribute('data-testid'),
        )
        expect(activeTestId).toBe(`quick-view-trigger-${productId}`)

        assertConsoleErrorBudget(consoleErrors)
    })

    test('E2E-004: close-quick-view-restores-focus — overlay click', async ({page}) => {
        const consoleErrors = collectConsoleErrors(page)
        await gotoPlp(page)
        const {productId} = await openQuickView(page)

        // Click the overlay (Chakra ModalOverlay) — click outside the modal content
        const modalOverlay = page.locator('.chakra-modal__overlay')
        await modalOverlay.click({position: {x: 10, y: 10}, force: true})
        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible({timeout: 10_000})

        const activeTestId = await page.evaluate(() =>
            document.activeElement?.getAttribute('data-testid'),
        )
        expect(activeTestId).toBe(`quick-view-trigger-${productId}`)

        assertConsoleErrorBudget(consoleErrors)
    })

    // -----------------------------------------------------------------------
    // Flow E2E-005: no-pickup-ui-in-quick-view (P1, negative)
    // -----------------------------------------------------------------------
    test('E2E-005: no-pickup-ui-in-quick-view', async ({page}) => {
        const consoleErrors = collectConsoleErrors(page)
        await gotoPlp(page)
        await openQuickView(page)

        const modal = page.getByTestId('quick-view-modal')
        await expect(modal.getByTestId('product-view')).toBeVisible({timeout: 15_000})

        // Assert none of the pickup testids are visible
        await expect(modal.locator('[data-testid="pickup-select-store-msg"]')).not.toBeVisible()
        await expect(modal.locator('[data-testid="store-stock-status-msg"]')).not.toBeVisible()

        // No element with data-testid containing "pickup"
        const pickupElements = modal.locator('[data-testid*="pickup"]')
        expect(await pickupElements.count()).toBe(0)

        // No text matching pickup / ship to store / pick up inside modal
        const modalText = await modal.textContent()
        expect(modalText).not.toMatch(/pickup|ship to store|pick up/i)

        assertConsoleErrorBudget(consoleErrors)
    })

    // -----------------------------------------------------------------------
    // Flow E2E-006: add-to-bag-disabled-when-unavailable (P2, US3)
    // -----------------------------------------------------------------------
    test('E2E-006: add-to-bag-disabled-when-unavailable', async ({page}) => {
        const consoleErrors = collectConsoleErrors(page)
        await gotoPlp(page)
        await openQuickView(page)

        const modal = page.getByTestId('quick-view-modal')
        await expect(modal.getByTestId('product-view')).toBeVisible({timeout: 15_000})

        // Check if Add to Bag is disabled initially (master product with
        // unselected variation). Some products auto-select their first variant
        // so the button may already be enabled — that's valid behavior.
        const addBtn = page.getByTestId('quick-view-add-to-cart-btn')
        const isInitiallyDisabled = await addBtn.isDisabled().catch(() => false)

        // Attempt to find an OOS variation by scanning size swatches
        const sizeGroup = modal.locator(
            '[data-testid="product-view"] [role="radiogroup"]',
        ).filter({hasText: /size/i})
        const sizeGroupExists = (await sizeGroup.count()) > 0
        const sizeSwatches = sizeGroupExists
            ? sizeGroup.first().locator('[role="radio"]')
            : modal.locator('__nonexistent__')
        const sizeCount = await sizeSwatches.count()

        let foundOos = false
        for (let i = 0; i < sizeCount; i++) {
            const swatch = sizeSwatches.nth(i)
            const isDisabled = await swatch.isDisabled().catch(() => false)
            const ariaDisabled =
                (await swatch.getAttribute('aria-disabled')) === 'true'
            if (isDisabled || ariaDisabled) {
                // Try clicking it anyway to see if inventory message shows
                await swatch.click({force: true}).catch(() => {})
                const inventoryMsg = modal.getByTestId('inventory-message')
                const msgVisible = await inventoryMsg
                    .waitFor({state: 'visible', timeout: 3_000})
                    .then(() => true)
                    .catch(() => false)
                if (msgVisible) {
                    await expect(addBtn).toBeDisabled()
                    await expect(inventoryMsg).toBeVisible()
                    foundOos = true
                    break
                }
            }
        }

        if (!isInitiallyDisabled && !foundOos) {
            test.skip(
                true,
                'No OOS/unselected variant discoverable; covered deterministically by unit tests',
            )
        }

        assertConsoleErrorBudget(consoleErrors)
    })

    // -----------------------------------------------------------------------
    // Flow E2E-007: view-full-details-link (P3, US4)
    // -----------------------------------------------------------------------
    test('E2E-007: view-full-details-link', async ({page}) => {
        const consoleErrors = collectConsoleErrors(page)
        await gotoPlp(page)
        await openQuickView(page)

        const modal = page.getByTestId('quick-view-modal')
        await expect(modal.getByTestId('product-view')).toBeVisible({timeout: 15_000})

        const detailsLink = page.getByTestId('quick-view-view-full-details-link')
        await expect(detailsLink).toBeVisible()
        await detailsLink.click()

        // Should navigate to a PDP URL
        await page.waitForURL(/\/product\//, {timeout: 15_000})
        expect(page.url()).toMatch(/\/product\//)

        // Modal should no longer be visible
        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible()

        assertConsoleErrorBudget(consoleErrors)
    })

    // -----------------------------------------------------------------------
    // Flow E2E-008: tile-click-still-navigates-to-pdp (P2, US1 regression)
    // -----------------------------------------------------------------------
    test('E2E-008: tile-click-still-navigates-to-pdp', async ({page}) => {
        const consoleErrors = collectConsoleErrors(page)
        await gotoPlp(page)

        // Click the tile image (NOT the Quick View trigger)
        const tileImage = page.locator('[data-testid="product-tile-image"]').first()
        await expect(tileImage).toBeVisible({timeout: 10_000})
        await tileImage.click()

        // Should navigate to PDP
        await page.waitForURL(/\/product\//, {timeout: 15_000})
        expect(page.url()).toMatch(/\/product\//)

        // Quick View modal should NOT be visible
        await expect(page.getByTestId('quick-view-modal')).not.toBeVisible()

        assertConsoleErrorBudget(consoleErrors)
    })
})
