/*
 * Unit tests for QuickViewTrigger.
 * Cases: UT-TRIG-001, UT-TRIG-002, UT-TRIG-003, UT-TRIG-004, UT-TRIG-005, UT-TRIG-006
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {QuickViewContext} from './context'

// Mock the Chakra Button to a simple HTML button for test isolation
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const MockReact = require('react')
    return {
        Button: MockReact.forwardRef(function MockButton(props, ref) {
            const {'data-testid': testId, children, ...rest} = props
            return (
                <button ref={ref} data-testid={testId} {...rest}>
                    {children}
                </button>
            )
        })
    }
})

// Import after mocks
import QuickViewTrigger from './trigger'

// Fixtures
const simpleProduct = {
    id: 'simple-001',
    name: 'Simple Dress',
    type: {master: false, set: false, bundle: false}
}

const productSet = {
    id: 'set-001',
    name: 'Winter Look Set',
    type: {set: true, bundle: false}
}

const productBundle = {
    id: 'bundle-001',
    name: 'Starter Bundle',
    type: {set: false, bundle: true}
}

// Helper to render trigger with providers
const mockOpenQuickView = jest.fn()
const mockCloseQuickView = jest.fn()

const renderTrigger = (product, contextOverrides = {}) => {
    const contextValue = {
        isOpen: false,
        openProduct: null,
        openQuickView: mockOpenQuickView,
        closeQuickView: mockCloseQuickView,
        ...contextOverrides
    }

    return render(
        <IntlProvider locale="en" messages={{}}>
            <QuickViewContext.Provider value={contextValue}>
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
        expect(screen.getByTestId('quick-view-trigger-simple-001')).toBeInTheDocument()
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
        fireEvent.click(screen.getByTestId('quick-view-trigger-simple-001'))
        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
        expect(mockOpenQuickView).toHaveBeenCalledWith(simpleProduct)
    })

    it('UT-TRIG-005 — trigger does not navigate (stopPropagation)', () => {
        const parentClickHandler = jest.fn()

        render(
            <IntlProvider locale="en" messages={{}}>
                <QuickViewContext.Provider
                    value={{
                        isOpen: false,
                        openProduct: null,
                        openQuickView: mockOpenQuickView,
                        closeQuickView: mockCloseQuickView
                    }}
                >
                    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
                    <div onClick={parentClickHandler}>
                        <a href="/product/simple-001">
                            <QuickViewTrigger product={simpleProduct} />
                        </a>
                    </div>
                </QuickViewContext.Provider>
            </IntlProvider>
        )

        fireEvent.click(screen.getByTestId('quick-view-trigger-simple-001'))
        expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('UT-TRIG-006 — trigger SSR / hydration safety: handler is inert until mounted', () => {
        // The trigger uses the isMounted pattern: button renders on server with a noop onClick.
        // After hydration (useEffect runs), the real handleClick is attached.
        // We verify by rendering with ReactDOMServer which does NOT run useEffect.
        const ReactDOMServer = require('react-dom/server')

        const html = ReactDOMServer.renderToString(
            <IntlProvider locale="en" messages={{}}>
                <QuickViewContext.Provider
                    value={{
                        isOpen: false,
                        openProduct: null,
                        openQuickView: mockOpenQuickView,
                        closeQuickView: mockCloseQuickView
                    }}
                >
                    <QuickViewTrigger product={simpleProduct} />
                </QuickViewContext.Provider>
            </IntlProvider>
        )

        // The button renders in the server HTML (no crash, no client-only side effects)
        expect(html).toContain('quick-view-trigger-simple-001')
        expect(html).toContain('Quick View')

        // openQuickView should NOT have been called during server render
        expect(mockOpenQuickView).not.toHaveBeenCalled()
    })
})
