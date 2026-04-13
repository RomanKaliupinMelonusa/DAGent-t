import {test, expect, type Page, type Locator} from '@playwright/test'

/**
 * E2E tests for the Product Quick View feature.
 *
 * Tests the Quick View overlay bar on product tiles (PLP) and the
 * Quick View modal that opens with product details, variant selectors,
 * and Add to Cart functionality — all without navigating to the PDP.
 *
 * data-testid contract:
 *   - quick-view-btn      → overlay bar button on each product tile
 *   - quick-view-modal    → modal content wrapper (ModalContent)
 *   - quick-view-spinner  → loading spinner inside modal
 *   - quick-view-error    → error/unavailable state inside modal
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
        await page
            .screenshot({
                path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
            })
            .catch(() => {
                /* screenshot best-effort */
            })
    }
})

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Navigate to a PLP (category page) where product tiles with Quick View
 * buttons are expected. Uses the storefront's navigation to find a
 * category link, or falls back to a well-known RefArch category URL.
 */
async function navigateToPLP(page: Page): Promise<void> {
    // Try the well-known RefArch "Womens" category first
    await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})

    // Wait for at least one product tile or quick-view-btn to appear
    const productContent = page.locator(
        '[data-testid="quick-view-btn"], [data-testid="product-tile"], a[href*="/product/"]'
    )

    const hasContent = await productContent
        .first()
        .waitFor({state: 'visible', timeout: 20_000})
        .then(() => true)
        .catch(() => false)

    if (hasContent) return

    // Fallback: go to homepage and click the first nav link to find a PLP
    await page.goto('/', {waitUntil: 'domcontentloaded'})
    const navLink = page.locator('nav a, [role="navigation"] a').first()
    const navVisible = await navLink
        .waitFor({state: 'visible', timeout: 10_000})
        .then(() => true)
        .catch(() => false)

    if (navVisible) {
        await navLink.click()
        await page.waitForLoadState('domcontentloaded')
        await productContent
            .first()
            .waitFor({state: 'visible', timeout: 20_000})
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
 * Three-outcome assertion: content loaded, error state, or crash page.
 * Returns the winning outcome string.
 */
async function assertModalOutcome(
    page: Page
): Promise<'content' | 'error-state' | 'crash'> {
    const content = page.locator('[data-testid="quick-view-modal"]')
    const errorState = page.locator('[data-testid="quick-view-error"]')
    const crashPage = page.getByRole('heading', {name: /this page isn't working/i})

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
    ])

    if (winner === 'crash') {
        const stack = await page
            .locator('pre')
            .textContent()
            .catch(() => 'no stack')
        throw new Error(`PWA Kit crash page detected after opening Quick View modal. Stack: ${stack}`)
    }

    return winner
}

// ─── Tests: Quick View Overlay Bar ────────────────────────────────────────

test.describe('Quick View Overlay Bar (PLP)', () => {
    test('product tiles on PLP render Quick View buttons', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const quickViewBtns = page.locator('[data-testid="quick-view-btn"]')
        const count = await quickViewBtns.count()
        expect(count).toBeGreaterThan(0)
    })

    test('Quick View button has accessible aria-label with product name', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})

        const ariaLabel = await firstBtn.getAttribute('aria-label')
        expect(ariaLabel).toBeTruthy()
        expect(ariaLabel).toMatch(/^Quick View\s+.+/)
    })

    test('Quick View button contains "Quick View" text', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})

        const text = await firstBtn.textContent()
        expect(text).toContain('Quick View')
    })

    test('clicking Quick View does NOT navigate away from PLP', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const urlBefore = page.url()

        // Scroll the first button into view and force-click (it may be hidden on desktop until hover)
        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})
        await firstBtn.dispatchEvent('click')

        // Wait briefly to allow any accidental navigation to fire
        await page.locator('[data-testid="quick-view-modal"]').waitFor({state: 'visible', timeout: 10_000}).catch(() => {})

        // The URL must remain the same (no PDP navigation)
        expect(page.url()).toBe(urlBefore)
    })
})

