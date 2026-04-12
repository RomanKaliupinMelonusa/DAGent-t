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

// ─── Quick View Feature Constants ────────────────────────────────────────────
// Shared data contract for the product-quick-view feature.
// Consumed by: product-tile override, quick-view-modal component, unit tests, E2E tests.

/**
 * Test IDs — single source of truth for data-testid attributes.
 * Used in component code, Jest unit tests, and Playwright E2E selectors.
 */
export const QUICK_VIEW_TEST_IDS = {
    /** The overlay bar button on the product tile */
    TRIGGER_BTN: 'quick-view-btn',
    /** The modal content wrapper */
    MODAL: 'quick-view-modal',
    /** Loading spinner shown while product data is fetching */
    SPINNER: 'quick-view-spinner',
    /** Error state shown when product is unavailable */
    ERROR: 'quick-view-error'
}

/**
 * Quick View modal configuration.
 * Centralised so tile and modal components share identical values.
 */
export const QUICK_VIEW_CONFIG = {
    /** Chakra UI Modal `size` prop — 4xl (~896px) for desktop */
    MODAL_SIZE: '4xl',
    /** ProductView `imageSize` prop — compact gallery for modal context */
    IMAGE_SIZE: 'sm',
    /** Whether to show "View Full Details" link inside the modal */
    SHOW_FULL_LINK: true
}

/**
 * Quick View overlay bar style tokens.
 * Keeps visual specs in sync between the product-tile override and tests.
 */
export const QUICK_VIEW_OVERLAY = {
    /** Semi-transparent dark background */
    BG: 'rgba(0, 0, 0, 0.6)',
    /** Darker background on active/press */
    BG_ACTIVE: 'rgba(0, 0, 0, 0.75)',
    /** Frosted glass blur behind the bar */
    BACKDROP_FILTER: 'blur(2px)',
    /** Z-index: above image, below favourite icon */
    Z_INDEX: 1,
    /** CSS transition for slide + fade animation */
    TRANSITION: 'all 0.25s ease-in-out'
}

export * from '@salesforce/retail-react-app/app/constants'
