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
 * A product is **ineligible** if:
 * - It is `null` / `undefined`
 * - It has no `productId`
 * - Its type matches one of the excluded product types (sets, bundles)
 *
 * @param {Object|null|undefined} product - A ProductSearchHit or similar product object
 *   from the Shopper Search API. Expected shape:
 *   ```
 *   {
 *     productId: string,
 *     productName?: string,
 *     type?: { set?: boolean, bundle?: boolean, ... }
 *   }
 *   ```
 * @returns {boolean} `true` if the product can use Quick View, `false` otherwise
 *
 * @example
 * import {isQuickViewEligible} from '../utils/quick-view'
 *
 * // Standard product → eligible
 * isQuickViewEligible({ productId: '123', type: { item: true } }) // true
 *
 * // Product set → not eligible
 * isQuickViewEligible({ productId: '456', type: { set: true } })  // false
 *
 * // Missing product → not eligible
 * isQuickViewEligible(null)                                        // false
 */
export const isQuickViewEligible = (product) => {
    // Guard: product must exist and have an ID
    if (!product?.productId) {
        return false
    }

    // Guard: excluded product types (sets, bundles)
    const productType = product?.type
    if (productType) {
        const isExcluded = QUICK_VIEW_EXCLUDED_PRODUCT_TYPES.some(
            (excludedType) => productType[excludedType] === true
        )
        if (isExcluded) {
            return false
        }
    }

    return true
}
