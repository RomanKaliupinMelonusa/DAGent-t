/*
 * Unit tests for Quick View Context & Provider
 * Cases: UT-PROV-001, UT-PROV-002, UT-PROV-003
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, act} from '@testing-library/react'
import {QuickViewProvider, useQuickView} from './context'

// Helper component that exposes context values for assertion
const ContextReader = ({onContext}) => {
    const ctx = useQuickView()
    onContext(ctx)
    return (
        <div>
            <span data-testid="isOpen">{String(ctx.isOpen)}</span>
            <span data-testid="openProduct">{JSON.stringify(ctx.openProduct)}</span>
            <button data-testid="open-btn" onClick={() => ctx.openQuickView({id: 'prod-123', name: 'Test Product'})} />
            <button data-testid="close-btn" onClick={() => ctx.closeQuickView()} />
        </div>
    )
}

describe('QuickViewProvider', () => {
    let latestCtx

    const renderProvider = () => {
        return render(
            <QuickViewProvider>
                <ContextReader onContext={(ctx) => { latestCtx = ctx }} />
            </QuickViewProvider>
        )
    }

    beforeEach(() => {
        latestCtx = null
    })

    it('UT-PROV-001 — provider initial state: isOpen is false and openProduct is null', () => {
        renderProvider()
        expect(screen.getByTestId('isOpen')).toHaveTextContent('false')
        expect(screen.getByTestId('openProduct')).toHaveTextContent('null')
        expect(latestCtx.isOpen).toBe(false)
        expect(latestCtx.openProduct).toBeNull()
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        renderProvider()
        const product = {id: 'prod-123', name: 'Test Product'}

        act(() => {
            screen.getByTestId('open-btn').click()
        })

        expect(latestCtx.isOpen).toBe(true)
        expect(latestCtx.openProduct).toEqual(product)
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        renderProvider()

        // First open
        act(() => {
            screen.getByTestId('open-btn').click()
        })
        expect(latestCtx.isOpen).toBe(true)

        // Then close
        act(() => {
            screen.getByTestId('close-btn').click()
        })
        expect(latestCtx.isOpen).toBe(false)
        expect(latestCtx.openProduct).toBeNull()
    })
})
