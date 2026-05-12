/*
 * Unit tests for QuickViewContext / QuickViewProvider / useQuickView.
 *
 * Covers: UT-PROV-001, UT-PROV-002, UT-PROV-003
 */
import React from 'react'
import {render, act} from '@testing-library/react'
import '@testing-library/jest-dom'
import {QuickViewProvider, useQuickView} from './context'

// ---------------------------------------------------------------------------
// Fixtures (inline per strict-rule-following — no shared fixture module)
// ---------------------------------------------------------------------------
const simpleProduct = {
    id: 'prod-simple-001',
    name: 'Simple Dress',
    price: 49.99,
    type: {}
}

// ---------------------------------------------------------------------------
// Helper: renders a consumer that exposes context values via refs
// ---------------------------------------------------------------------------
const TestConsumer = ({actionsRef}) => {
    const ctx = useQuickView()
    // Expose the whole context so tests can read and call
    actionsRef.current = ctx
    return (
        <div>
            <span data-testid="is-open">{String(ctx.isOpen)}</span>
            <span data-testid="open-product">{ctx.openProduct ? ctx.openProduct.id : 'null'}</span>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('QuickViewProvider', () => {
    it('UT-PROV-001 — provider initial state (isOpen === false, openProduct === null)', () => {
        const actionsRef = {current: null}
        const {getByTestId} = render(
            <QuickViewProvider>
                <TestConsumer actionsRef={actionsRef} />
            </QuickViewProvider>
        )

        expect(getByTestId('is-open')).toHaveTextContent('false')
        expect(getByTestId('open-product')).toHaveTextContent('null')
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        const actionsRef = {current: null}
        const {getByTestId} = render(
            <QuickViewProvider>
                <TestConsumer actionsRef={actionsRef} />
            </QuickViewProvider>
        )

        act(() => {
            actionsRef.current.openQuickView(simpleProduct)
        })

        expect(getByTestId('is-open')).toHaveTextContent('true')
        expect(getByTestId('open-product')).toHaveTextContent(simpleProduct.id)
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        const actionsRef = {current: null}
        const {getByTestId} = render(
            <QuickViewProvider>
                <TestConsumer actionsRef={actionsRef} />
            </QuickViewProvider>
        )

        // Open first
        act(() => {
            actionsRef.current.openQuickView(simpleProduct)
        })
        expect(getByTestId('is-open')).toHaveTextContent('true')

        // Close
        act(() => {
            actionsRef.current.closeQuickView()
        })
        expect(getByTestId('is-open')).toHaveTextContent('false')
        expect(getByTestId('open-product')).toHaveTextContent('null')
    })
})
