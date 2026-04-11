/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/*
    Hello there! This is a demonstration of how to override a file from the base template.

    It's necessary that the module export interface remain consistent,
    as other files in the base template rely on constants.js, thus we
    import the underlying constants.js, modifies it and re-export it.
*/

export const CUSTOM_HOME_TITLE = '🎉 Hello Extensible React Template!'

// ─── Quick View Feature Constants ────────────────────────────────────────
// Shared data-testid values used by components (storefront-dev) and E2E tests (live-ui).
// Single source of truth prevents drift between implementation and test selectors.
export const QUICK_VIEW_TEST_IDS = Object.freeze({
    /** Button overlay on ProductTile that triggers the modal */
    BTN: 'quick-view-btn',
    /** The modal container element */
    MODAL: 'quick-view-modal',
    /** Loading spinner shown while product data fetches */
    SPINNER: 'quick-view-spinner'
})

// Product types that are excluded from Quick View in v1.
// Sets require `setProducts` expansion and bundles require `BundleProductViewModal`,
// neither of which renders correctly in the compact Quick View modal.
export const QUICK_VIEW_EXCLUDED_PRODUCT_TYPES = Object.freeze(['set', 'bundle'])

// Default Chakra Modal size for Quick View (maps to Chakra's Modal `size` prop).
export const QUICK_VIEW_MODAL_SIZE = '4xl'

// ProductView image size inside Quick View modal (passed as `imageSize` prop).
export const QUICK_VIEW_IMAGE_SIZE = 'sm'

export * from '@salesforce/retail-react-app/app/constants'
