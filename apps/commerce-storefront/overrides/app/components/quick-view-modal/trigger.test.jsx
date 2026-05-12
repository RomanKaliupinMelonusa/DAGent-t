/*
 * Unit tests for QuickViewTrigger.
 *
 * Covers: UT-TRIG-001 through UT-TRIG-006
 */
import React from 'react'
import {render, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// Mocks — must be above imports that use them
// ---------------------------------------------------------------------------
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

jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: (msg, values) => {
            if (!msg || typeof msg.defaultMessage !== 'string') return ''
            return msg.defaultMessage.replace(/\{(\w+)\}/g, (_, key) =>
                values && values[key] != null ? String(values[key]) : ''
            )
        }
    }),
    defineMessages: (msgs) => msgs
}))

jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const {forwardRef} = require('react')
    return {
        IconButton: forwardRef(function MockIconButton(props, ref) {
            const {icon, ...rest} = props
            return <button ref={ref} {...rest}>{icon}</button>
        })
    }
})

jest.mock('@salesforce/retail-react-app/app/components/icons', () => ({
    VisibilityIcon: () => <span>eye</span>
}))

// Now import the component under test
import QuickViewTrigger from './trigger'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const simpleProduct = {
    id: 'prod-simple-001',
    name: 'Simple Dress',
    price: 49.99,
    type: {}
}

const productSet = {
    id: 'prod-set-001',
    name: 'Product Set',
    type: {set: true}
}

const productBundle = {
    id: 'prod-bundle-001',
    name: 'Product Bundle',
    type: {bundle: true}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('QuickViewTrigger', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('UT-TRIG-001 — trigger renders for simple product', () => {
        const {getByTestId} = render(<QuickViewTrigger product={simpleProduct} />)
        expect(getByTestId(`quick-view-trigger-${simpleProduct.id}`)).toBeInTheDocument()
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
        const {getByTestId} = render(<QuickViewTrigger product={simpleProduct} />)
        const btn = getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        fireEvent.click(btn)
        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
        expect(mockOpenQuickView).toHaveBeenCalledWith(simpleProduct)
    })

    it('UT-TRIG-005 — trigger does not navigate (stopPropagation)', () => {
        const mockParentClick = jest.fn()
        const {getByTestId} = render(
            <div onClick={mockParentClick}>
                <a href="/product/prod-simple-001">
                    <span>Product Image</span>
                </a>
                <QuickViewTrigger product={simpleProduct} />
            </div>
        )

        const btn = getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        fireEvent.click(btn)

        // The click should NOT have propagated to the parent
        expect(mockParentClick).not.toHaveBeenCalled()
    })

    it('UT-TRIG-006 — trigger SSR / hydration safety (renders without throwing, button in DOM)', () => {
        // The component uses the isMounted pattern: onClick is noop until useEffect fires.
        // In JSDOM, useEffect fires synchronously after render, so the final state IS mounted.
        // The SSR contract: the component renders without throwing and produces a button element.
        const {getByTestId} = render(<QuickViewTrigger product={simpleProduct} />)
        const btn = getByTestId(`quick-view-trigger-${simpleProduct.id}`)

        expect(btn).toBeInTheDocument()
        expect(btn).toHaveAttribute('type', 'button')
    })
})
