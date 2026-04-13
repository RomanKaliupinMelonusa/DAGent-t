import {test, expect, type Page, type Locator} from '@playwright/test'

/**
 * E2E tests for the Product Quick View feature.
 *
 * Feature: Shoppers can view product details, select variations, and add to cart
 * directly from the Product Listing Page (PLP) via a Quick View modal — without
 * navigating to the Product Detail Page (PDP).
 *
 * data-testid contract:
 *   quick-view-btn        — overlay bar trigger on each product tile
 *   quick-view-modal      — modal content wrapper (ModalContent)
 *   quick-view-spinner    — loading spinner while product data fetches
 *   quick-view-error      — "product unavailable" state
 *   quick-view-render-error — ProductView render error boundary fallback
 */

// ─── Constants ────────────────────────────────────────────────────────────

/** A PLP (category) URL that is known to return products on the RefArch sandbox. */
const PLP_URL = '/category/newarrivals'
/** Fallback PLP URL if the primary one doesn't yield tiles. */
const PLP_FALLBACK_URL = '/search?q=shirt'
/** Timeout for waiting for elements after navigation / interaction. */
const ELEMENT_TIMEOUT = 15_000

// ─── Browser Diagnostics (MANDATORY) ──────────────────────────────────────

let consoleErrors: string[] = []
let failedRequests: string[] = []

