/*
 * Unit tests for QuickViewContext / QuickViewProvider
 * Binding contract: unit-tests.md §3 — Provider & state (UT-PROV-001..003)
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, act} from '@testing-library/react'
import {QuickViewProvider, useQuickView} from './context'

// Helper that renders a consumer inside the provider and returns the latest context value.
const ContextInspector = ({onRender}) => {
    const ctx = useQuickView()
    onRender(ctx)
    return null
}

describe('QuickViewProvider', () => {
    it('UT-PROV-001 — provider initial state: isOpen is false and openProduct is null', () => {
        let captured
        render(
            <QuickViewProvider>
                <ContextInspector onRender={(ctx) => { captured = ctx }} />
            </QuickViewProvider>
        )
        expect(captured.isOpen).toBe(false)
        expect(captured.openProduct).toBeNull()
    })

    it('UT-PROV-002 — openQuickView(product) opens with that product', () => {
        const sampleProduct = {id: 'prod-abc', name: 'Test Dress'}
        let captured
        render(
            <QuickViewProvider>
                <ContextInspector onRender={(ctx) => { captured = ctx }} />
            </QuickViewProvider>
        )

        act(() => {
            captured.openQuickView(sampleProduct)
        })

        expect(captured.isOpen).toBe(true)
        expect(captured.openProduct).toBe(sampleProduct)
    })

    it('UT-PROV-003 — closeQuickView() resets state', () => {
        const sampleProduct = {id: 'prod-abc', name: 'Test Dress'}
        let captured
        render(
            <QuickViewProvider>
                <ContextInspector onRender={(ctx) => { captured = ctx }} />
            </QuickViewProvider>
        )

        // Open first
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
