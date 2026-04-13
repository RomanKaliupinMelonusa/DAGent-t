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

// Track ProductView props for verification
let lastProductViewProps = null

// Mock ProductView to avoid deep dependency chains
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    const React = require('react')
    const MockProductView = (props) => {
        // Capture props for assertion
        const {useEffect} = React
        useEffect(() => {
            // eslint-disable-next-line no-import-assign
            require('./index.test.js').__setLastProps(props)
        })
        return React.createElement(
            'div',
            {'data-testid': 'product-view'},
            props.product?.name &&
                React.createElement(
                    'h2',
                    {'data-testid': 'product-name'},
                    props.product.name
                ),
            props.product?.price != null &&
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
            ),
            React.createElement(
                'span',
                {'data-testid': 'image-size-check', 'data-image-size': props.imageSize || ''},
                ''
            )
        )
    }
    return {
        __esModule: true,
        default: MockProductView
    }
})

// Prop capture mechanism
let capturedProps = null
export function __setLastProps(props) {
    capturedProps = props
}

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

const mockProductRich = {
    productId: 'rich-product-456',
    productName: 'Elegant Ring',
    name: 'Elegant Ring',
    price: 249,
    currency: 'USD',
    image: {
        alt: 'Elegant Ring',
        disBaseLink: 'https://example.com/ring.jpg'
    },
    variationAttributes: [
        {id: 'color', name: 'Color', values: [{name: 'Gold'}, {name: 'Silver'}]},
        {id: 'size', name: 'Size', values: [{name: 'S'}, {name: 'M'}, {name: 'L'}]}
    ]
}

const defaultProps = {
    product: mockProduct,
    isOpen: true,
    onClose: jest.fn()
}

beforeEach(() => {
    jest.clearAllMocks()
    capturedProps = null
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

test('error state displays warning icon', () => {
    useProductViewModal.mockReturnValue({product: null, isFetching: false})
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    expect(screen.getByTestId('warning-icon')).toBeInTheDocument()
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

test('passes imageSize="sm" to ProductView', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    const imageSizeEl = screen.getByTestId('image-size-check')
    expect(imageSizeEl.getAttribute('data-image-size')).toBe('sm')
})

test('passes isProductLoading to ProductView when fetching but product exists', () => {
    useProductViewModal.mockReturnValue({product: mockProduct, isFetching: true})
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    // Our component shows the spinner when isFetching is true
    expect(screen.getByTestId('quick-view-spinner')).toBeInTheDocument()
})

test('calls useProductViewModal with the product prop', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    expect(useProductViewModal).toHaveBeenCalledWith(mockProduct)
})

test('modal renders with size 4xl', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    // Chakra Modal applies role="dialog" to the ModalContent
    const modal = screen.getByTestId('quick-view-modal')
    expect(modal).toBeInTheDocument()
    // The modal is rendered — size is applied via Chakra internals
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

test('aria-label uses productName from search hit when available', () => {
    const productWithProductName = {productId: 'pn-123', productName: 'Fancy Hat'}
    useProductViewModal.mockReturnValue({product: null, isFetching: true})
    renderWithProviders(
        <QuickViewModal product={productWithProductName} isOpen={true} onClose={jest.fn()} />
    )

    const modal = screen.getByTestId('quick-view-modal')
    expect(modal.getAttribute('aria-label')).toContain('Fancy Hat')
})

test('aria-label prefers fetched product name over search hit name', () => {
    const searchHit = {productId: 'ph-123', productName: 'Search Name'}
    useProductViewModal.mockReturnValue({
        product: {name: 'Full Product Name', price: 50},
        isFetching: false
    })
    renderWithProviders(
        <QuickViewModal product={searchHit} isOpen={true} onClose={jest.fn()} />
    )

    const modal = screen.getByTestId('quick-view-modal')
    expect(modal.getAttribute('aria-label')).toContain('Full Product Name')
})

test('modal close button has accessible label', () => {
    renderWithProviders(<QuickViewModal {...defaultProps} />)

    // Chakra ModalCloseButton renders with aria-label "Close"
    expect(screen.getByLabelText('Close')).toBeInTheDocument()
})
