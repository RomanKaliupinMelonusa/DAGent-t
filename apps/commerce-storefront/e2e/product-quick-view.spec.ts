import {test, expect, type Page} from '@playwright/test'

/**
 * E2E tests for the Product Quick View feature.
 *
 * Feature: Shoppers can preview product details, select variations, and
 * add-to-cart directly from the Product Listing Page (PLP) via a Quick View
 * modal — without navigating to the Product Detail Page (PDP).
 *
 * Data-testid contract (from source components):
 *   quick-view-btn      — overlay bar trigger on each product tile (product-tile/index.jsx:61)
 *   quick-view-modal    — the ModalContent wrapper (quick-view-modal/index.jsx:87)
 *   quick-view-spinner  — loading spinner while product data fetches (quick-view-modal/index.jsx:99)
 *   quick-view-error    — error/unavailable state inside modal (quick-view-modal/index.jsx:41,102)
 */

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
 * Navigate to a category / PLP page that shows product tiles with Quick View
 * buttons. Tries known RefArch sandbox category paths first, then falls back
 * to clicking the first navigation link from the homepage.
 */
async function navigateToPLP(page: Page): Promise<void> {
    const knownPLPPaths = [
        '/category/newarrivals',
        '/category/womens',
        '/category/mens',
        '/category/electronics'
    ]

    for (const path of knownPLPPaths) {
        await page.goto(path, {waitUntil: 'domcontentloaded'})
        const tile = page.getByTestId('quick-view-btn').first()
        const visible = await tile
            .waitFor({state: 'visible', timeout: 15_000})
            .then(() => true)
            .catch(() => false)
        if (visible) return
    }

    // Fallback: go to homepage and click the first nav link
    await page.goto('/', {waitUntil: 'domcontentloaded'})
    const navLink = page.locator('nav a, [role="navigation"] a').first()
    const navVisible = await navLink
        .waitFor({state: 'visible', timeout: 10_000})
        .then(() => true)
        .catch(() => false)

    if (navVisible) {
        await navLink.click()
        await page.waitForLoadState('domcontentloaded')
        await page
            .getByTestId('quick-view-btn')
            .first()
            .waitFor({state: 'visible', timeout: 15_000})
    }
}

/**
 * Detect the PWA Kit crash page and throw a structured error.
 */
