/*
 * Unit tests for the QuickViewModal component.
 * Validates: rendering, error boundary, add-to-cart flow, close behavior,
 * view-full-details link, inventory message, and disabled button states.
 */
import React from 'react'
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import '@testing-library/jest-dom'
import {BrowserRouter} from 'react-router-dom'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import {mockProductSearchItem} from '@salesforce/retail-react-app/app/mocks/product-search-hit-data'

// Mock all external hooks used by QuickViewModal
const mockOnOpen = jest.fn()
const mockAddItemToNewOrExistingBasket = jest.fn()
const mockUseProductViewModal = jest.fn()
const mockUseDerivedProduct = jest.fn()

// Track whether ProductView should throw — prefixed with `mock` so jest.mock can access it
const mockShouldThrow = {value: false}

jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: (...args) => mockUseProductViewModal(...args)
}))

jest.mock('@salesforce/retail-react-app/app/hooks', () => ({
    useDerivedProduct: (...args) => mockUseDerivedProduct(...args)
}))

jest.mock('@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal', () => ({
    useAddToCartModalContext: () => ({onOpen: mockOnOpen})
}))

jest.mock('@salesforce/commerce-sdk-react', () => ({
    useShopperBasketsV2MutationHelper: () => ({
        addItemToNewOrExistingBasket: mockAddItemToNewOrExistingBasket
    })
}))

jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    const MockProductView = (props) => {
        if (mockShouldThrow.value) {
            throw new Error('Product render failed')
        }
        return (
            <div data-testid="product-view">
                {props.product?.productName || 'Product View'}
                {props.showDeliveryOptions !== undefined && (
                    <span data-testid="delivery-options-flag">
                        {String(props.showDeliveryOptions)}
                    </span>
                )}
            </div>
        )
    }
    MockProductView.displayName = 'MockProductView'
    return {__esModule: true, default: MockProductView}
})

jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const originalModule = jest.requireActual(
        '@salesforce/retail-react-app/app/components/shared/ui'
    )
    return {
        ...originalModule,
        useBreakpointValue: jest.fn().mockReturnValue('5xl')
    }
})

jest.mock('@salesforce/retail-react-app/app/components/link', () => {
    const MockLink = ({to, children, ...props}) => (
        <a href={to} {...props}>
            {children}
        </a>
    )
    MockLink.displayName = 'MockLink'
    return {__esModule: true, default: MockLink}
})

// Import the component under test AFTER mocks are set up
import QuickViewModal from '../../quick-view-modal/index'

// Simple render wrapper that provides needed contexts
function renderWithProviders(ui) {
    return render(
        <BrowserRouter>
            <ChakraProvider>
                <IntlProvider locale="en" defaultLocale="en" messages={{}}>
                    {ui}
                </IntlProvider>
            </ChakraProvider>
        </BrowserRouter>
    )
}

// Helper to set up default mock return values
function setupMocks(overrides = {}) {
    const defaults = {
        product: {
            ...mockProductSearchItem,
            id: mockProductSearchItem.productId,
            variationAttributes: mockProductSearchItem.variationAttributes || [],
            inventory: {orderable: true}
        },
        isFetching: false,
        variant: {productId: 'variant-123', orderable: true},
        quantity: 1,
        showInventoryMessage: false,
        inventoryMessage: '',
        stockLevel: 10,
        isOutOfStock: false
    }

    const merged = {...defaults, ...overrides}

    mockUseProductViewModal.mockReturnValue({
        product: merged.product,
        isFetching: merged.isFetching
    })

    mockUseDerivedProduct.mockReturnValue({
        variant: merged.variant,
        quantity: merged.quantity,
        showInventoryMessage: merged.showInventoryMessage,
        inventoryMessage: merged.inventoryMessage,
        stockLevel: merged.stockLevel,
        isOutOfStock: merged.isOutOfStock
    })
}

