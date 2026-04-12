/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Determines whether a product is eligible for Quick View.
 *
 * A product is eligible when:
 * - It has a valid `productId`
 * - It is NOT a product set (`product.type.set !== true`)
 * - It is NOT a product bundle (`product.type.bundle !== true`)
 *
 * Product sets and bundles require specialised modal handling
 * (BundleProductViewModal) that is out of scope for Quick View v1.
 *
 * @param {Object|null|undefined} product - A ProductSearchHit or product object
 * @returns {boolean} true if the product supports Quick View
 */
export const isQuickVieweligible = (product) => {
    if (!product?.productId) {
        return false
    }
    if (product?.type?.set === true) {
        return false
    }
    if (product?.type?.bundle === true) {
        return false
    }
    return true
}

/**
 * Returns a descriptive aria-label for the Quick View trigger button.
 *
 * Falls back to a generic label when the product name is unavailable.
 *
 * @param {Object|null|undefined} product - A ProductSearchHit or product object
 * @returns {string} Accessible label for the Quick View button
 */
export const getQuickViewAriaLabel = (product) => {
    const name = product?.productName || product?.name || ''
    return name ? `Quick View ${name}` : 'Quick View'
}

/**
 * Returns an accessible aria-label for the Quick View modal.
 *
 * @param {Object|null|undefined} product - The full product object from useProductViewModal
 * @param {Object|null|undefined} searchHit - The original ProductSearchHit (fallback name source)
 * @returns {string} Accessible label for the modal
 */
export const getQuickViewModalAriaLabel = (product, searchHit) => {
    const name = product?.name || searchHit?.productName || searchHit?.name || 'product'
    return `Quick view for ${name}`
}
