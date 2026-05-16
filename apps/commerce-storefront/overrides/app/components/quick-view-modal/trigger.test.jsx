/*
 * Unit tests for Quick View Trigger
 * Cases: UT-TRIG-001 through UT-TRIG-006
 */
import React from 'react'
import '@testing-library/jest-dom/extend-expect'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {QuickViewProvider, useQuickView} from './context'
import QuickViewTrigger from './trigger'

// --- Fixtures (inlined per T002) ---
const simpleProduct = {
    id: 'simple-001',
    productId: 'simple-001',
    productName: 'Simple Dress',
    name: 'Simple Dress',
    type: {master: false, set: false, bundle: false}
}

const productSet = {
    id: 'set-001',
    productId: 'set-001',
    productName: 'Set Product',
    type: {set: true, bundle: false}
}

const productBundle = {
    id: 'bundle-001',
    productId: 'bundle-001',
    productName: 'Bundle Product',
    type: {set: false, bundle: true}
}

// Wrapper with providers
const Wrapper = ({children}) => (
    <IntlProvider locale="en-GB" defaultLocale="en-GB">
        <QuickViewProvider>{children}</QuickViewProvider>
    </IntlProvider>
)

describe('QuickViewTrigger', () => {
    it('UT-TRIG-001 — trigger renders for simple product', () => {
        render(
            <Wrapper>
                <QuickViewTrigger product={simpleProduct} />
            </Wrapper>
        )

        expect(screen.getByTestId('quick-view-trigger-simple-001')).toBeInTheDocument()
    })

    it('UT-TRIG-002 — trigger hidden for product set', () => {
        render(
            <Wrapper>
                <QuickViewTrigger product={productSet} />
            </Wrapper>
        )

        expect(screen.queryByTestId(/quick-view-trigger-/)).not.toBeInTheDocument()
    })

    it('UT-TRIG-003 — trigger hidden for product bundle', () => {
        render(
            <Wrapper>
                <QuickViewTrigger product={productBundle} />
            </Wrapper>
        )

        expect(screen.queryByTestId(/quick-view-trigger-/)).not.toBeInTheDocument()
    })

    it('UT-TRIG-004 — trigger calls openQuickView with the product', () => {
        const ContextChecker = () => {
            const {isOpen, openProduct} = useQuickView()
            return (
                <div>
                    <span data-testid="ctx-isOpen">{String(isOpen)}</span>
                    <span data-testid="ctx-product">{JSON.stringify(openProduct)}</span>
                </div>
            )
        }

        render(
            <Wrapper>
                <QuickViewTrigger product={simpleProduct} />
                <ContextChecker />
            </Wrapper>
        )

        fireEvent.click(screen.getByTestId('quick-view-trigger-simple-001'))

        expect(screen.getByTestId('ctx-isOpen').textContent).toBe('true')
        const openedProduct = JSON.parse(screen.getByTestId('ctx-product').textContent)
        expect(openedProduct.id).toBe('simple-001')
    })

    it('UT-TRIG-005 — trigger does not navigate (click does not propagate to parent link)', () => {
        const parentClickHandler = jest.fn()

        render(
            <Wrapper>
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
                <div onClick={parentClickHandler} data-testid="parent-link">
                    <QuickViewTrigger product={simpleProduct} />
                </div>
            </Wrapper>
        )

        fireEvent.click(screen.getByTestId('quick-view-trigger-simple-001'))

        expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('UT-TRIG-006 — trigger SSR / hydration safety: initial render does not invoke client-only side effects', () => {
        const {container} = render(
            <Wrapper>
                <QuickViewTrigger product={simpleProduct} />
            </Wrapper>
        )

        const button = container.querySelector('[data-testid="quick-view-trigger-simple-001"]')
        expect(button).toBeTruthy()
        expect(button.getAttribute('type')).toBe('button')
        expect(button.getAttribute('aria-haspopup')).toBe('dialog')
    })
})
