/*
 * Unit tests for QuickView Trigger
 * Test cases: UT-TRIG-001 through UT-TRIG-006
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent} from '@testing-library/react'
import {renderToString} from 'react-dom/server'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@chakra-ui/react'
import QuickViewTrigger from './trigger'
import {useQuickView} from './context'

// Mock the context so we can control / spy on openQuickView
jest.mock('./context', () => ({
    useQuickView: jest.fn()
}))

// --- Fixtures ---
const simpleProduct = {
    id: 'prod-simple-001',
    name: 'Classic Dress',
    type: {}
}

const productSet = {
    id: 'prod-set-001',
    name: 'Set Product',
    type: {set: true}
}

const productBundle = {
    id: 'prod-bundle-001',
    name: 'Bundle Product',
    type: {bundle: true}
}

// --- Helpers ---
const mockOpenQuickView = jest.fn()
const mockCloseQuickView = jest.fn()

const Wrapper = ({children}) => (
    <IntlProvider locale="en-US" defaultLocale="en-US" messages={{}}>
        <ChakraProvider>{children}</ChakraProvider>
    </IntlProvider>
)

beforeEach(() => {
    jest.clearAllMocks()
    useQuickView.mockReturnValue({
        isOpen: false,
        openProduct: null,
        openQuickView: mockOpenQuickView,
        closeQuickView: mockCloseQuickView
    })
})

describe('QuickView Trigger', () => {
    it('UT-TRIG-001 — trigger renders for simple product', () => {
        render(
            <Wrapper>
                <QuickViewTrigger product={simpleProduct} />
            </Wrapper>
        )
        expect(
            screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`)
        ).toBeInTheDocument()
    })

    it('UT-TRIG-002 — trigger hidden for product set', () => {
        render(
            <Wrapper>
                <QuickViewTrigger product={productSet} />
            </Wrapper>
        )
        expect(
            screen.queryByTestId(/quick-view-trigger-/)
        ).not.toBeInTheDocument()
    })

    it('UT-TRIG-003 — trigger hidden for product bundle', () => {
        render(
            <Wrapper>
                <QuickViewTrigger product={productBundle} />
            </Wrapper>
        )
        expect(
            screen.queryByTestId(/quick-view-trigger-/)
        ).not.toBeInTheDocument()
    })

    it('UT-TRIG-004 — trigger calls openQuickView with the product', () => {
        render(
            <Wrapper>
                <QuickViewTrigger product={simpleProduct} />
            </Wrapper>
        )
        fireEvent.click(screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`))
        expect(mockOpenQuickView).toHaveBeenCalledTimes(1)
        expect(mockOpenQuickView).toHaveBeenCalledWith(simpleProduct)
    })

    it('UT-TRIG-005 — trigger does not navigate (click does not propagate)', () => {
        const parentClickHandler = jest.fn()
        render(
            <Wrapper>
                {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
                <div onClick={parentClickHandler}>
                    <a href="/product/prod-simple-001">
                        <QuickViewTrigger product={simpleProduct} />
                    </a>
                </div>
            </Wrapper>
        )
        fireEvent.click(screen.getByTestId(`quick-view-trigger-${simpleProduct.id}`))
        expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('UT-TRIG-006 — trigger SSR / hydration safety', () => {
        // Server-render the trigger — should not throw and should not invoke
        // any client-only side effect (useEffect does not run during renderToString).
        const html = renderToString(
            <Wrapper>
                <QuickViewTrigger product={simpleProduct} />
            </Wrapper>
        )
        // The button should be present in the server-rendered markup
        expect(html).toContain(`quick-view-trigger-${simpleProduct.id}`)
        // openQuickView should NOT have been called during server render
        expect(mockOpenQuickView).not.toHaveBeenCalled()
    })
})
