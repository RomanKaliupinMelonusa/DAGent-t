/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {isQuickVieweligible, getQuickViewAriaLabel, getQuickViewModalAriaLabel} from './quick-view'

describe('isQuickVieweligible', () => {
    test('returns true for a standard product with productId', () => {
        expect(isQuickVieweligible({productId: '123'})).toBe(true)
    })

    test('returns true for a product with type but not set or bundle', () => {
        expect(isQuickVieweligible({productId: '123', type: {master: true}})).toBe(true)
    })

    test('returns false for a product set', () => {
        expect(isQuickVieweligible({productId: '123', type: {set: true}})).toBe(false)
    })

    test('returns false for a product bundle', () => {
        expect(isQuickVieweligible({productId: '123', type: {bundle: true}})).toBe(false)
    })

    test('returns false when productId is missing', () => {
        expect(isQuickVieweligible({name: 'No ID Product'})).toBe(false)
    })

    test('returns false for null product', () => {
        expect(isQuickVieweligible(null)).toBe(false)
    })

    test('returns false for undefined product', () => {
        expect(isQuickVieweligible(undefined)).toBe(false)
    })

    test('returns false when productId is empty string', () => {
        expect(isQuickVieweligible({productId: ''})).toBe(false)
    })
})

describe('getQuickViewAriaLabel', () => {
    test('returns label with productName', () => {
        expect(getQuickViewAriaLabel({productName: 'Diamond Ring'})).toBe(
            'Quick View Diamond Ring'
        )
    })

    test('falls back to name when productName is missing', () => {
        expect(getQuickViewAriaLabel({name: 'Silver Necklace'})).toBe(
            'Quick View Silver Necklace'
        )
    })

    test('prefers productName over name', () => {
        expect(
            getQuickViewAriaLabel({productName: 'Preferred', name: 'Fallback'})
        ).toBe('Quick View Preferred')
    })

    test('returns generic label when no name available', () => {
        expect(getQuickViewAriaLabel({})).toBe('Quick View')
    })

    test('returns generic label for null product', () => {
        expect(getQuickViewAriaLabel(null)).toBe('Quick View')
    })
})

describe('getQuickViewModalAriaLabel', () => {
    test('returns label with product name', () => {
        expect(getQuickViewModalAriaLabel({name: 'Test Shoes'}, null)).toBe(
            'Quick view for Test Shoes'
        )
    })

    test('falls back to searchHit productName', () => {
        expect(getQuickViewModalAriaLabel(null, {productName: 'Boots'})).toBe(
            'Quick view for Boots'
        )
    })

    test('falls back to searchHit name', () => {
        expect(getQuickViewModalAriaLabel(null, {name: 'Sandals'})).toBe(
            'Quick view for Sandals'
        )
    })

    test('returns generic label when no name available', () => {
        expect(getQuickViewModalAriaLabel(null, null)).toBe('Quick view for product')
    })

    test('returns generic label when both are empty objects', () => {
        expect(getQuickViewModalAriaLabel({}, {})).toBe('Quick view for product')
    })
})
