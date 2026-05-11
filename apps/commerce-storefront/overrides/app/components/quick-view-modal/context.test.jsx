/*
 * Unit tests for QuickViewProvider / useQuickView context.
 * Cases: UT-PROV-001, UT-PROV-002, UT-PROV-003
 */
import React from 'react'
import {render, act} from '@testing-library/react'
import '@testing-library/jest-dom'
import {QuickViewProvider, useQuickView} from './context'

// Helper component to expose context values for assertions
const ContextConsumer = ({onContext}) => {
    const ctx = useQuickView()
    // Expose context to the test via a ref callback
    React.useEffect(() => {
        onContext(ctx)
    })
    return (
        <div>
            <span data-testid="isOpen">{String(ctx.isOpen)}</span>
            <span data-testid="openProduct">{JSON.stringify(ctx.openProduct)}</span>
        </div>
    )
}

const sampleProduct = {
    id: 'prod-123',
    name: 'Test Dress',
    price: 49.99
}

describe('QuickViewProvider', () => {
    let latestContext

    const renderProvider = () => {
        const result = render(
            <QuickViewProvider>
                <ContextConsumer onContext={(ctx) => { latestContext = ctx }} />
            </QuickViewProvider>
        )
        return result
    }

    beforeEach(() => {
        latestContext = null
    })

    it('UT-PROV-001 — provider initial state: isOpen is false and openProduct is null', () => {
        const {getByTestId} = renderProvider()
        expect(getByTestId('isOpen').textContent).toBe('false')
        expect(getByTestId('openProduct').textContent).toBe('null')
    })

    it('UT-PROV-002 — openQuickView(product) sets isOpen to true and openProduct to that product', () => {
        const {getByTestId} = renderProvider()

        act(() => {
            latestContext.openQuickView(sampleProduct)
        })

        expect(getByTestId('isOpen').textContent).toBe('true')
        expect(JSON.parse(getByTestId('openProduct').textContent)).toEqual(sampleProduct)
    })

    it('UT-PROV-003 — closeQuickView() resets isOpen to false and openProduct to null', () => {
        const {getByTestId} = renderProvider()

        // First open
        act(() => {
            latestContext.openQuickView(sampleProduct)
        })
        expect(getByTestId('isOpen').textContent).toBe('true')

        // Then close
        act(() => {
            latestContext.closeQuickView()
        })
        expect(getByTestId('isOpen').textContent).toBe('false')
        expect(getByTestId('openProduct').textContent).toBe('null')
    })
})
