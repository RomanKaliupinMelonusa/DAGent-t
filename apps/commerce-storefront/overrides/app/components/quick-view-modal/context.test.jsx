/*
 * Unit tests for Quick View Context & Provider
 * Cases: UT-PROV-001, UT-PROV-002, UT-PROV-003
 */
import React from 'react'
import '@testing-library/jest-dom/extend-expect'
import {render, screen, act} from '@testing-library/react'
import {QuickViewProvider, useQuickView} from './context'

// Helper that exposes context values via data-testid attributes
const ContextConsumer = () => {
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
                <ContextConsumer />
            </QuickViewProvider>
        )

        expect(screen.getByTestId('isOpen').textContent).toBe('false')
        expect(screen.getByTestId('openProduct').textContent).toBe('null')
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        render(
            <QuickViewProvider>
                <ContextConsumer />
            </QuickViewProvider>
        )

        act(() => {
            screen.getByTestId('open-btn').click()
        })

        expect(screen.getByTestId('isOpen').textContent).toBe('true')
        expect(JSON.parse(screen.getByTestId('openProduct').textContent)).toEqual({
            id: 'prod-123',
            name: 'Test Product'
        })
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        render(
            <QuickViewProvider>
                <ContextConsumer />
            </QuickViewProvider>
        )

        // Open first
        act(() => {
            screen.getByTestId('open-btn').click()
        })
        expect(screen.getByTestId('isOpen').textContent).toBe('true')

        // Close
        act(() => {
            screen.getByTestId('close-btn').click()
        })
        expect(screen.getByTestId('isOpen').textContent).toBe('false')
        expect(screen.getByTestId('openProduct').textContent).toBe('null')
    })
})
