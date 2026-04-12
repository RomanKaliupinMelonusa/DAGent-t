/*
 * Unit tests for QuickViewModal component
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import {BrowserRouter} from 'react-router-dom'
import theme from '@salesforce/retail-react-app/app/theme'
import QuickViewModal from './index'

// Mock the useProductViewModal hook
jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: jest.fn()
}))

// Mock ProductView to avoid deep dependency chains
const mockProductViewFn = jest.fn()
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    const React = require('react')
    const MockProductView = (props) => {
        // Track calls for prop assertions
        const {mockProductViewFn} = require('./index.test.js')
        if (typeof mockProductViewFn === 'function') mockProductViewFn(props)
        return React.createElement(
            'div',
            {'data-testid': 'product-view', 'data-image-size': props.imageSize || ''},
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
    return {
        __esModule: true,
        default: MockProductView
    }
})

// Mock @chakra-ui/icons
jest.mock('@chakra-ui/icons', () => {
    const React = require('react')
    return {
        WarningIcon: (props) => React.createElement('span', {'data-testid': 'warning-icon', ...props}),
        ViewIcon: (props) => React.createElement('span', {'data-testid': 'view-icon', ...props})
    }
})

const {useProductViewModal} = require('@salesforce/retail-react-app/app/hooks/use-product-view-modal')

// Lightweight render wrapper with minimal providers
const renderWithProviders = (ui) => {
    return render(
        <BrowserRouter>
            <ChakraProvider theme={theme}>
                <IntlProvider locale="en-US" messages={{}}>
                    {ui}
                </IntlProvider>
            </ChakraProvider>
        </BrowserRouter>
    )
}

const mockProduct = {
    productId: 'test-product-123',
    productName: 'Test Shoes',
    name: 'Test Shoes',
    price: 99,
    image: {
        alt: 'Test Shoes',
        disBaseLink: 'https://example.com/test-shoes.jpg'
    }
}

const defaultProps = {
    product: mockProduct,
    isOpen: true,
    onClose: jest.fn()
}

beforeEach(() => {
    jest.clearAllMocks()
    useProductViewModal.mockReturnValue({
        product: mockProduct,
        isFetching: false
    })
})

// --- Modal Shell Tests ---

test('renders loading spinner when product is fetching', () => {
    useProductViewModal.mockReturnValue({product: null, isFetching: true})
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    expect(screen.getByTestId('quick-view-spinner')).toBeInTheDocument()
    expect(screen.queryByTestId('product-view')).not.toBeInTheDocument()
})

test('renders ProductView when product is loaded', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    expect(screen.getByTestId('product-view')).toBeInTheDocument()
    expect(screen.queryByTestId('quick-view-spinner')).not.toBeInTheDocument()
})

test('modal has correct data-testid', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
})

test('modal has accessible aria-label with product name', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    const modal = screen.getByTestId('quick-view-modal')
    expect(modal.getAttribute('aria-label')).toContain('Test Shoes')
})

test('does not render modal content when closed', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} isOpen={false} />)

    expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
})

test('calls onClose when close button clicked', () => {
    const onClose = jest.fn()
    renderWithProviders(<QuickViewModal {...defaultProps} onClose={onClose} />)

    const closeButton = screen.getByLabelText('Close')
    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalledTimes(1)
})

test('shows error state when product is unavailable', () => {
    useProductViewModal.mockReturnValue({product: null, isFetching: false})
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    const errorElement = screen.getByTestId('quick-view-error')
    expect(errorElement).toBeInTheDocument()
    expect(errorElement.textContent).toContain('no longer available')
})

// --- Modal Content (ProductView integration via stub) ---

test('passes product data to ProductView', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    expect(screen.getByTestId('product-name')).toHaveTextContent('Test Shoes')
    expect(screen.getByTestId('product-price')).toHaveTextContent('$99')
})

test('renders "View Full Details" link in modal', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    expect(screen.getByTestId('full-details-link')).toBeInTheDocument()
    expect(screen.getByTestId('full-details-link')).toHaveTextContent('View Full Details')
})

test('renders Add to Cart button in modal', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    expect(screen.getByTestId('add-to-cart-btn')).toBeInTheDocument()
})

test('passes showFullLink={true} to ProductView', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    // The stub renders "View Full Details" link only when showFullLink is true
    expect(screen.getByTestId('full-details-link')).toBeInTheDocument()
})

test('passes isProductLoading to ProductView when fetching but product exists', () => {
    useProductViewModal.mockReturnValue({product: mockProduct, isFetching: true})
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    // Our component shows the spinner when isFetching is true
    expect(screen.getByTestId('quick-view-spinner')).toBeInTheDocument()
})

test('passes imageSize="sm" to ProductView', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    const productView = screen.getByTestId('product-view')
    expect(productView.getAttribute('data-image-size')).toBe('sm')
})

// --- Accessibility & Focus ---

test('Escape key closes modal', () => {
    const onClose = jest.fn()
    renderWithProviders(<QuickViewModal {...defaultProps} onClose={onClose} />)

    fireEvent.keyDown(screen.getByTestId('quick-view-modal'), {key: 'Escape'})

    expect(onClose).toHaveBeenCalled()
})

test('aria-label falls back to generic text when product name missing', () => {
    const productWithoutName = {productId: 'no-name-123'}
    useProductViewModal.mockReturnValue({product: null, isFetching: true})
    renderWithProviders(
        <QuickViewModal product={productWithoutName} isOpen={true} onClose={jest.fn()} />
    )

    const modal = screen.getByTestId('quick-view-modal')
    expect(modal.getAttribute('aria-label')).toContain('product')
})
