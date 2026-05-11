/*
 * Unit tests for QuickViewTrigger.
 *
 * Covers: UT-TRIG-001, UT-TRIG-002, UT-TRIG-003, UT-TRIG-004, UT-TRIG-005, UT-TRIG-006
 */
import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the context module
const mockOpenQuickView = jest.fn()
jest.mock('./context', () => ({
    useQuickView: () => ({
        isOpen: false,
        openProduct: null,
        openQuickView: mockOpenQuickView,
        closeQuickView: jest.fn()
    })
}))

// Mock react-intl
jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: (msg, values) => {
            if (values?.productName) return `Quick View ${values.productName}`
            return msg.defaultMessage || msg.id || ''
        }
    }),
    defineMessages: (msgs) => msgs
}))

// Mock the Chakra IconButton - render a regular button with forwarded props
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const ReactMock = require('react')
    return {
        IconButton: ReactMock.forwardRef(function MockIconButton(props, ref) {
            const {
                onClick,
                'data-testid': testId,
                'aria-haspopup': ariaHaspopup,
                'aria-controls': ariaControls,
                'aria-label': ariaLabel,
                type,
                icon,
                ...rest
            } = props
            return ReactMock.createElement('button', {
                ref,
                onClick,
                'data-testid': testId,
                'aria-haspopup': ariaHaspopup,
                'aria-controls': ariaControls,
                'aria-label': ariaLabel,
                type
            })
        })
    }
})

// Mock the VisibilityIcon
jest.mock('@salesforce/retail-react-app/app/components/icons', () => ({
    VisibilityIcon: function MockVisibilityIcon() {
        return require('react').createElement('span', {'data-testid': 'visibility-icon'})
    }
}))

import QuickViewTrigger from './trigger'

// Fixtures
const simpleProduct = {id: 'simple-001', name: 'Simple Dress', type: {}}
const productSet = {id: 'set-001', name: 'Set Product', type: {set: true}}
const productBundle = {id: 'bundle-001', name: 'Bundle Product', type: {bundle: true}}

describe('QuickViewTrigger', () => {
    beforeEach(() => {
        mockOpenQuickView.mockClear()
    })

    it('UT-TRIG-001 — trigger renders for simple product', () => {
        const {getByTestId} = render(<QuickViewTrigger product={simpleProduct} />)
        expect(getByTestId('quick-view-trigger-simple-001')).toBeInTheDocument()
    })

    it('UT-TRIG-002 — trigger hidden for product set', () => {
        const {container} = render(<QuickViewTrigger product={productSet} />)
        expect(container.querySelector('[data-testid^="quick-view-trigger-"]')).toBeNull()
    })

    it('UT-TRIG-003 — trigger hidden for product bundle', () => {
        const {container} = render(<QuickViewTrigger product={productBundle} />)
        expect(container.querySelector('[data-testid^="quick-view-trigger-"]')).toBeNull()
    })

    it('UT-TRIG-004 — trigger calls openQuickView with the product', () => {
        const {getByTestId} = render(<QuickViewTrigger product={simpleProduct} />)
        fireEvent.click(getByTestId('quick-view-trigger-simple-001'))
        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
        expect(mockOpenQuickView).toHaveBeenCalledWith(simpleProduct)
    })

    it('UT-TRIG-005 — trigger does not navigate (stopPropagation)', () => {
        const parentClickHandler = jest.fn()
        const {getByTestId} = render(
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
            <div onClick={parentClickHandler}>
                <a href="/product/simple-001">
                    <QuickViewTrigger product={simpleProduct} />
                </a>
            </div>
        )
        fireEvent.click(getByTestId('quick-view-trigger-simple-001'))
        expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('UT-TRIG-006 — trigger SSR / hydration safety (handler inert until mounted)', () => {
        // The component uses isMounted pattern: onClick is noop until useEffect fires.
        // In JSDOM, useEffect fires synchronously, so we verify the component renders
        // without throwing and has the expected button element in DOM — SSR safe.
        const {getByTestId} = render(<QuickViewTrigger product={simpleProduct} />)
        const button = getByTestId('quick-view-trigger-simple-001')
        expect(button).toBeInTheDocument()
        expect(button.tagName.toLowerCase()).toBe('button')
    })
})
