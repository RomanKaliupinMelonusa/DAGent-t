/*
 * Unit tests for QuickViewProvider / useQuickView context.
 * Cases: UT-PROV-001, UT-PROV-002, UT-PROV-003
 */
import React from 'react'
import {render, screen, act} from '@testing-library/react'
import '@testing-library/jest-dom'
import {QuickViewProvider, useQuickView} from './context'

// Mock the modal shell so it doesn't pull in the entire dependency tree
jest.mock('./modal-shell', () => {
    const MockShell = () => <div data-testid="mock-shell" />
    MockShell.displayName = 'MockQuickViewModalShell'
    return MockShell
})

// A helper component that exposes context values for assertions
const ContextInspector = ({onContext}) => {
    const ctx = useQuickView()
    // Expose context to the test via a callback ref
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

const simpleProduct = {
    id: 'prod-001',
    productId: 'prod-001',
    name: 'Simple Dress',
    type: {set: false, bundle: false}
}

describe('QuickViewProvider', () => {
    let latestContext

    const renderProvider = () => {
        return render(
            <QuickViewProvider>
                <ContextInspector onContext={(ctx) => (latestContext = ctx)} />
            </QuickViewProvider>
        )
    }

    beforeEach(() => {
        latestContext = null
    })

    it('UT-PROV-001 — provider initial state: isOpen is false and openProduct is null', () => {
        renderProvider()
        expect(screen.getByTestId('isOpen').textContent).toBe('false')
        expect(screen.getByTestId('openProduct').textContent).toBe('null')
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        renderProvider()

        act(() => {
            latestContext.openQuickView(simpleProduct)
        })

        expect(screen.getByTestId('isOpen').textContent).toBe('true')
        expect(JSON.parse(screen.getByTestId('openProduct').textContent)).toEqual(simpleProduct)
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        renderProvider()

        act(() => {
            latestContext.openQuickView(simpleProduct)
        })

        expect(screen.getByTestId('isOpen').textContent).toBe('true')

        act(() => {
            latestContext.closeQuickView()
        })

        expect(screen.getByTestId('isOpen').textContent).toBe('false')
        expect(screen.getByTestId('openProduct').textContent).toBe('null')
    })
})
