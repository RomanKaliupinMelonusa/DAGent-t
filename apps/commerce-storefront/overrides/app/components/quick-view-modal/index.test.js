/*
 * Unit tests for QuickViewModal component.
 */
import '@testing-library/jest-dom'
import React from 'react'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {IntlProvider} from 'react-intl'

// Mock @salesforce/commerce-sdk-react to prevent deep dependency resolution
jest.mock('@salesforce/commerce-sdk-react', () => ({
    useProduct: jest.fn(() => ({data: null, isFetching: false})),
    useVariant: jest.fn(() => null)
}))

// Mock the useProductViewModal hook
const mockUseProductViewModal = jest.fn()
jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: (...args) => mockUseProductViewModal(...args)
}))

// Mock ProductView to isolate modal tests
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    const MockReact = require('react')
    return {
        __esModule: true,
        default: (props) => {
            return MockReact.createElement(
                'div',
                {'data-testid': 'product-view'},
                props.product?.name &&
                    MockReact.createElement(
                        'h2',
                        {'data-testid': 'product-name'},
                        props.product.name
                    ),
                props.product?.price &&
                    MockReact.createElement(
                        'span',
                        {'data-testid': 'product-price'},
                        `$${props.product.price}`
                    ),
                props.showFullLink &&
                    MockReact.createElement(
                        'a',
                        {'data-testid': 'full-details-link', href: '#'},
                        'View Full Details'
                    ),
                props.isProductLoading &&
                    MockReact.createElement(
                        'div',
                        {'data-testid': 'product-view-loading'},
                        'Loading...'
                    ),
                MockReact.createElement(
                    'button',
                    {'data-testid': 'add-to-cart-btn'},
                    'Add to Cart'
                )
            )
        }
    }
})

// Import after mocks
import QuickViewModal from './index'

const mockProduct = {
    productId: 'test-product-123',
    productName: 'Test Shoes',
    name: 'Test Shoes',
    price: 99
}

const mockOnClose = jest.fn()

// Wrapper to provide IntlProvider
const renderWithIntl = (ui) => {
    return render(
        <IntlProvider locale="en-US" messages={{}}>
            {ui}
        </IntlProvider>
    )
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('QuickViewModal', () => {
    // --- Modal Shell Tests ---

    test('renders loading spinner when product is fetching', () => {
        mockUseProductViewModal.mockReturnValue({product: null, isFetching: true})
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('quick-view-spinner')).toBeInTheDocument()
        expect(screen.queryByTestId('product-view')).not.toBeInTheDocument()
    })

    test('renders ProductView when product is loaded', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('product-view')).toBeInTheDocument()
        expect(screen.queryByTestId('quick-view-spinner')).not.toBeInTheDocument()
    })

    test('modal has correct data-testid', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    test('modal has accessible aria-label with product name', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        const modal = screen.getByTestId('quick-view-modal')
        expect(modal).toHaveAttribute('aria-label', expect.stringContaining('Test Shoes'))
    })

    test('does not render modal content when closed', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={false} onClose={mockOnClose} />
        )
        expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
    })

    test('calls onClose when close button clicked', async () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        const closeButton = screen.getByRole('button', {name: /close/i})
        fireEvent.click(closeButton)
        await waitFor(() => {
            expect(mockOnClose).toHaveBeenCalledTimes(1)
        })
    })

    test('shows error state when product is unavailable', () => {
        mockUseProductViewModal.mockReturnValue({product: null, isFetching: false})
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('quick-view-error')).toBeInTheDocument()
        expect(screen.getByText(/no longer available/i)).toBeInTheDocument()
    })

    // --- Modal Content Tests ---

    test('passes product data to ProductView', () => {
        mockUseProductViewModal.mockReturnValue({
            product: {name: 'Ring', price: 99},
            isFetching: false
        })
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('product-name')).toHaveTextContent('Ring')
        expect(screen.getByTestId('product-price')).toHaveTextContent('$99')
    })

    test('renders View Full Details link in modal', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('full-details-link')).toBeInTheDocument()
        expect(screen.getByText('View Full Details')).toBeInTheDocument()
    })

    test('renders Add to Cart button in modal', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        expect(screen.getByTestId('add-to-cart-btn')).toBeInTheDocument()
    })

    // --- Accessibility Tests ---

    test('Escape key closes modal', () => {
        mockUseProductViewModal.mockReturnValue({product: mockProduct, isFetching: false})
        renderWithIntl(
            <QuickViewModal product={mockProduct} isOpen={true} onClose={mockOnClose} />
        )
        fireEvent.keyDown(screen.getByTestId('quick-view-modal'), {key: 'Escape'})
        expect(mockOnClose).toHaveBeenCalled()
    })

    test('aria-label falls back to generic text when product name missing', () => {
        mockUseProductViewModal.mockReturnValue({product: {}, isFetching: false})
        renderWithIntl(
            <QuickViewModal
                product={{productId: 'no-name'}}
                isOpen={true}
                onClose={mockOnClose}
            />
        )
        const modal = screen.getByTestId('quick-view-modal')
        expect(modal).toHaveAttribute('aria-label', expect.stringContaining('product'))
    })
})
