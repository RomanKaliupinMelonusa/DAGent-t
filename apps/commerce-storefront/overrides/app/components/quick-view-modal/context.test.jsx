/*
 * Unit tests for QuickViewProvider / useQuickView context.
 * Contract: unit-tests.md §3 — Provider & state (UT-PROV-001..003)
 */
import React from 'react'
import {render, act} from '@testing-library/react'
import {QuickViewProvider, useQuickView} from './context'

// ---------------------------------------------------------------------------
// Fixtures (inlined per task T002 — no shared fixture module)
// ---------------------------------------------------------------------------
const simpleProduct = {
    id: 'prod-simple-001',
    productId: 'prod-simple-001',
    name: 'Simple Dress',
    price: 49.99,
    type: {set: false, bundle: false}
}

// ---------------------------------------------------------------------------
// Helper: renders a consumer that exposes context values via refs
// ---------------------------------------------------------------------------
const ContextConsumer = ({onContext}) => {
    const ctx = useQuickView()
    // Expose current context for assertions
    onContext(ctx)
    return null
}

describe('QuickViewProvider', () => {
    let latestCtx

    const renderProvider = () => {
        return render(
            <QuickViewProvider>
                <ContextConsumer
                    onContext={(ctx) => {
                        latestCtx = ctx
                    }}
                />
            </QuickViewProvider>
        )
    }

    beforeEach(() => {
        latestCtx = null
    })

    it('UT-PROV-001 — provider initial state: isOpen is false and openProduct is null', () => {
        renderProvider()

        expect(latestCtx.isOpen).toBe(false)
        expect(latestCtx.openProduct).toBeNull()
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        renderProvider()

        act(() => {
            latestCtx.openQuickView(simpleProduct)
        })

        expect(latestCtx.isOpen).toBe(true)
        expect(latestCtx.openProduct).toBe(simpleProduct)
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        renderProvider()

        act(() => {
            latestCtx.openQuickView(simpleProduct)
        })
        expect(latestCtx.isOpen).toBe(true)

        act(() => {
            latestCtx.closeQuickView()
        })

        expect(latestCtx.isOpen).toBe(false)
        expect(latestCtx.openProduct).toBeNull()
    })
})