describe('QuickViewModal', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockShouldThrow.value = false
        setupMocks()
    })

    describe('Rendering', () => {
        test('renders nothing visible when isOpen is false', () => {
            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={false}
                    onClose={jest.fn()}
                />
            )

            expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
        })

        test('renders modal with required test ids when open', () => {
            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
            expect(screen.getByTestId('quick-view-modal-close-btn')).toBeInTheDocument()
            expect(screen.getByTestId('product-view')).toBeInTheDocument()
            expect(screen.getByTestId('quick-view-add-to-cart-btn')).toBeInTheDocument()
            expect(screen.getByTestId('quick-view-view-full-details-link')).toBeInTheDocument()
        })

        test('renders ProductView with showDeliveryOptions={false}', () => {
            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            const flag = screen.getByTestId('delivery-options-flag')
            expect(flag.textContent).toBe('false')
        })

        test('shows spinner when product is loading', () => {
            setupMocks({isFetching: true, product: null})

            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            // When product is null and isFetching, it shows a spinner instead of ProductView
            expect(screen.queryByTestId('product-view')).not.toBeInTheDocument()
        })
    })

    describe('Add to Cart button', () => {
        test('is enabled when variant is selected and orderable', () => {
            setupMocks({
                variant: {productId: 'variant-123', orderable: true},
                isOutOfStock: false,
                stockLevel: 10
            })

            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            const btn = screen.getByTestId('quick-view-add-to-cart-btn')
            expect(btn).not.toBeDisabled()
        })

        test('is disabled when no variant is selected (master product)', () => {
            setupMocks({variant: null})

            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            const btn = screen.getByTestId('quick-view-add-to-cart-btn')
            expect(btn).toBeDisabled()
        })

        test('is disabled when variant is out of stock', () => {
            setupMocks({
                variant: {productId: 'variant-oos', orderable: false},
                isOutOfStock: true
            })

            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            const btn = screen.getByTestId('quick-view-add-to-cart-btn')
            expect(btn).toBeDisabled()
        })

        test('is disabled while product is still fetching', () => {
            setupMocks({isFetching: true})

            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            const btn = screen.getByTestId('quick-view-add-to-cart-btn')
            expect(btn).toBeDisabled()
        })

        test('has non-empty text content (Add to Cart)', () => {
            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            const btn = screen.getByTestId('quick-view-add-to-cart-btn')
            expect(btn.textContent.trim()).not.toBe('')
            expect(btn.textContent).toContain('Add to Cart')
        })
    })

    describe('Add to Cart flow', () => {
        test('calls addItemToNewOrExistingBasket and opens AddToCartModal on success', async () => {
            mockAddItemToNewOrExistingBasket.mockResolvedValue({basketId: 'basket-1'})
            const onClose = jest.fn()

            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={onClose}
                />
            )

            const btn = screen.getByTestId('quick-view-add-to-cart-btn')

            await act(async () => {
                fireEvent.click(btn)
            })

            await waitFor(() => {
                expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledWith(
                    expect.arrayContaining([
                        expect.objectContaining({productId: 'variant-123', quantity: 1})
                    ])
                )
            })

            // The implementation passes {product, itemsAdded: [{product, variant, quantity}], selectedQuantity}
            expect(mockOnOpen).toHaveBeenCalledWith(
                expect.objectContaining({
                    product: expect.any(Object),
                    itemsAdded: expect.arrayContaining([
                        expect.objectContaining({
                            variant: expect.objectContaining({productId: 'variant-123'}),
                            quantity: 1
                        })
                    ]),
                    selectedQuantity: 1
                })
            )

            expect(onClose).toHaveBeenCalled()
        })

        test('does not close modal on add-to-cart failure', async () => {
            mockAddItemToNewOrExistingBasket.mockRejectedValue(new Error('Network error'))
            const onClose = jest.fn()

            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={onClose}
                />
            )

            const btn = screen.getByTestId('quick-view-add-to-cart-btn')

            await act(async () => {
                fireEvent.click(btn)
            })

            await waitFor(() => {
                expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalled()
            })

            expect(onClose).not.toHaveBeenCalled()
            expect(mockOnOpen).not.toHaveBeenCalled()
        })
    })

    describe('View Full Details link', () => {
        test('renders with non-empty text content', () => {
            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            const link = screen.getByTestId('quick-view-view-full-details-link')
            expect(link.textContent.trim()).not.toBe('')
            expect(link.textContent).toContain('View Full Details')
        })

        test('links to the product PDP URL', () => {
            const product = {
                ...mockProductSearchItem,
                id: 'prod-abc123'
            }
            setupMocks({
                product: {
                    ...product,
                    variationAttributes: mockProductSearchItem.variationAttributes || [],
                    inventory: {orderable: true}
                }
            })

            renderWithProviders(
                <QuickViewModal product={product} isOpen={true} onClose={jest.fn()} />
            )

            const link = screen.getByTestId('quick-view-view-full-details-link')
            expect(link).toHaveAttribute('href', expect.stringContaining('/product/'))
        })
    })

    describe('Inventory message', () => {
        test('displays inventory message when showInventoryMessage is true', () => {
            setupMocks({
                showInventoryMessage: true,
                inventoryMessage: 'Out of Stock'
            })

            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            expect(screen.getByTestId('inventory-message')).toBeInTheDocument()
            expect(screen.getByText('Out of Stock')).toBeInTheDocument()
        })

        test('does not display inventory message when showInventoryMessage is false', () => {
            setupMocks({showInventoryMessage: false})

            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            expect(screen.queryByTestId('inventory-message')).not.toBeInTheDocument()
        })
    })

    describe('Close button', () => {
        test('close button has required data-testid', () => {
            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            expect(screen.getByTestId('quick-view-modal-close-btn')).toBeInTheDocument()
        })
    })

    describe('Error boundary', () => {
        test('renders error fallback when ProductView throws', () => {
            // Make the ProductView mock throw during render
            mockShouldThrow.value = true

            // Suppress React error boundary console.error noise
            const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

            renderWithProviders(
                <QuickViewModal
                    product={mockProductSearchItem}
                    isOpen={true}
                    onClose={jest.fn()}
                />
            )

            expect(screen.getByTestId('quick-view-modal-error')).toBeInTheDocument()
            expect(screen.getByText('Unable to load product details.')).toBeInTheDocument()

            spy.mockRestore()
        })
    })
})