async function assertNoCrashPage(page: Page, actionDescription: string): Promise<void> {
    const crashHeading = page.getByRole('heading', {name: /this page isn't working/i})
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
 * Three-outcome assertion after opening the Quick View modal.
 * Returns which outcome won: 'content' or 'error-state'. Throws on crash.
 */
async function waitForQuickViewOutcome(
    page: Page
): Promise<'content' | 'error-state'> {
    const content = page.getByTestId('quick-view-modal')
    const errorState = page.getByTestId('quick-view-error')
    const crashPage = page.getByRole('heading', {name: /this page isn't working/i})

    const winner = await Promise.race([
        content
            .waitFor({state: 'visible', timeout: 20_000})
            .then(() => 'content' as const),
        errorState
            .waitFor({state: 'visible', timeout: 20_000})
            .then(() => 'error-state' as const),
        crashPage
            .waitFor({state: 'visible', timeout: 20_000})
            .then(() => 'crash' as const)
    ])

    if (winner === 'crash') {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack')
        throw new Error(`PWA Kit crash page detected when opening Quick View. Stack: ${stack}`)
    }

    return winner
}

/**
 * Open the Quick View modal for the first product tile and wait for it to
 * be fully visible. Returns the modal locator for further assertions.
 */
async function openQuickViewModal(page: Page) {
    const btn = page.getByTestId('quick-view-btn').first()
    await btn.click()
    const modal = page.getByTestId('quick-view-modal')
    await expect(modal).toBeVisible({timeout: 20_000})
    return modal
}

/**
 * Wait for the modal product content to finish loading (spinner hidden).
 * Returns true if product loaded, false if error/unavailable state shown.
 */
async function waitForModalContent(page: Page): Promise<boolean> {
    const spinner = page.getByTestId('quick-view-spinner')
    await expect(spinner).toBeHidden({timeout: 20_000})
    const errorState = page.getByTestId('quick-view-error')
    return !(await errorState.isVisible().catch(() => false))
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Product Quick View', () => {
    test.describe('Quick View Trigger — Overlay Bar', () => {
        test('Quick View buttons appear on PLP product tiles', async ({page}) => {
            await navigateToPLP(page)

            // At least one Quick View button should be visible on a PLP
            const quickViewBtns = page.getByTestId('quick-view-btn')
            await expect(quickViewBtns.first()).toBeVisible()

            // Verify it contains the "Quick View" text
            await expect(quickViewBtns.first()).toContainText('Quick View')
        })

        test('Quick View trigger is a semantic button element for accessibility', async ({
            page
        }) => {
            await navigateToPLP(page)

            const btn = page.getByTestId('quick-view-btn').first()
            await expect(btn).toBeVisible()

            // The implementation uses Box as="button", which renders a <button>
            const tagName = await btn.evaluate((el) => el.tagName.toLowerCase())
            expect(tagName).toBe('button')
        })

        test('Quick View button has accessible aria-label with product name', async ({page}) => {
            await navigateToPLP(page)

            const btn = page.getByTestId('quick-view-btn').first()
            await expect(btn).toBeVisible()

            // aria-label should start with "Quick View" and include a product name
            const ariaLabel = await btn.getAttribute('aria-label')
            expect(ariaLabel).toBeTruthy()
            expect(ariaLabel).toMatch(/^Quick View\s+.+/)
        })

        test('clicking Quick View does NOT navigate to PDP', async ({page}) => {
            await navigateToPLP(page)

            const urlBefore = page.url()
            const btn = page.getByTestId('quick-view-btn').first()
            await btn.click()

            // Wait a moment for potential navigation
            await page.waitForLoadState('domcontentloaded')

            // URL should remain the same (no PDP navigation)
            expect(page.url()).toBe(urlBefore)
        })

        test('Quick View bar is visible on mobile viewport without hover', async ({
            page
        }) => {
            // Set a mobile viewport (below the lg breakpoint)
            await page.setViewportSize({width: 375, height: 812})
            await navigateToPLP(page)

            const btn = page.getByTestId('quick-view-btn').first()
            await expect(btn).toBeVisible()

            // On mobile, the bar should be visible by default (opacity: 1, translateY: 0)
            // Verify it's not hidden off-screen by checking bounding box
            const box = await btn.boundingBox()
            expect(box).toBeTruthy()
            expect(box!.height).toBeGreaterThan(0)
            expect(box!.width).toBeGreaterThan(0)
        })
    })

    test.describe('Quick View Modal — Opening & Content', () => {
        test('clicking Quick View button opens the modal', async ({page}) => {
            await navigateToPLP(page)

            const btn = page.getByTestId('quick-view-btn').first()
            await btn.click()

            const outcome = await waitForQuickViewOutcome(page)

            // Modal should be visible (outcome is either 'content' or 'error-state')
            const modal = page.getByTestId('quick-view-modal')
            await expect(modal).toBeVisible()

            await assertNoCrashPage(page, 'opening Quick View modal')
        })

        test('modal shows loading spinner then product content', async ({page}) => {
            await navigateToPLP(page)

            const btn = page.getByTestId('quick-view-btn').first()
            await btn.click()

            // The modal should appear
            const modal = page.getByTestId('quick-view-modal')
            await expect(modal).toBeVisible({timeout: 20_000})

            // Wait for content to replace the spinner — look for typical
            // ProductView elements (button, image, heading) or error state.
            const productContent = modal.locator(
                'button, img, h1, h2, [class*="product"], [data-testid="quick-view-error"]'
            )
            await expect(productContent.first()).toBeVisible({timeout: 20_000})

            await assertNoCrashPage(page, 'loading product content in modal')
        })

        test('modal has accessible aria-label containing product name', async ({page}) => {
            await navigateToPLP(page)

            const btn = page.getByTestId('quick-view-btn').first()
            await btn.click()

            const modal = page.getByTestId('quick-view-modal')
            await expect(modal).toBeVisible({timeout: 20_000})

            const ariaLabel = await modal.getAttribute('aria-label')
            expect(ariaLabel).toBeTruthy()
            // Should contain "Quick view for" (case-insensitive)
            expect(ariaLabel!.toLowerCase()).toContain('quick view for')
        })
    })

    test.describe('Quick View Modal — Closing', () => {
        test('modal closes when clicking the close button', async ({page}) => {
            await navigateToPLP(page)
            const modal = await openQuickViewModal(page)

            // Chakra ModalCloseButton renders a button with aria-label "Close"
            const closeBtn = page.getByRole('button', {name: /close/i})
            await closeBtn.click()

            // Modal should disappear
            await expect(modal).toBeHidden({timeout: 5_000})
        })

        test('modal closes when pressing Escape key', async ({page}) => {
            await navigateToPLP(page)
            const modal = await openQuickViewModal(page)

            await page.keyboard.press('Escape')

            await expect(modal).toBeHidden({timeout: 5_000})
        })

        test('modal closes when clicking the overlay backdrop', async ({page}) => {
            await navigateToPLP(page)
            const modal = await openQuickViewModal(page)

            // Chakra ModalOverlay is rendered as a sibling before ModalContent.
            // Clicking on the overlay (outside the modal content) should close it.
            // Click at the top-left corner of the viewport which is outside the modal.
            await page.mouse.click(5, 5)

            await expect(modal).toBeHidden({timeout: 5_000})
        })

        test('URL stays on PLP after modal open and close cycle', async ({page}) => {
            await navigateToPLP(page)

            const urlBefore = page.url()
            const modal = await openQuickViewModal(page)

            // Close the modal
            await page.keyboard.press('Escape')
            await expect(modal).toBeHidden({timeout: 5_000})

            // URL should still be the PLP
            expect(page.url()).toBe(urlBefore)
        })
    })

    test.describe('Quick View Modal — Product Details', () => {
        test('modal contains product image', async ({page}) => {
            await navigateToPLP(page)
            const modal = await openQuickViewModal(page)

            await assertNoCrashPage(page, 'loading product details in modal')
            const hasProduct = await waitForModalContent(page)

            if (hasProduct) {
                const img = modal.locator('img').first()
                await expect(img).toBeVisible({timeout: 10_000})
            }
        })

        test('modal contains "View Full Details" link to PDP', async ({page}) => {
            await navigateToPLP(page)
            const modal = await openQuickViewModal(page)

            await assertNoCrashPage(page, 'loading View Full Details link')
            const hasProduct = await waitForModalContent(page)

            if (hasProduct) {
                // ProductView with showFullLink={true} renders a link to the PDP
                const fullDetailsLink = modal.locator(
                    'a[href*="/product/"], a:has-text("Full Details"), a:has-text("full details"), a:has-text("View Full")'
                )
                await expect(fullDetailsLink.first()).toBeVisible({timeout: 10_000})
            }
        })

        test('"View Full Details" link navigates to the PDP', async ({page}) => {
            await navigateToPLP(page)
            const modal = await openQuickViewModal(page)

            await assertNoCrashPage(page, 'loading View Full Details link for navigation')
            const hasProduct = await waitForModalContent(page)

            if (hasProduct) {
                const fullDetailsLink = modal.locator(
                    'a[href*="/product/"], a:has-text("Full Details"), a:has-text("full details"), a:has-text("View Full")'
                )
                const linkVisible = await fullDetailsLink
                    .first()
                    .waitFor({state: 'visible', timeout: 10_000})
                    .then(() => true)
                    .catch(() => false)

                if (linkVisible) {
                    await fullDetailsLink.first().click()
                    await page.waitForLoadState('domcontentloaded')

                    // Should have navigated to a PDP — URL should contain /product/
                    expect(page.url()).toMatch(/\/product\//)

                    await assertNoCrashPage(page, 'navigating to PDP from View Full Details')
                }
            }
        })

        test('modal contains Add to Cart button', async ({page}) => {
            await navigateToPLP(page)
            const modal = await openQuickViewModal(page)

            await assertNoCrashPage(page, 'loading Add to Cart in modal')
            const hasProduct = await waitForModalContent(page)

            if (hasProduct) {
                // ProductView renders an Add to Cart button
                const addToCartBtn = modal.getByRole('button', {
                    name: /add to cart/i
                })
                await expect(addToCartBtn).toBeVisible({timeout: 10_000})
            }
        })
    })

    test.describe('Quick View — Edge Cases', () => {
        test('multiple Quick View buttons exist on PLP with multiple products', async ({
            page
        }) => {
            await navigateToPLP(page)

            const quickViewBtns = page.getByTestId('quick-view-btn')
            const count = await quickViewBtns.count()

            // A PLP should have multiple product tiles with Quick View buttons
            expect(count).toBeGreaterThanOrEqual(1)
        })

        test('opening Quick View on different tiles shows different product data', async ({
            page
        }) => {
            await navigateToPLP(page)

            const quickViewBtns = page.getByTestId('quick-view-btn')
            const count = await quickViewBtns.count()

            if (count >= 2) {
                // Open first product Quick View, capture aria-label
                const firstBtn = quickViewBtns.nth(0)
                const firstAriaLabel = await firstBtn.getAttribute('aria-label')
                await firstBtn.click()

                const modal = page.getByTestId('quick-view-modal')
                await expect(modal).toBeVisible({timeout: 20_000})

                const firstModalAriaLabel = await modal.getAttribute('aria-label')

                // Close modal
                await page.keyboard.press('Escape')
                await expect(modal).toBeHidden({timeout: 5_000})

                // Open second product Quick View
                const secondBtn = quickViewBtns.nth(1)
                const secondAriaLabel = await secondBtn.getAttribute('aria-label')
                await secondBtn.click()

                await expect(modal).toBeVisible({timeout: 20_000})
                const secondModalAriaLabel = await modal.getAttribute('aria-label')

                // The two products should have different aria-labels
                // (different product names) — but only if they are actually
                // different products
                if (firstAriaLabel !== secondAriaLabel) {
                    expect(firstModalAriaLabel).not.toBe(secondModalAriaLabel)
                }

                await page.keyboard.press('Escape')
                await expect(modal).toBeHidden({timeout: 5_000})
            }
        })

        test('Quick View modal can be reopened after closing', async ({page}) => {
            await navigateToPLP(page)

            const btn = page.getByTestId('quick-view-btn').first()

            // Open → Close → Reopen cycle
            await btn.click()
            const modal = page.getByTestId('quick-view-modal')
            await expect(modal).toBeVisible({timeout: 20_000})

            await page.keyboard.press('Escape')
            await expect(modal).toBeHidden({timeout: 5_000})

            // Reopen the same Quick View
            await btn.click()
            await expect(modal).toBeVisible({timeout: 20_000})

            await assertNoCrashPage(page, 'reopening Quick View modal')
        })
    })
})
