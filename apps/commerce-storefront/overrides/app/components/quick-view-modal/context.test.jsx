/*
 * Unit tests for QuickViewContext / QuickViewProvider.
 *
 * Cases: UT-PROV-001, UT-PROV-002, UT-PROV-003
 * Contract: contracts/quick-view-context.md
 */
import React from 'react'
import {render, act} from '@testing-library/react'
import '@testing-library/jest-dom/extend-expect'
import {QuickViewProvider, useQuickView} from './context'

// ── Fixtures (inline per T002 — no shared module) ──────────────────────────
const simpleProduct = {
    id: 'prod-simple-001',
    productId: 'prod-simple-001',
    name: 'Simple Dress',
    price: 49.99,
    type: {set: false, bundle: false}
}

// ── Helper: renders a consumer that exposes context values ──────────────────
const ContextConsumer = ({onRender}) => {
    const ctx = useQuickView()
    onRender(ctx)
    return null
}

describe('QuickViewProvider', () => {
    it('UT-PROV-001 — provider initial state (isOpen false, openProduct null)', () => {
        let capturedCtx
        render(
            <QuickViewProvider>
                <ContextConsumer onRender={(ctx) => (capturedCtx = ctx)} />
            </QuickViewProvider>
        )
        expect(capturedCtx.isOpen).toBe(false)
        expect(capturedCtx.openProduct).toBeNull()
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        let capturedCtx
        render(
            <QuickViewProvider>
                <ContextConsumer onRender={(ctx) => (capturedCtx = ctx)} />
            </QuickViewProvider>
        )
        act(() => {
            capturedCtx.openQuickView(simpleProduct)
        })
        expect(capturedCtx.isOpen).toBe(true)
        expect(capturedCtx.openProduct).toBe(simpleProduct)
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        let capturedCtx
        render(
            <QuickViewProvider>
                <ContextConsumer onRender={(ctx) => (capturedCtx = ctx)} />
            </QuickViewProvider>
        )
        act(() => {
            capturedCtx.openQuickView(simpleProduct)
        })
        expect(capturedCtx.isOpen).toBe(true)

        act(() => {
            capturedCtx.closeQuickView()
        })
        expect(capturedCtx.isOpen).toBe(false)
        expect(capturedCtx.openProduct).toBeNull()
    })
})
