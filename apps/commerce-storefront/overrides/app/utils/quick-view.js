/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {QUICK_VIEW_EXCLUDED_PRODUCT_TYPES} from '../constants'

/**
 * Determines whether a product is eligible for the Quick View modal.
 *
 * A product is ineligible when:
 *  - It has no `productId` (missing/corrupt data from search results)
 *  - Its type is in QUICK_VIEW_EXCLUDED_PRODUCT_TYPES (sets, bundles)
 *
 * @param {Object|null|undefined} product - A ProductSearchHit from the SCAPI search response.
 * @returns {boolean} `true` if the Quick View button should be rendered for this product.
 */
export const isQuickViewEligible = (product) => {
    // Guard: missing product or missing product ID
    if (!product?.productId) {
        return false
    }

    // Guard: excluded product types (sets, bundles)
    // The `type` object on a ProductSearchHit has boolean keys like `set`, `bundle`, `master`, etc.
    const productType = product?.type
    if (productType) {
        for (const excludedType of QUICK_VIEW_EXCLUDED_PRODUCT_TYPES) {
            if (productType[excludedType] === true) {
                return false
            }
        }
    }

    return true
}

/**
 * Builds an accessible aria-label string for the Quick View button.
 *
 * @param {Object|null|undefined} product - A ProductSearchHit.
 * @returns {string} Formatted aria-label, e.g. "Quick View Test Shoes"
 */
export const getQuickViewAriaLabel = (product) => {
    const name = product?.productName || product?.name || ''
    return `Quick View ${name}`.trim()
}
