/*
 * Unit tests for QuickViewTrigger
 * Cases: UT-TRIG-001..006
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, act} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import ReactDOMServer from 'react-dom/server'

// Mock the context module so we can control openQuickView
const mockOpenQuickView = jest.fn()
const mockCloseQuickView = jest.fn()
jest.mock('./context', () => ({
    useQuickView: () => ({
        isOpen: false,
        openProduct: null,
        openQuickView: mockOpenQuickView,
        closeQuickView: mockCloseQuickView
    })
}))

// Mock the shared UI Button to a simple button
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const MockReact = require('react')
    return {
        Button: MockReact.forwardRef(({children, ...props}, ref) => (
            <button ref={ref} {...props}>{children}</button>
        ))
    }
})

import QuickViewTrigger from './trigger'

const wrap = (ui) => (
    <IntlProvider locale="en" defaultLocale="en">
        {ui}
    </IntlProvider>
)

describe('QuickViewTrigger', () => {
    const simpleProduct = {id: 'simple-001', name: 'Simple Dress', type: {}}
    const productSet = {id: 'set-001', name: 'Dress Set', type: {set: true}}
    const productBundle = {id: 'bundle-001', name: 'Dress Bundle', type: {bundle: true}}

    beforeEach(() => {
        mockOpenQuickView.mockClear()
        mockCloseQuickView.mockClear()
    })

    it('UT-TRIG-001 — trigger renders for simple product', () => {
        render(wrap(<QuickViewTrigger product={simpleProduct} />))
        expect(screen.getByTestId('quick-view-trigger-simple-001')).toBeInTheDocument()
    })

    it('UT-TRIG-002 — trigger hidden for product set', () => {
        render(wrap(<QuickViewTrigger product={productSet} />))
        expect(screen.queryByTestId('quick-view-trigger-set-001')).not.toBeInTheDocument()
    })

    it('UT-TRIG-003 — trigger hidden for product bundle', () => {
        render(wrap(<QuickViewTrigger product={productBundle} />))
        expect(screen.queryByTestId('quick-view-trigger-bundle-001')).not.toBeInTheDocument()
    })

    it('UT-TRIG-004 — trigger calls openQuickView with the product', () => {
        render(wrap(<QuickViewTrigger product={simpleProduct} />))
        const trigger = screen.getByTestId('quick-view-trigger-simple-001')

        act(() => {
            trigger.click()
        })

        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
        expect(mockOpenQuickView).toHaveBeenCalledWith(simpleProduct)
    })

    it('UT-TRIG-005 — trigger does not navigate (stopPropagation)', () => {
        const parentClickHandler = jest.fn()
        render(
            <IntlProvider locale="en" defaultLocale="en">
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
                <div onClick={parentClickHandler}>
                    <a href="/product/simple-001">
                        <QuickViewTrigger product={simpleProduct} />
                    </a>
                </div>
            </IntlProvider>
        )
        const trigger = screen.getByTestId('quick-view-trigger-simple-001')

        act(() => {
            trigger.click()
        })

        // stopPropagation prevents the parent from receiving the click
        expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('UT-TRIG-006 — trigger SSR / hydration safety: initial render does not invoke client-only side effects', () => {
        // Server render should not throw and should produce valid HTML
        const html = ReactDOMServer.renderToString(
            wrap(<QuickViewTrigger product={simpleProduct} />)
        )
        expect(html).toContain('quick-view-trigger-simple-001')

        // During SSR render (before useEffect runs), the openQuickView should NOT be called
        expect(mockOpenQuickView).not.toHaveBeenCalled()
    })
})
