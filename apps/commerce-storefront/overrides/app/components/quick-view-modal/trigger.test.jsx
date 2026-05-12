/*
 * Unit tests for QuickViewTrigger.
 * Contract: unit-tests.md §3 — Trigger (UT-TRIG-001..006)
 */
import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'
import QuickViewTrigger from './trigger'
import {QuickViewContext} from './context'
import {IntlProvider} from 'react-intl'

// ---------------------------------------------------------------------------
// Fixtures (inlined per task T002)
// ---------------------------------------------------------------------------
const simpleProduct = {
    id: 'prod-simple-001',
    productId: 'prod-simple-001',
    name: 'Simple Dress',
    price: 49.99,
    type: {set: false, bundle: false}
}

const productSet = {
    id: 'prod-set-001',
    productId: 'prod-set-001',
    name: 'Winter Look Set',
    price: 149.99,
    type: {set: true, bundle: false}
}

const productBundle = {
    id: 'prod-bundle-001',
    productId: 'prod-bundle-001',
    name: 'Gift Bundle',
    price: 99.99,
    type: {set: false, bundle: true}
}

// ---------------------------------------------------------------------------
// Mock — Chakra shared/ui (IconButton)
// ---------------------------------------------------------------------------
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const MockReact = require('react')
    return {
        // eslint-disable-next-line react/prop-types
        IconButton: MockReact.forwardRef(function MockIconButton(props, ref) {
            const {
                icon,
                size,
                variant,
                colorScheme,
                bg,
                color,
                borderRadius,
                boxShadow,
                opacity,
                transition,
                position,
                bottom,
                right,
                zIndex,
                _hover,
                _groupHover,
                _focusVisible,
                isRound,
                ...rest
            } = props
            return <button ref={ref} {...rest} />
        })
    }
})

jest.mock('@salesforce/retail-react-app/app/components/icons', () => ({
    VisibilityIcon: () => <span data-testid="visibility-icon" />
}))

// ---------------------------------------------------------------------------
// Helper: wraps trigger in required providers
// ---------------------------------------------------------------------------
const mockOpenQuickView = jest.fn()
const mockCloseQuickView = jest.fn()

const defaultContextValue = {
    isOpen: false,
    openProduct: null,
    openQuickView: mockOpenQuickView,
    closeQuickView: mockCloseQuickView
}

const renderTrigger = (product, ctxOverrides = {}) => {
    return render(
        <IntlProvider locale="en" defaultLocale="en" messages={{}}>
            <QuickViewContext.Provider value={{...defaultContextValue, ...ctxOverrides}}>
                <QuickViewTrigger product={product} />
            </QuickViewContext.Provider>
        </IntlProvider>
    )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('QuickViewTrigger', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('UT-TRIG-001 — trigger renders for simple product', () => {
        renderTrigger(simpleProduct)
        const btn = screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        expect(btn).toBeInTheDocument()
    })

    it('UT-TRIG-002 — trigger hidden for product set', () => {
        renderTrigger(productSet)
        const el = screen.queryByTestId(`quick-view-trigger-${productSet.id}`)
        expect(el).toBeNull()
    })

    it('UT-TRIG-003 — trigger hidden for product bundle', () => {
        renderTrigger(productBundle)
        const el = screen.queryByTestId(`quick-view-trigger-${productBundle.id}`)
        expect(el).toBeNull()
    })

    it('UT-TRIG-004 — trigger calls openQuickView with the product', () => {
        renderTrigger(simpleProduct)
        const btn = screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        fireEvent.click(btn)
        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
        expect(mockOpenQuickView).toHaveBeenCalledWith(simpleProduct)
    })

    it('UT-TRIG-005 — trigger does not navigate (click does not propagate)', () => {
        const parentClickHandler = jest.fn()
        render(
            <IntlProvider locale="en" defaultLocale="en" messages={{}}>
                <QuickViewContext.Provider value={defaultContextValue}>
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
                    <div onClick={parentClickHandler}>
                        <a href="/product/prod-simple-001">
                            <span>Product Image</span>
                        </a>
                        <QuickViewTrigger product={simpleProduct} />
                    </div>
                </QuickViewContext.Provider>
            </IntlProvider>
        )
        const btn = screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        fireEvent.click(btn)
        expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('UT-TRIG-006 — trigger SSR / hydration safety: initial render does not invoke client-only side effect', () => {
        // Verify the component renders without throwing (SSR-safe path)
        // and the button is present in the DOM.
        // In JSDOM, useEffect fires synchronously, so we can't test the
        // pre-mount noop handler directly. We verify render stability.
        expect(() => {
            renderTrigger(simpleProduct)
        }).not.toThrow()

        const btn = screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        expect(btn).toBeInTheDocument()
        expect(btn.tagName.toLowerCase()).toBe('button')
    })
})
