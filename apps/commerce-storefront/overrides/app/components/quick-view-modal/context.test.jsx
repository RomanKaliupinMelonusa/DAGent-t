import "@testing-library/jest-dom"
/*
 * Unit tests for QuickViewContext / QuickViewProvider / useQuickView
 * Contract: contracts/quick-view-context.md
 * Cases: UT-PROV-001, UT-PROV-002, UT-PROV-003
 */
import React from 'react'
import {render, screen, act} from '@testing-library/react'
import {QuickViewProvider, useQuickView} from './context'

// A small consumer component so we can inspect context values in tests
const ContextConsumer = ({onContext}) => {
    const ctx = useQuickView()
    React.useEffect(() => {
        onContext(ctx)
    })
    return (
        <div>
            <span data-testid="is-open">{String(ctx.isOpen)}</span>
            <span data-testid="open-product">{JSON.stringify(ctx.openProduct)}</span>
        </div>
    )
}

const sampleProduct = {
    id: 'prod-123',
    name: 'Sample Dress',
    price: 59.99
}

describe('QuickViewProvider', () => {
    it('UT-PROV-001 — provider initial state: isOpen is false and openProduct is null', () => {
        let captured
        render(
            <QuickViewProvider>
                <ContextConsumer onContext={(ctx) => (captured = ctx)} />
            </QuickViewProvider>
        )

        expect(screen.getByTestId('is-open').textContent).toBe('false')
        expect(screen.getByTestId('open-product').textContent).toBe('null')
        expect(captured.isOpen).toBe(false)
        expect(captured.openProduct).toBeNull()
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
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
        let captured
        render(
            <QuickViewProvider>
                <ContextConsumer onContext={(ctx) => (captured = ctx)} />
            </QuickViewProvider>
        )

        // First open
        act(() => {
            captured.openQuickView(sampleProduct)
        })
        expect(captured.isOpen).toBe(true)

        // Then close
        act(() => {
            captured.closeQuickView()
        })
        expect(captured.isOpen).toBe(false)
        expect(captured.openProduct).toBeNull()
    })
})
