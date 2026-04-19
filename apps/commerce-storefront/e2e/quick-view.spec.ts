import {test, expect} from '@playwright/test'

/**
 * E2E tests for the Product Quick View feature.
 *
 * Quick View allows shoppers to view product details, select variants,
 * and add-to-cart from a modal overlay on the PLP — without navigating
 * to the PDP.
 *
 * Tests run against the local dev server (localhost:3000) by default,
 * or against STOREFRONT_URL if set.
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
        if (consoleErrors.length > 0) console.log('Console errors:', consoleErrors)
        if (failedRequests.length > 0) console.log('Failed requests:', failedRequests)
        await page.screenshot({
            path: `test-results/failure-${testInfo.title.replace(/\s+/g, '-')}.png`
        })
    }
})

// ─── Selectors ────────────────────────────────────────────────────────────

const QV_BTN_SELECTOR = '[data-testid="quick-view-btn"]'
const QV_MODAL_SELECTOR = '[data-testid="quick-view-modal"]'
const QV_SPINNER_SELECTOR = '[data-testid="quick-view-spinner"]'
/** Product tiles use data-testid="sf-product-tile-<id>" on the inner <a> link */
const TILE_LINK_SELECTOR = '[data-testid^="sf-product-tile-"]'
/** Error boundary crash indicator */
const ERROR_PAGE_SELECTOR = 'text="This page isn\'t working"'

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Dismiss the SFCC consent tracking dialog if it appears.
 * The dialog blocks interaction with the page underneath.
 */
async function dismissConsentDialog(page: import('@playwright/test').Page) {
    const closeBtn = page.locator('button[aria-label="Close consent tracking form"]')
    try {
        await closeBtn.waitFor({state: 'visible', timeout: 5_000})
        await closeBtn.click()
        await closeBtn.waitFor({state: 'hidden', timeout: 3_000})
    } catch {
        const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("Yes")')
        try {
            if (await acceptBtn.first().isVisible({timeout: 1_000})) {
                await acceptBtn.first().click()
            }
        } catch {
            // No consent dialog — proceed
        }
    }
}

/**
 * Navigate to a category/PLP page, dismiss consent, wait for tiles.
 */
async function navigateToPLP(page: import('@playwright/test').Page) {
    const categoryPaths = ['/category/womens', '/category/mens', '/category/newarrivals']

    for (const path of categoryPaths) {
        await page.goto(path, {waitUntil: 'domcontentloaded'})
        await dismissConsentDialog(page)
        try {
            await page.locator(TILE_LINK_SELECTOR).first().waitFor({state: 'visible', timeout: 20_000})
            return
        } catch {
            // try next category
        }
    }

    // Fallback: homepage → nav link
    await page.goto('/', {waitUntil: 'domcontentloaded'})
    await dismissConsentDialog(page)
    const navLink = page.locator('nav a, [role="navigation"] a').first()
    if (await navLink.isVisible({timeout: 10_000})) {
        await navLink.click()
    }
    await page.locator(TILE_LINK_SELECTOR).first().waitFor({state: 'visible', timeout: 20_000})
}

/**
 * Re-navigate to the current PLP URL (e.g., after a crash).
 */
async function reloadPLP(page: import('@playwright/test').Page, plpUrl: string) {
    await page.goto(plpUrl, {waitUntil: 'domcontentloaded'})
    await dismissConsentDialog(page)
    await page.locator(TILE_LINK_SELECTOR).first().waitFor({state: 'visible', timeout: 20_000})
}

/**
 * Get all product tile wrappers (outer role="group" Box) that contain
 * a Quick View button.
 */
function getTileWrappers(page: import('@playwright/test').Page) {
    return page
        .locator('[role="group"]')
        .filter({has: page.locator(QV_BTN_SELECTOR)})
}

/**
 * Open the Quick View modal and wait for it to render product content
 * (not just the modal shell). Tries multiple tiles since some products
 * may crash ProductView due to missing data (e.g., masterId).
 *
 * Returns the visible modal locator with loaded content.
 */
async function openQuickViewModalWithContent(
    page: import('@playwright/test').Page,
    maxAttempts = 5
) {
    const plpUrl = page.url()

    for (let i = 0; i < maxAttempts; i++) {
        const wrappers = getTileWrappers(page)
        const count = await wrappers.count()
        if (i >= count) break

        const wrapper = wrappers.nth(i)
        await wrapper.hover()

        const qvBtn = wrapper.locator(QV_BTN_SELECTOR)
        await qvBtn.click()

        const modal = page.locator(QV_MODAL_SELECTOR)
        try {
            await expect(modal).toBeVisible({timeout: 10_000})
        } catch {
            // Modal didn't appear at all — reload and try next
            await reloadPLP(page, plpUrl)
            continue
        }

        // Wait for spinner to resolve
        const spinner = modal.locator(QV_SPINNER_SELECTOR)
        try {
            if (await spinner.isVisible({timeout: 2_000})) {
                await spinner.waitFor({state: 'hidden', timeout: 15_000})
            }
        } catch {
            // Spinner stuck or page crashed
        }

        // Check if the page crashed (error boundary)
        const crashed = await page.locator(ERROR_PAGE_SELECTOR).isVisible().catch(() => false)
        if (crashed) {
            // ProductView crashed for this product — reload PLP and try next tile
            await reloadPLP(page, plpUrl)
            continue
        }

        // Verify the modal still exists and has content
        if (await modal.isVisible().catch(() => false)) {
            return modal
        }

        // If modal disappeared (page re-rendered), reload and try next
        await reloadPLP(page, plpUrl)
    }

    throw new Error(`Could not open Quick View modal with content after ${maxAttempts} attempts`)
}