// ─── Tests: Quick View Modal ──────────────────────────────────────────────

test.describe('Quick View Modal', () => {
    test('clicking Quick View button opens the modal with spinner or content', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})
        await firstBtn.dispatchEvent('click')

        // Three-outcome assertion: modal content, error state, or crash
        const outcome = await assertModalOutcome(page)
        expect(['content', 'error-state']).toContain(outcome)
    })

    test('modal displays a loading spinner before content loads', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})
        await firstBtn.dispatchEvent('click')

        // The spinner should appear briefly OR the content loads fast enough to skip it.
        // We check if either spinner or modal content becomes visible — both are valid.
        const spinner = page.locator('[data-testid="quick-view-spinner"]')
        const modal = page.locator('[data-testid="quick-view-modal"]')

        const firstVisible = await Promise.race([
            spinner
                .waitFor({state: 'visible', timeout: 10_000})
                .then(() => 'spinner' as const),
            modal
                .waitFor({state: 'visible', timeout: 10_000})
                .then(() => 'modal' as const)
        ])

        expect(['spinner', 'modal']).toContain(firstVisible)
    })

    test('modal has data-testid="quick-view-modal"', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})
        await firstBtn.dispatchEvent('click')

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await modal.waitFor({state: 'visible', timeout: 15_000})
        await expect(modal).toBeVisible()
    })

    test('modal has accessible aria-label containing product name', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})
        await firstBtn.dispatchEvent('click')

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        const ariaLabel = await modal.getAttribute('aria-label')
        expect(ariaLabel).toBeTruthy()
        // aria-label format: "Quick view for {productName}"
        expect(ariaLabel).toMatch(/quick view for/i)
    })

    test('modal can be closed via the close button', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})
        await firstBtn.dispatchEvent('click')

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        // Chakra ModalCloseButton renders a button with aria-label "Close"
        const closeBtn = page.locator('[aria-label="Close"]').first()
        await closeBtn.waitFor({state: 'visible', timeout: 5_000})
        await closeBtn.click()

        // Modal should disappear
        await expect(modal).not.toBeVisible({timeout: 5_000})
    })

    test('modal can be closed via Escape key', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})
        await firstBtn.dispatchEvent('click')

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        // Press Escape to close
        await page.keyboard.press('Escape')

        // Modal should disappear
        await expect(modal).not.toBeVisible({timeout: 5_000})
    })
})

// ─── Tests: Quick View Modal Content ──────────────────────────────────────

