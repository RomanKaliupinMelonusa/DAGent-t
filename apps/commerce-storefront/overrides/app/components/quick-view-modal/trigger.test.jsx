/*
 * Unit tests for QuickViewTrigger.
 * Cases: UT-TRIG-001 through UT-TRIG-006
 */
import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock the context module
const mockOpenQuickView = jest.fn()
jest.mock('./context', () => ({
    useQuickView: () => ({
        openQuickView: mockOpenQuickView,
        closeQuickView: jest.fn(),
        isOpen: false,
        openProduct: null
    })
}))

// Mock react-intl
jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: (msg, values) =>
            msg.defaultMessage?.replace('{productName}', values?.productName || '') || msg.id
    }),
    defineMessages: (msgs) => msgs
}))

// Mock shared/ui IconButton — use require('react') inside factory
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const reactModule = require('react')
    return {
        // eslint-disable-next-line react/display-name
        IconButton: reactModule.forwardRef((props, ref) => {
            // Destructure out Chakra-specific props so they don't end up on the DOM element
            const {
                icon,
                size,
                variant,
                colorScheme,
                bg,
                color,
                _hover,
                borderRadius,
                boxShadow,
                opacity,
                _groupHover,
                _focusVisible,
                transition,
                position,
                bottom,
                right,
                zIndex,
                ...htmlProps
            } = props
            return reactModule.createElement('button', {ref, ...htmlProps}, icon)
        })
    }
})

// Mock the icons
jest.mock('@salesforce/retail-react-app/app/components/icons', () => ({
    VisibilityIcon: () => require('react').createElement('span', null, '👁')
}))

// Mock messages
jest.mock('./messages', () => ({
    triggerAriaLabelMobile: {
        id: 'commerce-storefront.quickView.triggerAriaLabelMobile',
        defaultMessage: 'Quick View {productName}'
    }
}))

import QuickViewTrigger from './trigger'

// --- Fixtures ---
const simpleProduct = {
    id: 'prod-simple-001',
    name: 'Simple Dress',
    type: {set: false, bundle: false}
}

const productSet = {
    id: 'prod-set-001',
    name: 'Winter Look Set',
    type: {set: true, bundle: false}
}

const productBundle = {
    id: 'prod-bundle-001',
    name: 'Bundle Product',
    type: {set: false, bundle: true}
}

describe('QuickViewTrigger', () => {
    beforeEach(() => {
        mockOpenQuickView.mockClear()
    })

    it('UT-TRIG-001 — trigger renders for simple product', () => {
        render(<QuickViewTrigger product={simpleProduct} />)
        const btn = screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        expect(btn).toBeInTheDocument()
    })

    it('UT-TRIG-002 — trigger hidden for product set', () => {
        const {container} = render(<QuickViewTrigger product={productSet} />)
        expect(container.querySelector('[data-testid*="quick-view-trigger-"]')).toBeNull()
    })

    it('UT-TRIG-003 — trigger hidden for product bundle', () => {
        const {container} = render(<QuickViewTrigger product={productBundle} />)
        expect(container.querySelector('[data-testid*="quick-view-trigger-"]')).toBeNull()
    })

    it('UT-TRIG-004 — trigger calls openQuickView with the product', () => {
        render(<QuickViewTrigger product={simpleProduct} />)
        const btn = screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        fireEvent.click(btn)
        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
        expect(mockOpenQuickView).toHaveBeenCalledWith(simpleProduct)
    })

    it('UT-TRIG-005 — trigger does not navigate (stopPropagation)', () => {
        const parentClickHandler = jest.fn()
        render(
            // eslint-disable-next-line jsx-a11y/anchor-is-valid, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
            <div onClick={parentClickHandler}>
                <QuickViewTrigger product={simpleProduct} />
            </div>
        )
        const btn = screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        fireEvent.click(btn)
        expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('UT-TRIG-006 — trigger SSR / hydration safety: renders without client-only side effects', () => {
        // The component uses the isMounted pattern: onClick is noop until
        // useEffect fires. In JSDOM, useEffect fires synchronously after
        // render, so we verify the button renders without errors (the same
        // markup would be produced in SSR minus the effect).
        const {container} = render(<QuickViewTrigger product={simpleProduct} />)
        const btn = container.querySelector(
            `[data-testid="quick-view-trigger-${simpleProduct.id}"]`
        )
        expect(btn).toBeTruthy()
        expect(btn.getAttribute('type')).toBe('button')
    })
})
