/*
 * Unit tests for QuickViewContext / QuickViewProvider / useQuickView.
 * Covers: UT-PROV-001, UT-PROV-002, UT-PROV-003
 */
import React from 'react'
import {render, act} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {QuickViewProvider, useQuickView} from './context'

// Mock the modal shell so the provider renders without its full dependency tree
jest.mock('./modal-shell', () => {
    return function MockModalShell() {
        return null
    }
})

// Simple test consumer that exposes context values
const TestConsumer = ({onContext}) => {
    const ctx = useQuickView()
    onContext(ctx)
    return null
}

const renderWithProvider = (onContext) => {
    return render(
        <IntlProvider locale="en-US" messages={{}}>
            <QuickViewProvider>
                <TestConsumer onContext={onContext} />
            </QuickViewProvider>
        </IntlProvider>
    )
}

describe('QuickViewProvider', () => {
    it('UT-PROV-001 — provider initial state: isOpen is false and openProduct is null', () => {
        let contextValue
        renderWithProvider((ctx) => {
            contextValue = ctx
        })

        expect(contextValue.isOpen).toBe(false)
        expect(contextValue.openProduct).toBeNull()
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        const sampleProduct = {id: 'prod-123', name: 'Test Dress'}
        let contextValue
        renderWithProvider((ctx) => {
            contextValue = ctx
        })

        act(() => {
            contextValue.openQuickView(sampleProduct)
        })

        expect(contextValue.isOpen).toBe(true)
        expect(contextValue.openProduct).toBe(sampleProduct)
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        const sampleProduct = {id: 'prod-456', name: 'Another Dress'}
        let contextValue
        renderWithProvider((ctx) => {
            contextValue = ctx
        })

        act(() => {
            contextValue.openQuickView(sampleProduct)
        })
        expect(contextValue.isOpen).toBe(true)

        act(() => {
            contextValue.closeQuickView()
        })

        expect(contextValue.isOpen).toBe(false)
        expect(contextValue.openProduct).toBeNull()
    })
})