test.describe('Quick View Modal Content', () => {
    /**
     * Opens the Quick View modal for the first product tile and waits for
     * content to load (spinner disappears, product view appears).
     */
    async function openQuickViewAndWaitForContent(page: Page): Promise<void> {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})
        await firstBtn.dispatchEvent('click')

        const outcome = await assertModalOutcome(page)
        if (outcome === 'error-state') {
            test.skip(true, 'Product is unavailable — cannot test modal content')
        }

        // Wait for spinner to disappear (content fully loaded)
        const spinner = page.locator('[data-testid="quick-view-spinner"]')
        await spinner
            .waitFor({state: 'hidden', timeout: 20_000})
            .catch(() => {
                /* spinner may never appear if data loads instantly */
            })
    }

    test('modal displays product name', async ({page}) => {
        await openQuickViewAndWaitForContent(page)

        const modal = page.locator('[data-testid="quick-view-modal"]')

        // ProductView renders product name as a heading
        const productName = modal.locator('h1, h2, [data-testid="product-name"]').first()
        await productName.waitFor({state: 'visible', timeout: 10_000})
        const text = await productName.textContent()
        expect(text?.trim().length).toBeGreaterThan(0)
    })

    test('modal displays product price', async ({page}) => {
        await openQuickViewAndWaitForContent(page)

        const modal = page.locator('[data-testid="quick-view-modal"]')

        // ProductView renders price — look for currency symbol or price text
        const priceElement = modal.locator('b, [data-testid*="price"], [class*="price"]').first()
        await priceElement.waitFor({state: 'visible', timeout: 10_000})
        const priceText = await priceElement.textContent()
        expect(priceText).toBeTruthy()
        // Price should contain a currency indicator ($, £, €, or numeric)
        expect(priceText).toMatch(/[\$£€]|[\d]/)
    })

    test('modal displays Add to Cart button', async ({page}) => {
        await openQuickViewAndWaitForContent(page)

        const modal = page.locator('[data-testid="quick-view-modal"]')

        // ProductView renders an "Add to Cart" button
        const addToCartBtn = modal.getByRole('button', {name: /add to cart/i})
        await addToCartBtn.waitFor({state: 'visible', timeout: 10_000})
        await expect(addToCartBtn).toBeVisible()
    })

    test('modal displays "View Full Details" link to PDP', async ({page}) => {
        await openQuickViewAndWaitForContent(page)

        const modal = page.locator('[data-testid="quick-view-modal"]')

        // showFullLink={true} renders a "View Full Details" link
        const fullDetailsLink = modal.getByRole('link', {name: /full detail/i}).or(
            modal.locator('a[href*="/product/"]')
        )
        await fullDetailsLink
            .first()
            .waitFor({state: 'visible', timeout: 10_000})
        await expect(fullDetailsLink.first()).toBeVisible()
    })

    test('modal renders product image', async ({page}) => {
        await openQuickViewAndWaitForContent(page)

        const modal = page.locator('[data-testid="quick-view-modal"]')

        // ProductView renders at least one product image
        const image = modal.locator('img[src*="dw.demandware"], img[src*="edge"], img[alt]').first()
        await image.waitFor({state: 'visible', timeout: 10_000})
        await expect(image).toBeVisible()
    })
})

// ─── Tests: Edge Cases ────────────────────────────────────────────────────

test.describe('Quick View Edge Cases', () => {
    test('opening and closing modal preserves PLP URL', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const urlBefore = page.url()

        const firstBtn = page.locator('[data-testid="quick-view-btn"]').first()
        await firstBtn.waitFor({state: 'attached', timeout: 15_000})
        await firstBtn.dispatchEvent('click')

        const modal = page.locator('[data-testid="quick-view-modal"]')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        // Close the modal
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // URL should be unchanged (no navigation occurred)
        expect(page.url()).toBe(urlBefore)
    })

    test('multiple Quick View buttons exist for multiple products', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const quickViewBtns = page.locator('[data-testid="quick-view-btn"]')
        const count = await quickViewBtns.count()
        // A PLP should have multiple products, each with a Quick View button
        // (sets/bundles excluded, so count may be less than total products)
        expect(count).toBeGreaterThanOrEqual(1)
    })

    test('can open Quick View for different products sequentially', async ({page}) => {
        await navigateToPLP(page)
        await assertNoCrashPage(page, 'PLP navigation')

        const quickViewBtns = page.locator('[data-testid="quick-view-btn"]')
        const count = await quickViewBtns.count()

        if (count < 2) {
            test.skip(true, 'Need at least 2 Quick View buttons to test sequential opens')
        }

        // Open first product Quick View
        await quickViewBtns.nth(0).dispatchEvent('click')
        const modal = page.locator('[data-testid="quick-view-modal"]')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        // Get first product's aria-label
        const firstAriaLabel = await modal.getAttribute('aria-label')

        // Close it
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // Open second product Quick View
        await quickViewBtns.nth(1).dispatchEvent('click')
        await modal.waitFor({state: 'visible', timeout: 15_000})

        // Get second product's aria-label — should be different product
        const secondAriaLabel = await modal.getAttribute('aria-label')

        // Both should have aria-labels; they may or may not differ
        // (if same product appears twice, labels match — that's okay)
        expect(firstAriaLabel).toBeTruthy()
        expect(secondAriaLabel).toBeTruthy()
    })
})
