/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import theme from '@salesforce/retail-react-app/app/theme'
import {IntlProvider} from 'react-intl'
import {BrowserRouter} from 'react-router-dom'

// Mock the useProductViewModal hook
jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: jest.fn()
}))

// Mock ProductView to avoid deep dependency chains
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    const React = require('react')
    return {
        __esModule: true,
        default: (props) => {
            return React.createElement(
                'div',
                {'data-testid': 'product-view'},
                props.product?.name &&
                    React.createElement(
                        'h2',
                        {'data-testid': 'product-name'},
                        props.product.name
                    ),
                props.product?.price &&
                    React.createElement(
                        'span',
                        {'data-testid': 'product-price'},
                        `$${props.product.price}`
                    ),
                props.showFullLink &&
                    React.createElement(
                        'a',
                        {'data-testid': 'full-details-link', href: '#'},
                        'View Full Details'
                    ),
                props.isProductLoading &&
                    React.createElement(
                        'div',
                        {'data-testid': 'product-view-loading'},
                        'Loading...'
                    ),
                React.createElement(
                    'button',
                    {'data-testid': 'add-to-cart-btn'},
                    'Add to Cart'
                )
            )
        }
    }
})

import QuickViewModal from './index'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'

const mockProduct = {
    productId: 'test-product-123',
    productName: 'Test Shoes',
    name: 'Test Shoes',
    price: 99
}

/**
 * Lightweight test renderer with minimal providers.
 */
const renderWithProviders = (ui) => {
    return render(
        <ChakraProvider theme={theme}>
            <IntlProvider locale="en-US" defaultLocale="en-US" messages={{}}>
                <BrowserRouter>{ui}</BrowserRouter>
            </IntlProvider>
        </ChakraProvider>
    )
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('QuickViewModal', () => {
    // --- Modal Shell Tests ---
    test('renders loading spinner when product is fetching', () => {
        useProductViewModal.mockReturnValue({product: null, isFetching: true})
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={jest.fn()} />
        )
        expect(screen.getByTestId('quick-view-spinner')).toBeInTheDocument()
        expect(screen.queryByTestId('product-view')).not.toBeInTheDocument()
    })

    test('renders ProductView when product is loaded', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={jest.fn()} />
        )
        expect(screen.getByTestId('product-view')).toBeInTheDocument()
        expect(screen.queryByTestId('quick-view-spinner')).not.toBeInTheDocument()
    })

    test('modal has correct data-testid', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={jest.fn()} />
        )
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    test('modal has accessible aria-label with product name', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={jest.fn()} />
        )
        const modal = screen.getByTestId('quick-view-modal')
        expect(modal.getAttribute('aria-label')).toContain('Test Shoes')
    })

    test('does not render modal content when closed', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={false} onClose={jest.fn()} />
        )
        expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    test('calls onClose when close button clicked', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        const onCloseMock = jest.fn()
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={onCloseMock} />
        )
        const closeButton = screen.getByLabelText('Close')
        fireEvent.click(closeButton)
        expect(onCloseMock).toHaveBeenCalledTimes(1)
    })

    test('shows error state when product is unavailable', () => {
        useProductViewModal.mockReturnValue({product: null, isFetching: false})
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={jest.fn()} />
        )
        const errorEl = screen.getByTestId('quick-view-error')
        expect(errorEl).toBeInTheDocument()
        expect(errorEl.textContent).toContain('no longer available')
    })

    // --- Modal Content Tests (ProductView integration via stub) ---
    test('passes product data to ProductView', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={jest.fn()} />
        )
        expect(screen.getByTestId('product-name')).toHaveTextContent('Test Shoes')
        expect(screen.getByTestId('product-price')).toHaveTextContent('$99')
    })

    test('renders "View Full Details" link in modal', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={jest.fn()} />
        )
        expect(screen.getByTestId('full-details-link')).toBeInTheDocument()
        expect(screen.getByTestId('full-details-link')).toHaveTextContent('View Full Details')
    })

    test('renders Add to Cart button in modal', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={jest.fn()} />
        )
        expect(screen.getByTestId('add-to-cart-btn')).toBeInTheDocument()
    })

    // --- Accessibility Tests ---
    test('Escape key closes modal', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        const onCloseMock = jest.fn()
        renderWithProviders(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={onCloseMock} />
        )
        fireEvent.keyDown(screen.getByTestId('quick-view-modal'), {key: 'Escape'})
        expect(onCloseMock).toHaveBeenCalled()
    })

    test('aria-label falls back to generic text when product name missing', () => {
        const productNoName = {productId: 'no-name-123'}
        useProductViewModal.mockReturnValue({product: productNoName, isFetching: false})
        renderWithProviders(
            <QuickViewModal product={productNoName} isOpen={true} onClose={jest.fn()} />
        )
        const modal = screen.getByTestId('quick-view-modal')
        expect(modal.getAttribute('aria-label')).toContain('product')
    })
})
