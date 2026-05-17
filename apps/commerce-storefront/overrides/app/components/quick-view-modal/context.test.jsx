/*
 * Unit tests for QuickViewProvider / useQuickView context.
 * Cases: UT-PROV-001, UT-PROV-002, UT-PROV-003
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, act} from '@testing-library/react'
import {QuickViewProvider, useQuickView} from './context'

// Helper component that exposes provider state for assertions
const ConsumerHelper = () => {
    const {isOpen, openProduct, openQuickView, closeQuickView} = useQuickView()
    return (
        <div>
            <span data-testid="isOpen">{String(isOpen)}</span>
            <span data-testid="openProduct">{JSON.stringify(openProduct)}</span>
            <button data-testid="open-btn" onClick={() => openQuickView({id: 'prod-123', name: 'Test Product'})} />
            <button data-testid="close-btn" onClick={() => closeQuickView()} />
        </div>
    )
}

describe('QuickViewProvider', () => {
    it('UT-PROV-001 — provider initial state: isOpen is false and openProduct is null', () => {
        render(
            <QuickViewProvider>
                <ConsumerHelper />
            </QuickViewProvider>
        )
        expect(screen.getByTestId('isOpen')).toHaveTextContent('false')
        expect(screen.getByTestId('openProduct')).toHaveTextContent('null')
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        render(
            <QuickViewProvider>
                <ConsumerHelper />
            </QuickViewProvider>
        )
        act(() => {
            screen.getByTestId('open-btn').click()
        })
        expect(screen.getByTestId('isOpen')).toHaveTextContent('true')
        expect(screen.getByTestId('openProduct')).toHaveTextContent(
            JSON.stringify({id: 'prod-123', name: 'Test Product'})
        )
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        render(
            <QuickViewProvider>
                <ConsumerHelper />
            </QuickViewProvider>
        )
        // Open first
        act(() => {
            screen.getByTestId('open-btn').click()
        })
        expect(screen.getByTestId('isOpen')).toHaveTextContent('true')

        // Close
        act(() => {
            screen.getByTestId('close-btn').click()
        })
        expect(screen.getByTestId('isOpen')).toHaveTextContent('false')
        expect(screen.getByTestId('openProduct')).toHaveTextContent('null')
    })
})
