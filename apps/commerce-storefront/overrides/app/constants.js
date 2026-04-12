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

// ---------------------------------------------------------------------------
// Quick View feature constants
// ---------------------------------------------------------------------------

/**
 * Centralized test IDs for the Quick View feature.
 * Used by both component implementations and test assertions (unit + E2E).
 */
export const QUICK_VIEW_TEST_IDS = {
    /** The "Quick View" button rendered on each eligible ProductTile */
    button: 'quick-view-btn',
    /** The Chakra Modal container for the quick view */
    modal: 'quick-view-modal',
    /** The loading spinner shown while product data is being fetched */
    spinner: 'quick-view-spinner'
}

/**
 * Chakra UI Modal size for the Quick View dialog.
 * '4xl' provides enough room for ProductView (image gallery + variant selectors)
 * without overtaking the entire viewport.
 */
export const QUICK_VIEW_MODAL_SIZE = '4xl'

/**
 * Product types that are excluded from Quick View.
 * Sets and bundles require specialized modal handling (BundleProductViewModal)
 * that is out of scope for v1.
 */
export const QUICK_VIEW_EXCLUDED_PRODUCT_TYPES = ['set', 'bundle']

export * from '@salesforce/retail-react-app/app/constants'
