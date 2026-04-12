/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import {isQuickViewEligible} from './quick-view'

describe('isQuickViewEligible', () => {
    test('returns true for a standard product with productId', () => {
        const product = {productId: 'prod-001', productName: 'Classic Shirt'}
        expect(isQuickViewEligible(product)).toBe(true)
    })

    test('returns true for a product with item type', () => {
        const product = {productId: 'prod-002', type: {item: true}}
        expect(isQuickViewEligible(product)).toBe(true)
    })

    test('returns false for null product', () => {
        expect(isQuickViewEligible(null)).toBe(false)
    })

    test('returns false for undefined product', () => {
        expect(isQuickViewEligible(undefined)).toBe(false)
    })

    test('returns false for product without productId', () => {
        const product = {productName: 'No ID Product'}
        expect(isQuickViewEligible(product)).toBe(false)
    })

    test('returns false for product with empty productId', () => {
        const product = {productId: '', productName: 'Empty ID'}
        expect(isQuickViewEligible(product)).toBe(false)
    })

    test('returns false for a product set', () => {
        const product = {productId: 'set-001', type: {set: true}}
        expect(isQuickViewEligible(product)).toBe(false)
    })

    test('returns false for a product bundle', () => {
        const product = {productId: 'bundle-001', type: {bundle: true}}
        expect(isQuickViewEligible(product)).toBe(false)
    })

    test('returns true when type exists but no excluded flags are set', () => {
        const product = {productId: 'prod-003', type: {variant: true, master: true}}
        expect(isQuickViewEligible(product)).toBe(true)
    })

    test('returns false when both set and bundle flags are true', () => {
        const product = {productId: 'combo-001', type: {set: true, bundle: true}}
        expect(isQuickViewEligible(product)).toBe(false)
    })

    test('returns true when excluded type flags are explicitly false', () => {
        const product = {productId: 'prod-004', type: {set: false, bundle: false}}
        expect(isQuickViewEligible(product)).toBe(true)
    })

    test('returns true when type is an empty object', () => {
        const product = {productId: 'prod-005', type: {}}
        expect(isQuickViewEligible(product)).toBe(true)
    })
})
