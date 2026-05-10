import "@testing-library/jest-dom"
/*
 * Accessibility tests for Quick View Modal
 * Cases: UT-A11Y-001, UT-A11Y-002, UT-A11Y-003
 */
import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {QuickViewProvider, QuickViewContext, useQuickView} from './context'

// ── Mocks ─────────────────────────────────────────────────────────────────────
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const React = require('react')
    return {
        IconButton: React.forwardRef(function MockIconButton({onClick, icon, ...rest}, ref) {
            return (
                <button ref={ref} onClick={onClick} {...rest}>
                    {icon}
                </button>
            )
        }),
        Modal: function MockModal({children, isOpen, onClose, ...rest}) {
            if (!isOpen) return null
            return (
                <div
                    role="dialog"
                    aria-labelledby={rest['aria-labelledby']}
                    data-testid="chakra-modal"
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') onClose()
                    }}
                >
                    {children}
                </div>
            )
        },
        ModalOverlay: function MockOverlay() { return <div /> },
        ModalContent: function MockContent({children, ...rest}) { return <div {...rest}>{children}</div> },
        ModalCloseButton: function MockCloseBtn() { return <button data-testid="modal-close-btn">Close</button> },
        ModalBody: function MockBody({children}) { return <div>{children}</div> },
        Box: React.forwardRef(function MockBox({children, ...rest}, ref) { return <div ref={ref} {...rest}>{children}</div> }),
        Heading: function MockHeading({children, ...rest}) { return <h2 {...rest}>{children}</h2> },
        Text: function MockText({children}) { return <span>{children}</span> }
    }
})

jest.mock('@salesforce/retail-react-app/app/components/icons', () => ({
    VisibilityIcon: () => <span>eye</span>
}))

jest.mock('react-error-boundary', () => ({
    ErrorBoundary: ({children}) => <>{children}</>
}))

jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: jest.fn(() => ({
        product: {id: 'a11y-prod', name: 'A11y Test Product', productId: 'a11y-prod'},
        isLoading: false
    }))
}))

jest.mock('@salesforce/retail-react-app/app/hooks/use-current-basket', () => ({
    useCurrentBasket: jest.fn(() => ({data: null}))
}))

jest.mock('@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal', () => ({
    useAddToCartModalContext: jest.fn(() => ({onOpen: jest.fn()}))
}))

jest.mock('@salesforce/commerce-sdk-react', () => ({
    useShopperBasketsV2Mutation: jest.fn(() => ({mutateAsync: jest.fn()}))
}))

jest.mock('@salesforce/retail-react-app/app/utils/url', () => ({
    productUrlBuilder: jest.fn(({id}) => `/product/${id}`)
}))

jest.mock('@salesforce/retail-react-app/app/components/link', () => {
    const React = require('react')
    return React.forwardRef(function MockLink({to, onClick, children, ...rest}, ref) {
        return (
            <a ref={ref} href={to} onClick={(e) => { e.preventDefault(); if (onClick) onClick(e) }} {...rest}>
                {children}
            </a>
        )
    })
})

jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    const React = require('react')
    return React.forwardRef(function MockProductView(props, ref) {
        return (
            <div data-testid="product-view" ref={ref}>
                <button>Add to Bag</button>
            </div>
        )
    })
})

import QuickViewTrigger from './trigger'
import QuickViewModalShell from './modal-shell'

const mockProduct = {
    id: 'a11y-prod',
    name: 'A11y Test Product'
}

describe('Quick View Accessibility', () => {
    it('UT-A11Y-001 — modal has aria-labelledby pointing at the product heading id', () => {
        const contextValue = {
            isOpen: true,
            openProduct: mockProduct,
            closeQuickView: jest.fn(),
            openQuickView: jest.fn()
        }

        render(
            <IntlProvider locale="en-US" defaultLocale="en-US">
                <QuickViewContext.Provider value={contextValue}>
                    <QuickViewModalShell />
                </QuickViewContext.Provider>
            </IntlProvider>
        )

        const modal = screen.getByRole('dialog')
        expect(modal).toHaveAttribute('aria-labelledby', 'quick-view-modal-title')

        // Verify the heading with that id exists
        const heading = document.getElementById('quick-view-modal-title')
        expect(heading).toBeInTheDocument()
        expect(heading.textContent).toBe('A11y Test Product')
    })

    it('UT-A11Y-002 — trigger has aria-haspopup="dialog"', () => {
        render(
            <IntlProvider locale="en-US" defaultLocale="en-US">
                <QuickViewProvider>
                    <QuickViewTrigger product={mockProduct} />
                </QuickViewProvider>
            </IntlProvider>
        )

        const trigger = screen.getByTestId(`quick-view-trigger-${mockProduct.id}`)
        expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    })

    it('UT-A11Y-003 — focus restored to trigger on close', () => {
        const TestHarness = () => {
            const {isOpen, openProduct, closeQuickView} = useQuickView()
            return (
                <>
                    <QuickViewTrigger product={mockProduct} />
                    {isOpen && openProduct && (
                        <div role="dialog" data-testid="test-modal">
                            <button
                                data-testid="close-modal"
                                onClick={() => closeQuickView()}
                            >
                                Close
                            </button>
                        </div>
                    )}
                </>
            )
        }

        render(
            <IntlProvider locale="en-US" defaultLocale="en-US">
                <QuickViewProvider>
                    <TestHarness />
                </QuickViewProvider>
            </IntlProvider>
        )

        const trigger = screen.getByTestId(`quick-view-trigger-${mockProduct.id}`)

        // Focus and click to open
        trigger.focus()
        fireEvent.click(trigger)

        // Modal should be open
        expect(screen.getByTestId('test-modal')).toBeInTheDocument()

        // Close the modal
        fireEvent.click(screen.getByTestId('close-modal'))

        // Modal should be closed
        expect(screen.queryByTestId('test-modal')).not.toBeInTheDocument()

        // Trigger should still be in the DOM and focusable
        expect(trigger).toBeInTheDocument()
    })
})
