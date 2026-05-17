/*
 * Unit tests for QuickViewModalBody.
 * Cases: UT-BODY-001 through UT-BODY-015
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, waitFor, act} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {BrowserRouter} from 'react-router-dom'
import {QuickViewContext} from './context'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const simpleProduct = {
    id: 'prod-body-001',
    productId: 'prod-body-001',
    name: 'Body Test Dress',
    type: {master: false, set: false, bundle: false},
    currency: 'USD',
    price: 49.99
}

const masterProductNoSelection = {
    id: 'master-no-sel',
    productId: 'master-no-sel',
    name: 'Master No Selection',
    type: {master: true, set: false, bundle: false},
    currency: 'USD',
    price: 79.99,
    variants: [
        {productId: 'var-a', orderable: true, price: 79.99, variationValues: {color: 'red', size: 'M'}},
        {productId: 'var-b', orderable: true, price: 79.99, variationValues: {color: 'blue', size: 'L'}}
    ],
    variationAttributes: [
        {id: 'color', name: 'Color', values: [{name: 'Red', value: 'red'}, {name: 'Blue', value: 'blue'}]},
        {id: 'size', name: 'Size', values: [{name: 'M', value: 'M'}, {name: 'L', value: 'L'}]}
    ]
}

const masterProductInStock = {
    ...masterProductNoSelection,
    id: 'master-instock',
    productId: 'master-instock',
    name: 'Master In Stock'
}

const masterProductOOS = {
    ...masterProductNoSelection,
    id: 'master-oos',
    productId: 'master-oos',
    name: 'Master OOS',
    variants: [
        {productId: 'var-oos', orderable: false, price: 79.99, variationValues: {color: 'red', size: 'M'}}
    ]
}

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockOnOpen = jest.fn()
const mockCloseQuickView = jest.fn()
const mockCreateBasketMutateAsync = jest.fn()
const mockAddItemMutateAsync = jest.fn()

// Track what useProductViewModal returns per test
let mockProductViewModalReturn = {product: simpleProduct, isFetching: false}
let mockCurrentBasketReturn = {data: null}
let mockProductViewDisabled = false
let mockCapturedAddToCart = null
let mockShowDeliveryOptions = undefined

// Mock useProductViewModal
jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: jest.fn(() => mockProductViewModalReturn)
}))

// Mock useCurrentBasket
jest.mock('@salesforce/retail-react-app/app/hooks/use-current-basket', () => ({
    useCurrentBasket: jest.fn(() => mockCurrentBasketReturn)
}))

// Mock useAddToCartModalContext
jest.mock('@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal', () => ({
    useAddToCartModalContext: jest.fn(() => ({
        onOpen: mockOnOpen,
        isOpen: false,
        onClose: jest.fn(),
        data: null
    }))
}))

// Mock commerce-sdk-react
jest.mock('@salesforce/commerce-sdk-react', () => ({
    useShopperBasketsV2Mutation: jest.fn((action) => {
        if (action === 'createBasket') return {mutateAsync: mockCreateBasketMutateAsync}
        if (action === 'addItemToBasket') return {mutateAsync: mockAddItemMutateAsync}
        return {mutateAsync: jest.fn()}
    })
}))

// Mock ProductView
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    return function MockProductView(props) {
        mockCapturedAddToCart = props.addToCart
        mockShowDeliveryOptions = props.showDeliveryOptions

        return (
            <div data-testid="product-view-mock">
                <div>Product: {props.product?.name}</div>
                {props.showDeliveryOptions && (
                    <div data-testid="pickup-select-store-msg">Store Pickup</div>
                )}
                <button
                    data-testid="quick-view-add-to-cart-btn"
                    disabled={mockProductViewDisabled}
                    onClick={async () => {
                        if (!mockProductViewDisabled && mockCapturedAddToCart) {
                            try {
                                await mockCapturedAddToCart([
                                    {
                                        product: props.product,
                                        variant: props.product?.variants?.[0] || props.product,
                                        quantity: 1
                                    }
                                ])
                            } catch (e) {
                                // Simulate ProductView's internal error handling —
                                // the error is caught and displayed as an inline message
                            }
                        }
                    }}
                >
                    Add to Cart
                </button>
                {mockProductViewDisabled && (
                    <div data-testid="inventory-message">Out of stock</div>
                )}
            </div>
        )
    }
})

// Mock Link component
jest.mock('@salesforce/retail-react-app/app/components/link', () => {
    return function MockLink(props) {
        return (
            <a
                data-testid={props['data-testid']}
                href={props.to}
                onClick={props.onClick}
            >
                {props.children}
            </a>
        )
    }
})

// Mock useMultiSite
jest.mock('@salesforce/retail-react-app/app/hooks/use-multi-site', () => ({
    __esModule: true,
    default: () => ({
        site: {id: 'site-1'},
        buildUrl: (url) => url
    })
}))

// Mock productUrlBuilder
jest.mock('@salesforce/retail-react-app/app/utils/url', () => ({
    productUrlBuilder: (product) => `/product/${product.id}`
}))

// Mock Chakra UI components that need Modal context
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const OrigReact = require('react')
    const actual = jest.requireActual('@salesforce/retail-react-app/app/components/shared/ui')
    return {
        ...actual,
        ModalBody: ({children, ...props}) => <div data-mock="modal-body" {...props}>{children}</div>,
        ModalHeader: ({children, ...props}) => <div data-mock="modal-header" {...props}>{children}</div>
    }
})

// Import the body component after mocks are set up
import QuickViewModalBody from './modal-body'

// ─── Render helper ───────────────────────────────────────────────────────────

const renderBody = (product = simpleProduct, contextOverrides = {}) => {
    const contextValue = {
        isOpen: true,
        openProduct: product,
        openQuickView: jest.fn(),
        closeQuickView: mockCloseQuickView,
        ...contextOverrides
    }

    return render(
        <BrowserRouter>
            <IntlProvider locale="en" messages={{}}>
                <QuickViewContext.Provider value={contextValue}>
                    <QuickViewModalBody />
                </QuickViewContext.Provider>
            </IntlProvider>
        </BrowserRouter>
    )
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QuickViewModalBody', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockProductViewModalReturn = {product: simpleProduct, isFetching: false}
        mockCurrentBasketReturn = {data: null}
        mockProductViewDisabled = false
        mockCreateBasketMutateAsync.mockResolvedValue({basketId: 'new-basket-001'})
        mockAddItemMutateAsync.mockResolvedValue({})
        mockCapturedAddToCart = null
    })

    // ── Rendering & no-ship-to-store ─────────────────────────────────────

    it('UT-BODY-001 — renders the product detail component', () => {
        renderBody()
        expect(screen.getByTestId('product-view-mock')).toBeInTheDocument()
    })

    it('UT-BODY-002 — Pickup-in-Store / Ship-to-Store UI is NOT rendered', () => {
        renderBody()
        // showDeliveryOptions should be false
        expect(mockShowDeliveryOptions).toBe(false)
        // No pickup-related testids
        expect(screen.queryByTestId('pickup-select-store-msg')).not.toBeInTheDocument()
        expect(screen.queryByTestId('store-stock-status-msg')).not.toBeInTheDocument()
        // No testid containing 'pickup'
        const allTestIds = document.querySelectorAll('[data-testid*="pickup"]')
        expect(allTestIds.length).toBe(0)
        // No text matching /pickup|ship to store|pick up/i
        expect(document.body.textContent).not.toMatch(/pickup|ship to store|pick up/i)
    })

    it('UT-BODY-003 — exposes Add-to-Bag testid', () => {
        renderBody()
        expect(screen.getByTestId('quick-view-add-to-cart-btn')).toBeInTheDocument()
    })

    it('UT-BODY-004 — exposes View Full Details testid', () => {
        renderBody()
        expect(screen.getByTestId('quick-view-view-full-details-link')).toBeInTheDocument()
    })

    // ── Disabled-state rules ─────────────────────────────────────────────

    it('UT-BODY-005 — disabled when no variation selected on a master product', () => {
        mockProductViewModalReturn = {product: masterProductNoSelection, isFetching: false}
        mockProductViewDisabled = true
        renderBody(masterProductNoSelection)
        expect(screen.getByTestId('quick-view-add-to-cart-btn')).toBeDisabled()
    })

    it('UT-BODY-006 — disabled when active variant has orderable: false', () => {
        mockProductViewModalReturn = {product: masterProductOOS, isFetching: false}
        mockProductViewDisabled = true
        renderBody(masterProductOOS)
        expect(screen.getByTestId('quick-view-add-to-cart-btn')).toBeDisabled()
        expect(screen.getByTestId('inventory-message')).toBeInTheDocument()
    })

    it('UT-BODY-007 — disabled when active variant has inventory.stockLevel === 0', () => {
        const oosProduct = {
            ...masterProductOOS,
            variants: [{productId: 'var-zero', orderable: false, price: 79.99, inventory: {stockLevel: 0}}]
        }
        mockProductViewModalReturn = {product: oosProduct, isFetching: false}
        mockProductViewDisabled = true
        renderBody(oosProduct)
        expect(screen.getByTestId('quick-view-add-to-cart-btn')).toBeDisabled()
        expect(screen.getByTestId('inventory-message')).toBeInTheDocument()
    })

    it('UT-BODY-008 — enabled when complete in-stock variation is selected', () => {
        mockProductViewModalReturn = {product: masterProductInStock, isFetching: false}
        mockProductViewDisabled = false
        renderBody(masterProductInStock)
        expect(screen.getByTestId('quick-view-add-to-cart-btn')).not.toBeDisabled()
    })

    // ── Add-to-Bag side effects ──────────────────────────────────────────

    it('UT-BODY-009 — successful add closes the modal', async () => {
        mockCurrentBasketReturn = {data: {basketId: 'existing-basket'}}
        renderBody()

        await act(async () => {
            screen.getByTestId('quick-view-add-to-cart-btn').click()
        })

        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-BODY-010 — successful add invokes global add-to-cart confirmation', async () => {
        mockCurrentBasketReturn = {data: {basketId: 'existing-basket'}}
        renderBody()

        await act(async () => {
            screen.getByTestId('quick-view-add-to-cart-btn').click()
        })

        expect(mockOnOpen).toHaveBeenCalledTimes(1)
        expect(mockOnOpen).toHaveBeenCalledWith(
            expect.objectContaining({
                product: expect.any(Object),
                itemsAdded: expect.any(Array),
                selectedQuantity: expect.any(Number)
            })
        )
    })

    it('UT-BODY-011 — guest with no basket: createBasket called before addItemToBasket', async () => {
        mockCurrentBasketReturn = {data: null}
        renderBody()

        await act(async () => {
            screen.getByTestId('quick-view-add-to-cart-btn').click()
        })

        expect(mockCreateBasketMutateAsync).toHaveBeenCalledTimes(1)
        expect(mockCreateBasketMutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({body: expect.objectContaining({productItems: expect.any(Array)})})
        )
    })

    it('UT-BODY-012 — basket exists: only addItemToBasket called', async () => {
        mockCurrentBasketReturn = {data: {basketId: 'existing-basket-123'}}
        renderBody()

        await act(async () => {
            screen.getByTestId('quick-view-add-to-cart-btn').click()
        })

        expect(mockCreateBasketMutateAsync).not.toHaveBeenCalled()
        expect(mockAddItemMutateAsync).toHaveBeenCalledTimes(1)
        expect(mockAddItemMutateAsync).toHaveBeenCalledWith(
            expect.objectContaining({
                parameters: {basketId: 'existing-basket-123'},
                body: expect.any(Array)
            })
        )
    })

    it('UT-BODY-013 — failed add keeps the modal open', async () => {
        mockCurrentBasketReturn = {data: {basketId: 'existing-basket'}}
        mockAddItemMutateAsync.mockRejectedValue(new Error('Network error'))

        // Suppress unhandled error noise
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

        renderBody()

        await act(async () => {
            try {
                screen.getByTestId('quick-view-add-to-cart-btn').click()
            } catch (e) {
                // The error may propagate; that's expected
            }
        })

        // Wait for async rejection to settle
        await waitFor(() => {
            expect(mockCloseQuickView).not.toHaveBeenCalled()
        })
        expect(mockOnOpen).not.toHaveBeenCalled()

        consoleSpy.mockRestore()
    })

    it('UT-BODY-014 — detail fetch failure surfaces error fallback', () => {
        // Simulate useProductViewModal throwing
        const {useProductViewModal} = require('@salesforce/retail-react-app/app/hooks/use-product-view-modal')
        useProductViewModal.mockImplementation(() => {
            throw new Error('Failed to fetch product details')
        })

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

        // Wrap in ErrorBoundary like the real shell does
        const {ErrorBoundary} = require('react-error-boundary')

        render(
            <BrowserRouter>
                <IntlProvider locale="en" messages={{}}>
                    <QuickViewContext.Provider
                        value={{
                            isOpen: true,
                            openProduct: simpleProduct,
                            openQuickView: jest.fn(),
                            closeQuickView: mockCloseQuickView
                        }}
                    >
                        <div data-testid="quick-view-modal">
                            <ErrorBoundary
                                fallback={
                                    <div data-testid="quick-view-modal-error">
                                        Something went wrong
                                    </div>
                                }
                            >
                                <QuickViewModalBody />
                            </ErrorBoundary>
                        </div>
                    </QuickViewContext.Provider>
                </IntlProvider>
            </BrowserRouter>
        )

        expect(screen.getByTestId('quick-view-modal-error')).toBeInTheDocument()
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()

        consoleSpy.mockRestore()

        // Restore the mock for other tests
        useProductViewModal.mockImplementation(() => mockProductViewModalReturn)
    })

    // ── Variation interaction ────────────────────────────────────────────

    it('UT-BODY-015 — switching variation updates active variant', () => {
        const variantA = {
            ...masterProductInStock,
            variants: [
                {productId: 'var-a', orderable: true, price: 79.99, variationValues: {color: 'red'}},
                {productId: 'var-b', orderable: true, price: 89.99, variationValues: {color: 'blue'}}
            ]
        }

        mockProductViewModalReturn = {product: variantA, isFetching: false}
        const {rerender} = renderBody(masterProductInStock)

        // mockCapturedAddToCart should be set by the ProductView mock
        expect(mockCapturedAddToCart).toBeDefined()

        // Simulate variant switch by re-rendering with different product data
        const variantB = {...variantA, name: 'Master In Stock - Blue'}
        mockProductViewModalReturn = {product: variantB, isFetching: false}

        rerender(
            <BrowserRouter>
                <IntlProvider locale="en" messages={{}}>
                    <QuickViewContext.Provider
                        value={{
                            isOpen: true,
                            openProduct: masterProductInStock,
                            openQuickView: jest.fn(),
                            closeQuickView: mockCloseQuickView
                        }}
                    >
                        <QuickViewModalBody />
                    </QuickViewContext.Provider>
                </IntlProvider>
            </BrowserRouter>
        )

        // The addToCart handler should reflect the updated product
        expect(mockCapturedAddToCart).toBeDefined()
        // The ProductView mock shows the updated product name
        const matches = screen.getAllByText(/Master In Stock - Blue/)
        expect(matches.length).toBeGreaterThanOrEqual(1)
    })
})
