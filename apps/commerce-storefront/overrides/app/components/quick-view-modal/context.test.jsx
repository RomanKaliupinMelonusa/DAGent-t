/*
 * Unit tests for QuickViewContext & QuickViewProvider.
 *
 * Covers: UT-PROV-001, UT-PROV-002, UT-PROV-003
 */
import React from 'react'
import {render, act} from '@testing-library/react'
import '@testing-library/jest-dom'
import {QuickViewProvider, useQuickView} from './context'

// Helper component that exposes context values for assertions
const ContextConsumer = ({onContext}) => {
    const ctx = useQuickView()
    onContext(ctx)
    return null
}

describe('QuickViewProvider', () => {
    it('UT-PROV-001 — provider initial state (isOpen === false, openProduct === null)', () => {
        let captured
        render(
            <QuickViewProvider>
                <ContextConsumer onContext={(ctx) => (captured = ctx)} />
            </QuickViewProvider>
        )
        expect(captured.isOpen).toBe(false)
        expect(captured.openProduct).toBeNull()
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        const sampleProduct = {id: 'prod-123', name: 'Test Dress'}
        let captured
        render(
            <QuickViewProvider>
                <ContextConsumer onContext={(ctx) => (captured = ctx)} />
            </QuickViewProvider>
        )

        act(() => {
            captured.openQuickView(sampleProduct)
        })

        expect(captured.isOpen).toBe(true)
        expect(captured.openProduct).toBe(sampleProduct)
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        const sampleProduct = {id: 'prod-123', name: 'Test Dress'}
        let captured
        render(
            <QuickViewProvider>
                <ContextConsumer onContext={(ctx) => (captured = ctx)} />
            </QuickViewProvider>
        )

        act(() => {
            captured.openQuickView(sampleProduct)
        })
        expect(captured.isOpen).toBe(true)

        act(() => {
            captured.closeQuickView()
        })
        expect(captured.isOpen).toBe(false)
        expect(captured.openProduct).toBeNull()
    })
})
