/*
 * Unit tests for QuickViewTrigger component.
 * Cases: UT-TRIG-001 through UT-TRIG-006
 */
import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'
import {IntlProvider} from 'react-intl'
import {QuickViewContext} from './context'

// Mock the shared UI IconButton — renders a plain button
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const React = require('react')
    return {
        IconButton: React.forwardRef(function MockIconButton(props, ref) {
            const {
                icon, colorScheme, boxShadow, borderRadius, bg, color,
                _hover, _groupHover, _focusVisible, transition,
                position, bottom, right, zIndex, opacity,
                ...rest
            } = props
            const htmlProps = {}
            const allowedProps = [
                'data-testid', 'type', 'aria-haspopup', 'aria-controls',
                'aria-label', 'onClick', 'disabled', 'className', 'style', 'id'
            ]
            for (const key of allowedProps) {
                if (rest[key] !== undefined) htmlProps[key] = rest[key]
            }
            return <button ref={ref} {...htmlProps}>{icon}</button>
        })
    }
})

// Mock the icons
jest.mock('@salesforce/retail-react-app/app/components/icons', () => ({
    VisibilityIcon: () => <span>eye</span>
}))

// Import after mocks
import QuickViewTrigger from './trigger'

// Fixtures
const simpleProduct = {
    id: 'simple-001',
    name: 'Simple Dress',
    price: 39.99,
    type: {}
}

const productSet = {
    id: 'set-001',
    name: 'Product Set',
    type: {set: true}
}

const productBundle = {
    id: 'bundle-001',
    name: 'Product Bundle',
    type: {bundle: true}
}

// Helper: wrap with minimal providers
const renderTrigger = (product, contextOverrides = {}) => {
    const mockOpenQuickView = jest.fn()
    const mockCloseQuickView = jest.fn()
    const contextValue = {
        isOpen: false,
        openProduct: null,
        openQuickView: mockOpenQuickView,
        closeQuickView: mockCloseQuickView,
        ...contextOverrides
    }

    const result = render(
        <IntlProvider locale="en" defaultLocale="en">
            <QuickViewContext.Provider value={contextValue}>
                <QuickViewTrigger product={product} />
            </QuickViewContext.Provider>
        </IntlProvider>
    )

    return {...result, mockOpenQuickView, mockCloseQuickView}
}

describe('QuickViewTrigger', () => {
    it('UT-TRIG-001 — trigger renders for simple product with correct data-testid', () => {
        const {getByTestId} = renderTrigger(simpleProduct)
        expect(getByTestId(`quick-view-trigger-${simpleProduct.id}`)).toBeInTheDocument()
    })

    it('UT-TRIG-002 — trigger hidden for product set', () => {
        const {container} = renderTrigger(productSet)
        const trigger = container.querySelector('[data-testid^="quick-view-trigger-"]')
        expect(trigger).toBeNull()
    })

    it('UT-TRIG-003 — trigger hidden for product bundle', () => {
        const {container} = renderTrigger(productBundle)
        const trigger = container.querySelector('[data-testid^="quick-view-trigger-"]')
        expect(trigger).toBeNull()
    })

    it('UT-TRIG-004 — clicking the trigger calls openQuickView with the product', () => {
        const {getByTestId, mockOpenQuickView} = renderTrigger(simpleProduct)
        const btn = getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        fireEvent.click(btn)
        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
        expect(mockOpenQuickView).toHaveBeenCalledWith(simpleProduct)
    })

    it('UT-TRIG-005 — trigger click does not propagate to parent PDP link', () => {
        const parentClickHandler = jest.fn()
        const mockOpenQuickView = jest.fn()
        const contextValue = {
            isOpen: false,
            openProduct: null,
            openQuickView: mockOpenQuickView,
            closeQuickView: jest.fn()
        }

        const {getByTestId} = render(
            <IntlProvider locale="en" defaultLocale="en">
                <QuickViewContext.Provider value={contextValue}>
                    {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
                    <a href="/pdp/simple-001" onClick={parentClickHandler}>
                        <QuickViewTrigger product={simpleProduct} />
                    </a>
                </QuickViewContext.Provider>
            </IntlProvider>
        )

        const btn = getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        fireEvent.click(btn)

        // stopPropagation prevents the parent click
        expect(parentClickHandler).not.toHaveBeenCalled()
        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-TRIG-006 — SSR / hydration safety: initial render does not throw and renders the button', () => {
        // The trigger uses isMounted pattern for SSR safety.
        // We verify it renders without errors. In JSDOM, useEffect fires
        // synchronously so mounted becomes true immediately. The key SSR
        // property is that the button element is rendered on the server
        // (only the onClick handler is inert pre-hydration).
        const {getByTestId} = renderTrigger(simpleProduct)
        const btn = getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        expect(btn).toBeInTheDocument()
        // Button has type="button" (no form submission)
        expect(btn).toHaveAttribute('type', 'button')
    })
})
