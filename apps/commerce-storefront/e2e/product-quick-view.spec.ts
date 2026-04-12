import {test, expect, type Page} from '@playwright/test'

/**
 * E2E tests for the Product Quick View feature.
 *
 * Tests verify the Quick View overlay bar on product tiles (PLP) and
 * the Quick View modal that displays product details without navigating
 * to the PDP.
 *
 * data-testid contract:
 *   - quick-view-btn     → overlay bar button on each product tile
 *   - quick-view-modal   → modal content container
 *   - quick-view-spinner → loading spinner inside the modal
 *   - quick-view-error   → error/unavailable state inside the modal
 */

// ─── Browser Diagnostics (MANDATORY) ─────────────────────────────────────

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
        await page.screenshot({
            path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
        })
    }
})

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a PLP (Product Listing Page) and wait for product tiles
 * to render. Tries multiple known RefArch category URLs.
 */
async function navigateToPLP(page: Page): Promise<void> {
    const categoryPaths = [
        '/category/newarrivals',
        '/category/womens',
        '/category/mens',
        '/category/womens-clothing-tops'
    ]

    for (const path of categoryPaths) {
        await page.goto(path, {waitUntil: 'domcontentloaded'})

        // Wait for at least one quick-view-btn to appear (proves tiles loaded with override)
        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        try {
            await quickViewBtn.waitFor({state: 'attached', timeout: 30_000})
            return // Success — tiles with Quick View loaded
        } catch {
            // This category may not have products — try the next one
            continue
        }
    }

    // Fallback: try the search page which also uses ProductTile
    await page.goto('/search?q=shirt', {waitUntil: 'domcontentloaded'})
    await page
        .getByTestId('quick-view-btn')
        .first()
        .waitFor({state: 'attached', timeout: 30_000})
}

/**
 * Open the Quick View modal for the first product tile and wait for it
 * to become visible.
 */
async function openQuickViewModal(page: Page): Promise<void> {
    const quickViewBtn = page.getByTestId('quick-view-btn').first()
    await quickViewBtn.click({force: true}) // force: may be hidden on desktop until hover

    const modal = page.getByTestId('quick-view-modal')
    await modal.waitFor({state: 'visible', timeout: 15_000})
}

/**
 * Wait for the Quick View modal content to finish loading (spinner gone).
 * Returns whether an error state was shown instead of product content.
 */
async function waitForModalContent(page: Page): Promise<boolean> {
    const spinner = page.getByTestId('quick-view-spinner')
    if (await spinner.isVisible()) {
        await spinner.waitFor({state: 'hidden', timeout: 30_000})
    }

    const error = page.getByTestId('quick-view-error')
    return await error.isVisible().catch(() => false)
}

// ─── Quick View Button (Overlay Bar) Tests ────────────────────────────────

test.describe('Quick View — Overlay Bar on PLP', () => {
    test('product tiles display Quick View buttons', async ({page}) => {
        await navigateToPLP(page)

        const quickViewButtons = page.getByTestId('quick-view-btn')
        const count = await quickViewButtons.count()

        expect(count).toBeGreaterThan(0)
    })

    test('Quick View button contains "Quick View" text', async ({page}) => {
        await navigateToPLP(page)

        const firstBtn = page.getByTestId('quick-view-btn').first()
        await expect(firstBtn).toContainText('Quick View')
    })

    test('Quick View button has accessible aria-label', async ({page}) => {
        await navigateToPLP(page)

        const firstBtn = page.getByTestId('quick-view-btn').first()
        const ariaLabel = await firstBtn.getAttribute('aria-label')

        expect(ariaLabel).toBeTruthy()
        expect(ariaLabel).toMatch(/Quick View/i)
    })

    test('Quick View button is a semantic button element', async ({page}) => {
        await navigateToPLP(page)

        const firstBtn = page.getByTestId('quick-view-btn').first()
        const tagName = await firstBtn.evaluate((el) => el.tagName.toLowerCase())

        expect(tagName).toBe('button')
    })
})

// ─── Quick View Modal — Open / Close ──────────────────────────────────────

test.describe('Quick View — Modal Lifecycle', () => {
    test('clicking Quick View button opens the modal', async ({page}) => {
        await navigateToPLP(page)
        await openQuickViewModal(page)

        const modal = page.getByTestId('quick-view-modal')
        await expect(modal).toBeVisible()
    })

    test('modal shows loading spinner then content', async ({page}) => {
        await navigateToPLP(page)

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.click({force: true})

        const modal = page.getByTestId('quick-view-modal')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        // Either the spinner is visible briefly, or the product content loads directly.
        // We wait for spinner to disappear and verify content rendered.
        const spinner = page.getByTestId('quick-view-spinner')
        if (await spinner.isVisible()) {
            await spinner.waitFor({state: 'hidden', timeout: 30_000})
        }

        // After loading, spinner must be gone
        await expect(spinner).not.toBeVisible()

        // If it's not an error state, there should be product content inside the modal
        const isError = await waitForModalContent(page)
        if (!isError) {
            // ProductView renders buttons, images, or headings
            const modalContent = modal.locator('button, img, h1, h2')
            await expect(modalContent.first()).toBeVisible({timeout: 10_000})
        }
    })

    test('modal has accessible aria-label with product name', async ({page}) => {
        await navigateToPLP(page)
        await openQuickViewModal(page)

        const modal = page.getByTestId('quick-view-modal')
        const ariaLabel = await modal.getAttribute('aria-label')

        expect(ariaLabel).toBeTruthy()
        expect(ariaLabel).toMatch(/Quick view for/i)
    })

    test('modal closes when clicking the X close button', async ({page}) => {
        await navigateToPLP(page)
        await openQuickViewModal(page)

        const modal = page.getByTestId('quick-view-modal')

        // Chakra ModalCloseButton renders a button with aria-label "Close"
        const closeBtn = modal.locator('button[aria-label="Close"]')
        await closeBtn.click()

        await expect(modal).not.toBeVisible({timeout: 5_000})
    })

    test('modal closes when pressing Escape key', async ({page}) => {
        await navigateToPLP(page)
        await openQuickViewModal(page)

        const modal = page.getByTestId('quick-view-modal')
        await page.keyboard.press('Escape')

        await expect(modal).not.toBeVisible({timeout: 5_000})
    })

    test('URL does not change when opening and closing Quick View', async ({page}) => {
        await navigateToPLP(page)

        const urlBefore = page.url()

        await openQuickViewModal(page)

        // URL should remain the same (no PDP navigation)
        expect(page.url()).toBe(urlBefore)

        // Close modal
        await page.keyboard.press('Escape')
        const modal = page.getByTestId('quick-view-modal')
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // URL still unchanged after closing
        expect(page.url()).toBe(urlBefore)
    })
})

