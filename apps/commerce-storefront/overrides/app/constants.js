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

/**
 * Shared test IDs for the Quick View feature.
 * These form a contract between component implementation and E2E tests.
 */
export const QUICK_VIEW_TEST_IDS = {
    /** The overlay bar button on the product tile */
    BTN: 'quick-view-btn',
    /** The modal container */
    MODAL: 'quick-view-modal',
    /** Loading spinner inside the modal */
    SPINNER: 'quick-view-spinner',
    /** Error state when product is unavailable */
    ERROR: 'quick-view-error'
}

/**
 * Quick View modal configuration.
 * Shared between QuickViewModal component and any consumers.
 */
export const QUICK_VIEW_MODAL_CONFIG = {
    /** Chakra modal size for desktop viewports */
    SIZE: '4xl',
    /** ProductView image size prop within the modal */
    IMAGE_SIZE: 'sm'
}

// ─── End Quick View Constants ────────────────────────────────────────────

export * from '@salesforce/retail-react-app/app/constants'
