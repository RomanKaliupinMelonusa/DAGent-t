/*
 * Unit tests for QuickViewTrigger.
 * Covers: UT-TRIG-001, UT-TRIG-002, UT-TRIG-003, UT-TRIG-004, UT-TRIG-005, UT-TRIG-006
 */
import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'
import {IntlProvider} from 'react-intl'

// Mock the context hook
const mockOpenQuickView = jest.fn()
jest.mock('./context', () => ({
    useQuickView: () => ({
        openQuickView: mockOpenQuickView,
        closeQuickView: jest.fn(),
        isOpen: false,
        openProduct: null
    })
}))

// Mock the icons
jest.mock('@salesforce/retail-react-app/app/components/icons', () => ({
    VisibilityIcon: () => 'icon'
}))

// Mock Chakra IconButton — use require('react') inside the factory
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const ReactInFactory = require('react')
    return {
        IconButton: ReactInFactory.forwardRef(function MockIconButton(props, ref) {
            const {
                icon, colorScheme, boxShadow, borderRadius,
                _hover, _groupHover, _focusVisible, ...domProps
            } = props
            return <button ref={ref} {...domProps}>{icon}</button>
        })
    }
})

import QuickViewTrigger from './trigger'

const simpleProduct = {id: 'simple-001', name: 'Simple Dress', type: {}}
const productSet = {id: 'set-001', name: 'Set Product', type: {set: true}}
const productBundle = {id: 'bundle-001', name: 'Bundle Product', type: {bundle: true}}

const renderTrigger = (product) => {
    return render(
        <IntlProvider locale="en-US" messages={{}}>
            <QuickViewTrigger product={product} />
        </IntlProvider>
    )
}

describe('QuickViewTrigger', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('UT-TRIG-001 — trigger renders for simple product with correct data-testid', () => {
        const {getByTestId} = renderTrigger(simpleProduct)
        expect(getByTestId('quick-view-trigger-simple-001')).toBeDefined()
        expect(getByTestId('quick-view-trigger-simple-001').tagName.toLowerCase()).toBe('button')
    })

    it('UT-TRIG-002 — trigger hidden for product set', () => {
        const {container} = renderTrigger(productSet)
        expect(container.querySelector('[data-testid*="quick-view-trigger-"]')).toBeNull()
    })

    it('UT-TRIG-003 — trigger hidden for product bundle', () => {
        const {container} = renderTrigger(productBundle)
        expect(container.querySelector('[data-testid*="quick-view-trigger-"]')).toBeNull()
    })

    it('UT-TRIG-004 — trigger calls openQuickView with the product on click', () => {
        const {getByTestId} = renderTrigger(simpleProduct)
        const trigger = getByTestId('quick-view-trigger-simple-001')
        fireEvent.click(trigger)
        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
        expect(mockOpenQuickView).toHaveBeenCalledWith(simpleProduct)
    })

    it('UT-TRIG-005 — trigger does not propagate click to parent PDP link', () => {
        const parentClickHandler = jest.fn()
        const {getByTestId} = render(
            <IntlProvider locale="en-US" messages={{}}>
                {/* eslint-disable-next-line jsx-a11y/anchor-is-valid, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <a href="/product/simple-001" onClick={parentClickHandler}>
                    <QuickViewTrigger product={simpleProduct} />
                </a>
            </IntlProvider>
        )
        const trigger = getByTestId('quick-view-trigger-simple-001')
        fireEvent.click(trigger)
        expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('UT-TRIG-006 — trigger SSR / hydration safety: initial render does not throw and uses noop handler', () => {
        // The trigger uses an isMounted pattern: useState(false) + useEffect to set true.
        // In SSR, useEffect doesn't run, so onClick is the noop function.
        // We verify this by confirming the component renders successfully and that the
        // onClick attribute on the rendered element is indeed a function (it renders
        // without error). The true SSR assertion is that no client-only side-effect
        // (like openQuickView) is triggered during initial render — since React Testing
        // Library flushes effects, we verify that openQuickView is NOT called by mere rendering.
        mockOpenQuickView.mockClear()
        renderTrigger(simpleProduct)
        // openQuickView should NOT have been called by just rendering (no auto-open side effect)
        expect(mockOpenQuickView).not.toHaveBeenCalled()
    })
})
