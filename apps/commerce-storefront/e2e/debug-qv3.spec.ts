import {test, expect} from '@playwright/test'

test('debug modal HTML', async ({page}) => {
    await page.goto('/category/womens', {waitUntil: 'domcontentloaded'})
    
    // Dismiss consent
    const closeBtn = page.locator('button[aria-label="Close consent tracking form"]')
    try { 
        await closeBtn.waitFor({state: 'visible', timeout: 5_000})
        await closeBtn.click()
        await closeBtn.waitFor({state: 'hidden', timeout: 3_000})
    } catch {}
    
    await page.locator('[data-testid^="sf-product-tile-"]').first().waitFor({state: 'visible', timeout: 20_000})
    
    // Try tile index 1 (skip the first which crashes)
    const wrappers = page.locator('[role="group"]').filter({has: page.locator('[data-testid="quick-view-btn"]')})
    const wrapper = wrappers.nth(1)
    await wrapper.hover()
    await wrapper.locator('[data-testid="quick-view-btn"]').click()
    
    // Wait for modal
    const modal = page.locator('[data-testid="quick-view-modal"]')
    await expect(modal).toBeVisible({timeout: 10_000})
    
    // Wait for spinner
    const spinner = modal.locator('[data-testid="quick-view-spinner"]')
    try {
        if (await spinner.isVisible({timeout: 2_000})) {
            await spinner.waitFor({state: 'hidden', timeout: 15_000})
        }
    } catch {}
    
    // Wait extra for content to render
    await page.waitForTimeout(3000)
    
    // Check what's inside the modal
    const modalHtml = await modal.innerHTML()
    console.log('=== MODAL HTML (first 1500 chars) ===')
    console.log(modalHtml.substring(0, 1500))
    
    // Check for h1, h2 tags
    const headings = await modal.locator('h1, h2').allTextContents()
    console.log('=== H1/H2 headings:', headings)
    
    // Check for role="heading"
    const ariaHeadings = await modal.locator('[role="heading"]').allTextContents()
    console.log('=== ARIA headings:', ariaHeadings)
    
    // Check for product name
    const productNames = await modal.locator('[data-testid="product-name"]').allTextContents()
    console.log('=== Product names:', productNames)
})