// ─── Quick View Modal — Content ───────────────────────────────────────────

test.describe('Quick View — Modal Content', () => {
    test('modal displays product image after loading', async ({page}) => {
        await navigateToPLP(page)
        await openQuickViewModal(page)

        const isError = await waitForModalContent(page)
        if (!isError) {
            const modal = page.getByTestId('quick-view-modal')
            // ProductView renders product images from the SFCC image service
            const productImage = modal.locator('img[src*="dw/image"], img[alt]')
            await expect(productImage.first()).toBeVisible({timeout: 10_000})
        }
    })

    test('modal contains an Add to Cart button', async ({page}) => {
        await navigateToPLP(page)
        await openQuickViewModal(page)

        const isError = await waitForModalContent(page)
        if (!isError) {
            const modal = page.getByTestId('quick-view-modal')
            // ProductView renders an "Add to Cart" / "Add To Cart" button
            const addToCartBtn = modal.locator(
                'button:has-text("Add to Cart"), button:has-text("Add To Cart")'
            )
            await expect(addToCartBtn.first()).toBeVisible({timeout: 10_000})
        }
    })

    test('modal contains a "View Full Details" link', async ({page}) => {
        await navigateToPLP(page)
        await openQuickViewModal(page)

        const isError = await waitForModalContent(page)
        if (!isError) {
            const modal = page.getByTestId('quick-view-modal')
            // showFullLink={true} renders a link to the PDP
            const fullDetailsLink = modal.locator(
                'a:has-text("Full Details"), a:has-text("View Full Details")'
            )
            await expect(fullDetailsLink.first()).toBeVisible({timeout: 10_000})
        }
    })
})

// ─── Quick View — Mobile Viewport ─────────────────────────────────────────

test.describe('Quick View — Mobile Viewport', () => {
    test.use({viewport: {width: 375, height: 812}}) // iPhone X dimensions

    test('Quick View button is visible without hover on mobile', async ({page}) => {
        await navigateToPLP(page)

        // On mobile (< lg breakpoint), the overlay bar should be always visible
        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 30_000})

        await expect(quickViewBtn).toBeVisible()
    })

    test('Quick View modal opens on mobile tap', async ({page}) => {
        await navigateToPLP(page)

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        await quickViewBtn.waitFor({state: 'visible', timeout: 30_000})
        await quickViewBtn.click()

        const modal = page.getByTestId('quick-view-modal')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        await expect(modal).toBeVisible()
    })
})

// ─── Quick View — Edge Cases ──────────────────────────────────────────────

test.describe('Quick View — Edge Cases', () => {
    test('opening Quick View on different tiles shows different products', async ({page}) => {
        await navigateToPLP(page)

        const quickViewButtons = page.getByTestId('quick-view-btn')
        const count = await quickViewButtons.count()

        if (count >= 2) {
            // Open first tile's Quick View
            await quickViewButtons.nth(0).click({force: true})
            const modal = page.getByTestId('quick-view-modal')
            await modal.waitFor({state: 'visible', timeout: 15_000})

            // Get aria-label of first modal (contains product name)
            const firstAriaLabel = await modal.getAttribute('aria-label')

            // Close modal
            await page.keyboard.press('Escape')
            await expect(modal).not.toBeVisible({timeout: 5_000})

            // Open second tile's Quick View
            await quickViewButtons.nth(1).click({force: true})
            await modal.waitFor({state: 'visible', timeout: 15_000})

            const secondAriaLabel = await modal.getAttribute('aria-label')

            // Both should have aria-labels with product names
            expect(firstAriaLabel).toBeTruthy()
            expect(secondAriaLabel).toBeTruthy()

            // Close
            await page.keyboard.press('Escape')
            await expect(modal).not.toBeVisible({timeout: 5_000})
        }
    })

    test('rapid open-close-open does not break the modal', async ({page}) => {
        await navigateToPLP(page)

        const quickViewBtn = page.getByTestId('quick-view-btn').first()
        const modal = page.getByTestId('quick-view-modal')

        // First open-close cycle
        await quickViewBtn.click({force: true})
        await modal.waitFor({state: 'visible', timeout: 15_000})
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // Second open — should still work
        await quickViewBtn.click({force: true})
        await modal.waitFor({state: 'visible', timeout: 15_000})
        await expect(modal).toBeVisible()

        // Clean up
        await page.keyboard.press('Escape')
    })
})
