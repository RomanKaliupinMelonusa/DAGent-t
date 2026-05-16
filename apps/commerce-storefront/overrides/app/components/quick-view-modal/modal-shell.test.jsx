/*
 * Unit tests for Quick View Modal Shell
 * Cases: UT-SHELL-001 through UT-SHELL-005
 */
import React from 'react'
import '@testing-library/jest-dom/extend-expect'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {QuickViewContext} from './context'

// Mock all heavy dependencies that modal-body imports
jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: jest.fn(() => ({product: null, isFetching: false}))
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
jest.mock('@salesforce/retail-react-app/app/hooks', () => ({
    useDerivedProduct: jest.fn(() => ({
        variant: null,
        quantity: 1,
        showInventoryMessage: false,
        stockLevel: 10
    }))
}))
jest.mock('@salesforce/retail-react-app/app/hooks/use-toast', () => ({
    useToast: jest.fn(() => jest.fn())
}))
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    return function MockProductView() {
        return <div data-testid="mock-product-view">ProductView</div>
    }
})
jest.mock('@salesforce/retail-react-app/app/components/link', () => {
    return function MockLink({children, ...props}) {
        return <a {...props}>{children}</a>
    }
})
jest.mock('@salesforce/retail-react-app/app/utils/url', () => ({
    productUrlBuilder: jest.fn(() => '/product/test-id')
}))
jest.mock('@salesforce/retail-react-app/app/constants', () => ({
    API_ERROR_MESSAGE: {id: 'global.error.something_went_wrong', defaultMessage: 'Something went wrong'}
}))

import QuickViewModalShell from './modal-shell'

const sampleProduct = {
    id: 'prod-shell-001',
    productId: 'prod-shell-001',
    productName: 'Shell Test Product',
    name: 'Shell Test Product'
}

const renderShell = (contextValue) => {
    return render(
        <IntlProvider locale="en-GB" defaultLocale="en-GB">
            <QuickViewContext.Provider value={contextValue}>
                <QuickViewModalShell />
            </QuickViewContext.Provider>
        </IntlProvider>
    )
}

describe('QuickViewModalShell', () => {
    it('UT-SHELL-001 — modal not rendered when closed', () => {
        renderShell({
            isOpen: false,
            openProduct: null,
            closeQuickView: jest.fn()
        })

        expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    it('UT-SHELL-002 — modal rendered when open', () => {
        renderShell({
            isOpen: true,
            openProduct: sampleProduct,
            closeQuickView: jest.fn()
        })

        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    it('UT-SHELL-003 — close button calls closeQuickView', () => {
        const closeQuickView = jest.fn()
        renderShell({
            isOpen: true,
            openProduct: sampleProduct,
            closeQuickView
        })

        // Chakra ModalCloseButton renders a button with aria-label "Close"
        const closeBtn = screen.getByRole('button', {name: /close/i})
        fireEvent.click(closeBtn)

        expect(closeQuickView).toHaveBeenCalled()
    })

    it('UT-SHELL-004 — Escape key calls closeQuickView', () => {
        const closeQuickView = jest.fn()
        renderShell({
            isOpen: true,
            openProduct: sampleProduct,
            closeQuickView
        })

        // Chakra binds onKeyDown on the dialog element itself
        const dialog = screen.getByRole('dialog')
        fireEvent.keyDown(dialog, {key: 'Escape', code: 'Escape'})

        expect(closeQuickView).toHaveBeenCalled()
    })

    it('UT-SHELL-005 — error boundary surfaces quick-view-modal-error on body throw', () => {
        // Make useProductViewModal throw to trigger the error boundary
        const {useProductViewModal} = require('@salesforce/retail-react-app/app/hooks/use-product-view-modal')
        useProductViewModal.mockImplementation(() => {
            throw new Error('Fetch failed')
        })

        // Suppress console.error from error boundary
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

        renderShell({
            isOpen: true,
            openProduct: sampleProduct,
            closeQuickView: jest.fn()
        })

        expect(screen.getByTestId('quick-view-modal-error')).toBeInTheDocument()
        // Shell (modal) should still be mounted
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()

        consoleSpy.mockRestore()
        // Restore the mock
        useProductViewModal.mockImplementation(() => ({product: null, isFetching: false}))
    })
})
