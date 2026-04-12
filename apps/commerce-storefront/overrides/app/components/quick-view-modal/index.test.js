/*
 * Unit tests for QuickViewModal component
 */

import React from 'react'
import {screen, fireEvent, render} from '@testing-library/react'
import '@testing-library/jest-dom'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import theme from '@salesforce/retail-react-app/app/theme'

// Mock the datacloud module before any imports that might trigger it
jest.mock('@salesforce/cc-datacloud-typescript', () => ({
    initDataCloudSdk: jest.fn()
}))

import QuickViewModal from './index'
import {useProductViewModal} from '@salesforce/retail-react-app/app/hooks/use-product-view-modal'

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

// Mock WarningTwoIcon
jest.mock('@chakra-ui/icons', () => ({
    WarningTwoIcon: (props) => {
        const React = require('react')
        return React.createElement('svg', {'data-testid': 'warning-icon', ...props})
    }
}))

const mockProduct = {
    productId: 'test-product-1',
    productName: 'Test Shoes',
    name: 'Test Shoes',
    price: 99,
    currency: 'USD',
    variationAttributes: [],
    imageGroups: []
}

const mockOnClose = jest.fn()

// Simple wrapper with minimal providers
const renderModal = (ui) => {
    return render(
        <ChakraProvider theme={theme}>
            <IntlProvider locale="en-US" defaultLocale="en-US" messages={{}}>
                {ui}
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
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('quick-view-spinner')).toBeInTheDocument()
        expect(screen.queryByTestId('product-view')).toBeNull()
    })

    test('renders ProductView when product is loaded', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('product-view')).toBeInTheDocument()
        expect(screen.queryByTestId('quick-view-spinner')).toBeNull()
    })

    test('modal has correct data-testid', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    test('modal has accessible aria-label with product name', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        const modal = screen.getByTestId('quick-view-modal')
        expect(modal.getAttribute('aria-label')).toContain('Test Shoes')
    })

    test('does not render modal content when closed', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={false} onClose={mockOnClose} />
        )
        expect(screen.queryByTestId('quick-view-modal')).toBeNull()
    })

    test('calls onClose when close button clicked', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        const closeButton = screen.getByRole('button', {name: /close/i})
        fireEvent.click(closeButton)
        expect(mockOnClose).toHaveBeenCalledTimes(1)
    })

    test('shows error state when product is unavailable', () => {
        useProductViewModal.mockReturnValue({product: null, isFetching: false})
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        const errorEl = screen.getByTestId('quick-view-error')
        expect(errorEl).toBeInTheDocument()
        expect(errorEl.textContent).toContain('no longer available')
    })

    // --- Modal Content (ProductView integration via stub) ---

    test('passes product data to ProductView', () => {
        useProductViewModal.mockReturnValue({
            product: {name: 'Ring', price: 99},
            isFetching: false
        })
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('product-name')).toHaveTextContent('Ring')
        expect(screen.getByTestId('product-price')).toHaveTextContent('$99')
    })

    test('renders "View Full Details" link in modal', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('full-details-link')).toBeInTheDocument()
        expect(screen.getByTestId('full-details-link')).toHaveTextContent('View Full Details')
    })

    test('renders Add to Cart button in modal', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('add-to-cart-btn')).toBeInTheDocument()
    })

    // --- Accessibility ---

    test('Escape key closes modal', () => {
        useProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderModal(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        fireEvent.keyDown(screen.getByTestId('quick-view-modal'), {key: 'Escape'})
        expect(mockOnClose).toHaveBeenCalled()
    })

    test('aria-label falls back to generic text when product name missing', () => {
        const noNameProduct = {productId: 'xyz'}
        useProductViewModal.mockReturnValue({product: noNameProduct, isFetching: false})
        renderModal(
            <QuickViewModal product={noNameProduct} isOpen={true} onClose={mockOnClose} />
        )
        const modal = screen.getByTestId('quick-view-modal')
        expect(modal.getAttribute('aria-label')).toContain('product')
    })
})