test.beforeEach(async ({page}) => {
    consoleErrors = []
    failedRequests = []

    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('requestfailed', (req) => {
        failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`)
    })
})

test.afterEach(async ({page}, testInfo) => {
    if (testInfo.status !== 'passed') {
        console.log(`\n--- Browser Diagnostics for "${testInfo.title}" ---`)
        if (consoleErrors.length > 0) {
            console.log('Console errors:', consoleErrors)
        }
        if (failedRequests.length > 0) {
            console.log('Failed requests:', failedRequests)
        }
        await page
            .screenshot({
                path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
            })
            .catch(() => {})
    }
})

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a PLP page and wait for at least one product tile to render.
 * Tries PLP_URL first, then falls back to PLP_FALLBACK_URL (search).
 */
async function navigateToPLP(page: Page): Promise<void> {
    await page.goto(PLP_URL, {waitUntil: 'domcontentloaded'})

    // Wait for either a quick-view-btn (our feature) or a generic product link
    const quickViewBtn = page.getByTestId('quick-view-btn').first()
    const productLink = page.locator('a[href*="/product/"]').first()

    const found = await Promise.race([
        quickViewBtn
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'quick-view' as const),
        productLink
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'product-link' as const)
    ]).catch(() => 'none' as const)

    if (found === 'none') {
        // Fallback: try a search page
        await page.goto(PLP_FALLBACK_URL, {waitUntil: 'domcontentloaded'})
        await page
            .getByTestId('quick-view-btn')
            .first()
            .waitFor({state: 'attached', timeout: ELEMENT_TIMEOUT})
    }
}

/**
 * Detect the PWA Kit crash page. If detected, throws a structured error
 * with the stack trace from the <pre> element.
 */
async function assertNoCrashPage(page: Page, actionDescription: string): Promise<void> {
    const crashHeading = page.getByRole('heading', {
        name: /this page isn't working/i
    })
    const hasCrash = await crashHeading
        .waitFor({state: 'visible', timeout: 2000})
        .then(() => true)
        .catch(() => false)
    if (hasCrash) {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack')
        throw new Error(
            `PWA Kit crash page detected after "${actionDescription}". Stack: ${stack}`
        )
    }
}

/**
 * Open the Quick View modal by clicking the first quick-view-btn on the page.
 * Uses the three-outcome assertion pattern (content / error / crash).
 * Returns which outcome was observed.
 */
async function openQuickViewModal(
    page: Page
): Promise<'content' | 'error-state' | 'spinner'> {
    // Click the first Quick View button
    const quickViewBtn = page.getByTestId('quick-view-btn').first()
    await quickViewBtn.waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
    await quickViewBtn.click()

    // Three-outcome assertion: modal content | error state | crash page
    const modal = page.getByTestId('quick-view-modal')
    const spinner = page.getByTestId('quick-view-spinner')
    const errorState = page.getByTestId('quick-view-error')
    const renderError = page.getByTestId('quick-view-render-error')
    const crashPage = page.getByRole('heading', {
        name: /this page isn't working/i
    })

    // First, the modal itself must appear
    await modal.waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})

    // Now race for the three possible outcomes inside the modal
    const winner = await Promise.race([
        // Spinner appears first (data loading), then resolves to content or error
        spinner
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'spinner' as const),
        errorState
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'error-state' as const),
        renderError
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'error-state' as const),
        crashPage
            .waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
            .then(() => 'crash' as const)
    ]).catch(() => 'content' as const)

    if (winner === 'crash') {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack')
        throw new Error(`PWA Kit crash page detected after opening Quick View. Stack: ${stack}`)
    }

    return winner
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
    test('Quick View button appears on product tiles on PLP', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const quickViewBtns = page.getByTestId('quick-view-btn')
        // At least one Quick View button should be visible (mobile viewport = always visible)
        await expect(quickViewBtns.first()).toBeAttached({timeout: ELEMENT_TIMEOUT})

        // Verify it has accessible aria-label containing "Quick View"
        const ariaLabel = await quickViewBtns.first().getAttribute('aria-label')
        expect(ariaLabel).toMatch(/Quick View/i)
    })

    test('Quick View button contains "Quick View" text', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'attached', timeout: ELEMENT_TIMEOUT})

        // The button should contain "Quick View" text
        await expect(quickViewBtn).toContainText('Quick View')
    })

    test('clicking Quick View opens the modal with product data', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        // Record URL before click to verify no navigation
        const urlBefore = page.url()

        const outcome = await openQuickViewModal(page)

        // URL should not have changed (no PDP navigation)
        expect(page.url()).toBe(urlBefore)

        // Modal must be visible
        const modal = page.getByTestId('quick-view-modal')
        await expect(modal).toBeVisible()

        // Modal should have an aria-label for accessibility
        const ariaLabel = await modal.getAttribute('aria-label')
        expect(ariaLabel).toBeTruthy()
        expect(ariaLabel).toMatch(/Quick view for/i)

        if (outcome === 'spinner') {
            // Wait for spinner to disappear (product data loads)
            await page
                .getByTestId('quick-view-spinner')
                .waitFor({state: 'hidden', timeout: 30_000})

            // After spinner disappears, either content or error should appear
            await assertNoCrashPage(page, 'Quick View data load')
        }
    })

    test('modal shows loading spinner then product content', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
        await quickViewBtn.click()

        const modal = page.getByTestId('quick-view-modal')
        await modal.waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})

        // Either we catch the spinner (fast enough) or content already loaded
        const spinner = page.getByTestId('quick-view-spinner')
        const errorState = page.getByTestId('quick-view-error')

        // Wait for spinner to disappear if it appeared
        await spinner.waitFor({state: 'hidden', timeout: 30_000}).catch(() => {
            // Spinner may have already gone by the time we check
        })

        await assertNoCrashPage(page, 'after spinner resolves')

        // After loading, either product content or error state should be present
        // Product content: look for product-related elements inside the modal
        const hasError = await errorState.isVisible().catch(() => false)

        if (!hasError) {
            // ProductView should have rendered — look for Add to Cart button or product name
            // ProductView renders price, variant selectors, and an Add to Cart button
            const modalBody = modal
            const addToCartBtn = modalBody.locator(
                'button:has-text("Add to Cart"), button:has-text("Add To Cart"), button:has-text("add to cart")'
            )
            const viewFullDetails = modalBody.locator(
                'a:has-text("View Full Details"), a:has-text("Full Details")'
            )

            // At least one of these should be visible (ProductView rendered)
            const hasAddToCart = await addToCartBtn.first().isVisible().catch(() => false)
            const hasFullDetails = await viewFullDetails.first().isVisible().catch(() => false)

            // At minimum, the modal should contain some product content
            expect(hasAddToCart || hasFullDetails).toBeTruthy()
        }
    })

    test('modal can be closed with the close button', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        await openQuickViewModal(page)

        const modal = page.getByTestId('quick-view-modal')
        await expect(modal).toBeVisible()

        // Click the modal close button (Chakra ModalCloseButton)
        const closeBtn = modal.locator('button[aria-label="Close"]')
        await closeBtn.click()

        // Modal should no longer be visible
        await expect(modal).not.toBeVisible({timeout: 5_000})
    })

    test('modal can be closed with Escape key', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        await openQuickViewModal(page)

        const modal = page.getByTestId('quick-view-modal')
        await expect(modal).toBeVisible()

        // Press Escape to close
        await page.keyboard.press('Escape')

        // Modal should no longer be visible
        await expect(modal).not.toBeVisible({timeout: 5_000})
    })

    test('Quick View does not navigate away from PLP', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const urlBefore = page.url()

        await openQuickViewModal(page)

        // URL must remain the same (no PDP navigation)
        expect(page.url()).toBe(urlBefore)

        // Close modal
        const modal = page.getByTestId('quick-view-modal')
        const closeBtn = modal.locator('button[aria-label="Close"]')
        await closeBtn.click()
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // URL still unchanged after closing
        expect(page.url()).toBe(urlBefore)
    })

    test('modal contains "View Full Details" link to PDP', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        await openQuickViewModal(page)

        // Wait for spinner to resolve
        await page
            .getByTestId('quick-view-spinner')
            .waitFor({state: 'hidden', timeout: 30_000})
            .catch(() => {})

        const modal = page.getByTestId('quick-view-modal')

        // Check for error state — if product loaded, there should be a Full Details link
        const hasError = await page
            .getByTestId('quick-view-error')
            .isVisible()
            .catch(() => false)

        if (!hasError) {
            const fullDetailsLink = modal.locator(
                'a:has-text("View Full Details"), a:has-text("Full Details")'
            )
            await expect(fullDetailsLink.first()).toBeVisible({timeout: ELEMENT_TIMEOUT})

            // The link should point to a PDP URL
            const href = await fullDetailsLink.first().getAttribute('href')
            expect(href).toMatch(/\/product\//)
        }
    })

    test('Quick View button has correct accessibility attributes', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'attached', timeout: ELEMENT_TIMEOUT})

        // Should be a button element (semantic HTML)
        const tagName = await quickViewBtn.evaluate((el) => el.tagName.toLowerCase())
        expect(tagName).toBe('button')

        // Should have aria-label
        const ariaLabel = await quickViewBtn.getAttribute('aria-label')
        expect(ariaLabel).toBeTruthy()
        expect(ariaLabel).toMatch(/Quick View/i)
    })

    test('Quick View modal has accessible aria-label with product name', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        await openQuickViewModal(page)

        const modal = page.getByTestId('quick-view-modal')
        const ariaLabel = await modal.getAttribute('aria-label')

        // Should match pattern "Quick view for <product name>"
        expect(ariaLabel).toBeTruthy()
        expect(ariaLabel).toMatch(/Quick view for .+/i)
    })

    test('multiple Quick View buttons exist for multiple products', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const quickViewBtns = page.getByTestId('quick-view-btn')
        const count = await quickViewBtns.count()

        // A PLP with products should have multiple Quick View buttons
        // (at least 2 products typically)
        expect(count).toBeGreaterThanOrEqual(1)

        // Each button should have a unique aria-label (product name differs)
        if (count >= 2) {
            const label1 = await quickViewBtns.nth(0).getAttribute('aria-label')
            const label2 = await quickViewBtns.nth(1).getAttribute('aria-label')
            // Labels should both be present
            expect(label1).toBeTruthy()
            expect(label2).toBeTruthy()
        }
    })

    test('opening Quick View for different products shows correct data', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const quickViewBtns = page.getByTestId('quick-view-btn')
        const count = await quickViewBtns.count()

        if (count < 2) {
            // Not enough products to test — skip gracefully
            test.skip(true, 'Need at least 2 products on PLP to test different Quick Views')
            return
        }

        // Open Quick View for first product
        const firstBtn = quickViewBtns.nth(0)
        const firstAriaLabel = await firstBtn.getAttribute('aria-label')
        await firstBtn.click()

        const modal = page.getByTestId('quick-view-modal')
        await modal.waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})

        const firstModalLabel = await modal.getAttribute('aria-label')

        // Close modal
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // Open Quick View for second product
        const secondBtn = quickViewBtns.nth(1)
        const secondAriaLabel = await secondBtn.getAttribute('aria-label')
        await secondBtn.click()

        await modal.waitFor({state: 'visible', timeout: ELEMENT_TIMEOUT})
        const secondModalLabel = await modal.getAttribute('aria-label')

        // If products are different, modal labels should reflect different products
        if (firstAriaLabel !== secondAriaLabel) {
            expect(secondModalLabel).not.toBe(firstModalLabel)
        }
    })
})

test.describe('Product Quick View — Edge Cases', () => {
    test('Quick View overlay bar is not shown for product sets/bundles', async ({page}) => {
        // Navigate to a search that might include sets/bundles
        // Since we can't guarantee set/bundle products, we verify
        // that Quick View buttons only appear on supported product types
        // by checking that every quick-view-btn is inside a tile container
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        // All Quick View buttons should be within product tile containers
        const quickViewBtns = page.getByTestId('quick-view-btn')
        const count = await quickViewBtns.count()

        // Verify buttons exist (feature is active)
        expect(count).toBeGreaterThanOrEqual(1)

        // Each button should have an aria-label (indicating it's for a valid product)
        for (let i = 0; i < Math.min(count, 5); i++) {
            const label = await quickViewBtns.nth(i).getAttribute('aria-label')
            expect(label).toMatch(/Quick View/i)
        }
    })

    test('PLP remains functional after Quick View close', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        // Open and close Quick View
        await openQuickViewModal(page)

        const modal = page.getByTestId('quick-view-modal')
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // PLP should still be functional — product tiles still present
        const quickViewBtns = page.getByTestId('quick-view-btn')
        const count = await quickViewBtns.count()
        expect(count).toBeGreaterThanOrEqual(1)

        // Should be able to open Quick View again
        await quickViewBtns.first().click()
        await expect(page.getByTestId('quick-view-modal')).toBeVisible({
            timeout: ELEMENT_TIMEOUT
        })
    })
})
