/*
 * Unit tests for QuickViewContext & QuickViewProvider
 * Binding contract: unit-tests.md §UT-PROV-*
 */
import React from 'react'
import {render, act} from '@testing-library/react'
import {QuickViewProvider, useQuickView} from './context'

// Helper component that exposes context values for assertions
const ContextConsumer = ({onContext}) => {
    const ctx = useQuickView()
    onContext(ctx)
    return null
}

const simpleProduct = {
    id: 'prod-123',
    name: 'Test Dress',
    price: 49.99,
    type: {}
}

describe('QuickViewProvider', () => {
    it('UT-PROV-001 — provider initial state: isOpen is false and openProduct is null', () => {
        let capturedCtx
        render(
            <QuickViewProvider>
                <ContextConsumer onContext={(ctx) => (capturedCtx = ctx)} />
            </QuickViewProvider>
        )

        expect(capturedCtx.isOpen).toBe(false)
        expect(capturedCtx.openProduct).toBeNull()
    })

    it('UT-PROV-002 — openQuickView(product) sets isOpen to true and openProduct to product', () => {
        let capturedCtx
        render(
            <QuickViewProvider>
                <ContextConsumer onContext={(ctx) => (capturedCtx = ctx)} />
            </QuickViewProvider>
        )

        act(() => {
            capturedCtx.openQuickView(simpleProduct)
        })

        expect(capturedCtx.isOpen).toBe(true)
        expect(capturedCtx.openProduct).toEqual(simpleProduct)
    })

    it('UT-PROV-003 — closeQuickView() resets state to closed', () => {
        let capturedCtx
        render(
            <QuickViewProvider>
                <ContextConsumer onContext={(ctx) => (capturedCtx = ctx)} />
            </QuickViewProvider>
        )

        // Open first
        act(() => {
            capturedCtx.openQuickView(simpleProduct)
        })
        expect(capturedCtx.isOpen).toBe(true)

        // Close
        act(() => {
            capturedCtx.closeQuickView()
        })

        expect(capturedCtx.isOpen).toBe(false)
        expect(capturedCtx.openProduct).toBeNull()
    })
})
