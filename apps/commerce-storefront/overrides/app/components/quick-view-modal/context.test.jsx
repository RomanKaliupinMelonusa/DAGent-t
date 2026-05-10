/*
 * Unit tests for QuickView Context & Provider
 * Test cases: UT-PROV-001, UT-PROV-002, UT-PROV-003
 */
import React from 'react'
import {renderHook, act} from '@testing-library/react'
import {QuickViewProvider, useQuickView} from './context'

const wrapper = ({children}) => <QuickViewProvider>{children}</QuickViewProvider>

const simpleProduct = {
    id: 'prod-simple-001',
    name: 'Classic Dress',
    price: 49.99,
    currency: 'USD',
    type: {}
}

describe('QuickView Provider & Context', () => {
    it('UT-PROV-001 — provider initial state', () => {
        const {result} = renderHook(() => useQuickView(), {wrapper})
        expect(result.current.isOpen).toBe(false)
        expect(result.current.openProduct).toBeNull()
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        const {result} = renderHook(() => useQuickView(), {wrapper})
        act(() => {
            result.current.openQuickView(simpleProduct)
        })
        expect(result.current.isOpen).toBe(true)
        expect(result.current.openProduct).toBe(simpleProduct)
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        const {result} = renderHook(() => useQuickView(), {wrapper})
        act(() => {
            result.current.openQuickView(simpleProduct)
        })
        expect(result.current.isOpen).toBe(true)
        act(() => {
            result.current.closeQuickView()
        })
        expect(result.current.isOpen).toBe(false)
        expect(result.current.openProduct).toBeNull()
    })
})