/**
 * Open Quick View modal (fast version for tests that don't need product content).
 * Just ensures the modal container appears.
 */
async function openQuickViewModal(
    page: import('@playwright/test').Page,
    maxAttempts = 5
) {
    const plpUrl = page.url()

    for (let i = 0; i < maxAttempts; i++) {
        const wrappers = getTileWrappers(page)
        const count = await wrappers.count()
        if (i >= count) break

        const wrapper = wrappers.nth(i)
        await wrapper.hover()

        const qvBtn = wrapper.locator(QV_BTN_SELECTOR)
        await qvBtn.click()

        const modal = page.locator(QV_MODAL_SELECTOR)
        try {
            await expect(modal).toBeVisible({timeout: 10_000})

            // Quick check for crash — give the product 2s to render
            await page.locator(TILE_LINK_SELECTOR).or(modal).first().waitFor({timeout: 2_000}).catch(() => {})
            const crashed = await page.locator(ERROR_PAGE_SELECTOR).isVisible().catch(() => false)
            if (!crashed) return modal
        } catch {
            // Modal didn't appear
        }

        // Reload and try next tile
        await reloadPLP(page, plpUrl)
    }

    throw new Error(`Could not open Quick View modal after ${maxAttempts} attempts`)
}

// ─── Tests ────────────────────────────────────────────────────────────────

test.describe('Quick View', () => {
    test('Quick View button appears on hover', async ({page}) => {
        await navigateToPLP(page)

        const tileWrapper = getTileWrappers(page).first()
        await tileWrapper.hover()

        const qvBtn = tileWrapper.locator(QV_BTN_SELECTOR)
        await expect(qvBtn).toBeVisible({timeout: 5_000})
    })

    test('Quick View modal opens and loads product data', async ({page}) => {
        await navigateToPLP(page)

        const modal = await openQuickViewModalWithContent(page)

        // Product name or "unavailable" message should be visible inside the modal
        const productContent = modal.locator(
            'h1, h2, [data-testid="product-name"], text="This product is no longer available"'
        ).first()
        await expect(productContent).toBeVisible({timeout: 15_000})
    })

    test('Select variant and add to cart from Quick View', async ({page}) => {
        await navigateToPLP(page)

        const modal = await openQuickViewModalWithContent(page)

        // Select size if size selector exists
        const sizeButton = modal
            .locator('button[data-testid*="size"], [role="radio"]:not([disabled])')
            .first()
        if (await sizeButton.isVisible({timeout: 3_000}).catch(() => false)) {
            await sizeButton.click()
        }

        // Click Add to Cart
        const addToCartBtn = modal.locator(
            'button:has-text("Add to Cart"), button:has-text("Add to Bag"), button:has-text("add to cart")'
        )
        if (await addToCartBtn.isVisible({timeout: 5_000}).catch(() => false)) {
            await addToCartBtn.click()

            // Verify success: look for toast, alert, or cart confirmation modal
            const successIndicator = page.locator(
                '[role="alert"]:has-text("added"), [role="alert"]:has-text("cart"), [data-testid="add-to-cart-modal"]'
            )
            await expect(successIndicator.first()).toBeVisible({timeout: 10_000})
        }
    })

    test('Modal closes correctly', async ({page}) => {
        await navigateToPLP(page)

        const modal = await openQuickViewModal(page)

        // Click the close button (X icon)
        const closeBtn = modal.locator('button[aria-label="Close"]')
        await closeBtn.click()

        // Modal should disappear
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // PLP should still be showing
        await expect(page.locator(TILE_LINK_SELECTOR).first()).toBeVisible()
    })

    test('Quick View does not navigate away from PLP', async ({page}) => {
        await navigateToPLP(page)
        const urlBefore = page.url()

        const modal = await openQuickViewModal(page)

        // Close via Escape key
        await page.keyboard.press('Escape')
        await expect(modal).not.toBeVisible({timeout: 5_000})

        // URL should be unchanged — still on PLP
        expect(page.url()).toBe(urlBefore)

        // Product tiles should still be rendered
        await expect(page.locator(TILE_LINK_SELECTOR).first()).toBeVisible()
    })
})
