/*
 * Unit tests for QuickViewTrigger
 * Binding contract: unit-tests.md §3 — Trigger (UT-TRIG-001..006)
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {QuickViewContext} from './context'

// Mock useBreakpointValue to return desktop by default
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const actual = jest.requireActual('@salesforce/retail-react-app/app/components/shared/ui')
    return {
        ...actual,
        useBreakpointValue: jest.fn(() => false) // desktop
    }
})

import QuickViewTrigger from './trigger'

// Fixtures (inlined per T002)
const simpleProduct = {id: 'simple-001', name: 'Floral Dress', type: {}}
const productSet = {id: 'set-001', name: 'Winter Look', type: {set: true}}
const productBundle = {id: 'bundle-001', name: 'Travel Bundle', type: {bundle: true}}

const mockOpenQuickView = jest.fn()
const mockCloseQuickView = jest.fn()

const defaultContextValue = {
    isOpen: false,
    openProduct: null,
    openQuickView: mockOpenQuickView,
    closeQuickView: mockCloseQuickView
}

const renderTrigger = (product, contextOverrides = {}) => {
    return render(
        <IntlProvider locale="en-GB" defaultLocale="en-GB">
            <QuickViewContext.Provider value={{...defaultContextValue, ...contextOverrides}}>
                <QuickViewTrigger product={product} />
            </QuickViewContext.Provider>
        </IntlProvider>
    )
}

describe('QuickViewTrigger', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('UT-TRIG-001 — trigger renders for simple product', () => {
        renderTrigger(simpleProduct)
        expect(screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`)).toBeInTheDocument()
    })

    it('UT-TRIG-002 — trigger hidden for product set', () => {
        renderTrigger(productSet)
        expect(screen.queryByTestId(/quick-view-trigger-/)).not.toBeInTheDocument()
    })

    it('UT-TRIG-003 — trigger hidden for product bundle', () => {
        renderTrigger(productBundle)
        expect(screen.queryByTestId(/quick-view-trigger-/)).not.toBeInTheDocument()
    })

    it('UT-TRIG-004 — trigger calls openQuickView with the product', () => {
        renderTrigger(simpleProduct)
        fireEvent.click(screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`))
        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
        expect(mockOpenQuickView).toHaveBeenCalledWith(simpleProduct)
    })

    it('UT-TRIG-005 — trigger does not navigate (stopPropagation)', () => {
        const parentClickHandler = jest.fn()
        render(
            <IntlProvider locale="en-GB" defaultLocale="en-GB">
                <QuickViewContext.Provider value={defaultContextValue}>
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
                    <div onClick={parentClickHandler}>
                        <a href="/product/simple-001">
                            <span>Product tile link</span>
                        </a>
                        <QuickViewTrigger product={simpleProduct} />
                    </div>
                </QuickViewContext.Provider>
            </IntlProvider>
        )
        fireEvent.click(screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`))
        // The click must NOT propagate to the parent div (proxy for tile link)
        expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('UT-TRIG-006 — SSR / hydration safety: initial render does not invoke client-only side effects', () => {
        // On initial render (before useEffect fires), the handler should be inert (noop).
        // We test by rendering in a way that prevents useEffect from running,
        // then verifying the click doesn't call openQuickView.
        //
        // React Testing Library's render does run effects, so we use ReactDOMServer
        // to capture the server-rendered state, then check it doesn't throw.
        const ReactDOMServer = require('react-dom/server')
        const html = ReactDOMServer.renderToString(
            <IntlProvider locale="en-GB" defaultLocale="en-GB">
                <QuickViewContext.Provider value={defaultContextValue}>
                    <QuickViewTrigger product={simpleProduct} />
                </QuickViewContext.Provider>
            </IntlProvider>
        )
        // Should render without throwing and produce a button element
        expect(html).toContain('quick-view-trigger-')
        expect(html).toContain('button')
        // openQuickView should NOT have been called during server render
        expect(mockOpenQuickView).not.toHaveBeenCalled()
    })
})
