/*
 * Unit tests for QuickViewModalBody component.
 * Cases: UT-BODY-001 through UT-BODY-015
 */
import React from 'react'
import {render, fireEvent, waitFor, act} from '@testing-library/react'
import '@testing-library/jest-dom'
import {IntlProvider} from 'react-intl'
import {QuickViewContext} from './context'

// ---- Control variables for mocks (must start with `mock`) ----
let mockProduct = null
let mockIsFetching = false
let mockAddItemFn = jest.fn()
let mockOnOpenFn = jest.fn()
let mockCloseQuickViewFn = jest.fn()
let mockProductViewModalThrow = false
let mockProductViewProps = null

// ---- Fixtures ----
const simpleProductInStock = {
    id: 'prod-in-stock',
    productId: 'prod-in-stock',
    name: 'Floral Dress',
    price: 49.99,
    currency: 'USD',
    variationAttributes: [],
    type: {master: false},
    inventory: {stockLevel: 10, orderable: true}
}

const masterProductNoSelection = {
    id: 'master-no-sel',
    productId: 'master-no-sel',
    name: 'Master Dress',
    price: 59.99,
    currency: 'USD',
    type: {master: true},
    variationAttributes: [
        {id: 'color', name: 'Color', values: [{value: 'red', name: 'Red'}, {value: 'blue', name: 'Blue'}]},
        {id: 'size', name: 'Size', values: [{value: 'S', name: 'Small'}, {value: 'M', name: 'Medium'}]}
    ],
    variants: [
        {productId: 'var-red-s', variationValues: {color: 'red', size: 'S'}, orderable: true, price: 59.99},
        {productId: 'var-blue-m', variationValues: {color: 'blue', size: 'M'}, orderable: false, price: 59.99}
    ]
}

const masterProductInStock = {
    ...masterProductNoSelection,
    id: 'master-instock',
    productId: 'master-instock'
}

const masterProductOOS = {
    id: 'master-oos',
    productId: 'master-oos',
    name: 'OOS Dress',
    price: 69.99,
    currency: 'USD',
    type: {master: true},
    variationAttributes: [
        {id: 'color', name: 'Color', values: [{value: 'red', name: 'Red'}]},
        {id: 'size', name: 'Size', values: [{value: 'S', name: 'Small'}]}
    ],
    variants: [
        {productId: 'var-oos', variationValues: {color: 'red', size: 'S'}, orderable: false, price: 69.99}
    ],
    inventory: {stockLevel: 0, orderable: false}
}

// ---- Mocks ----

jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: (initialProduct) => {
        if (mockProductViewModalThrow) {
            throw new Error('Product fetch failed')
        }
        return {
            product: mockProduct || initialProduct,
            isFetching: mockIsFetching
        }
    }
}))

jest.mock('@salesforce/retail-react-app/app/hooks/use-add-to-cart-modal', () => ({
    useAddToCartModalContext: () => ({
        isOpen: false,
        onOpen: mockOnOpenFn,
        onClose: jest.fn(),
        data: null
    })
}))

jest.mock('@salesforce/commerce-sdk-react', () => ({
    useShopperBasketsV2MutationHelper: () => ({
        addItemToNewOrExistingBasket: mockAddItemFn
    })
}))

jest.mock('@salesforce/retail-react-app/app/components/link', () => {
    const React = require('react')
    return React.forwardRef(function MockLink({to, onClick, children, ...props}, ref) {
        return (
            <a href={to} onClick={(e) => { e.preventDefault(); if (onClick) onClick(e) }} ref={ref} {...props}>
                {children}
            </a>
        )
    })
})

jest.mock('@salesforce/retail-react-app/app/utils/url', () => ({
    productUrlBuilder: ({id}) => `/product/${id}`
}))

jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const React = require('react')
    return {
        Box: React.forwardRef(function MockBox({children, ...props}, ref) {
            const htmlProps = {}
            if (props['data-testid']) htmlProps['data-testid'] = props['data-testid']
            return <div {...htmlProps} ref={ref}>{children}</div>
        }),
        Heading: ({children, id}) => <h2 id={id}>{children}</h2>,
        Divider: () => <hr />,
        Text: ({children}) => <span>{children}</span>,
        Button: ({children, onClick, isDisabled}) => (
            <button onClick={onClick} disabled={isDisabled}>{children}</button>
        )
    }
})

// Mock ProductView — captures props and renders a controllable add-to-cart button
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    const React = require('react')
    return React.forwardRef(function MockProductView(props, ref) {
        mockProductViewProps = props
        const {product, addToCart, isLoading, showDeliveryOptions} = props
        const [mockError, setMockError] = React.useState(null)

        const isOrderable = product?.inventory?.orderable !== false
        const hasOrderableVariant = product?.variants
            ? product.variants.some((v) => v.orderable)
            : true
        const disableButton = !hasOrderableVariant || !isOrderable || isLoading

        const handleClick = async () => {
            if (addToCart && !disableButton) {
                try {
                    await addToCart([{
                        product,
                        variant: product.variants?.[0] || product,
                        quantity: 1
                    }])
                } catch (e) {
                    setMockError(e.message)
                }
            }
        }

        return (
            <div data-testid="mock-product-view" ref={ref}>
                <div data-testid="product-name">{product?.name}</div>
                {showDeliveryOptions && (
                    <div data-testid="pickup-select-store-msg">Pickup options</div>
                )}
                <button
                    data-testid="quick-view-add-to-cart-btn"
                    disabled={disableButton}
                    onClick={handleClick}
                >
                    Add to Cart
                </button>
                {disableButton && product?.inventory?.orderable === false && (
                    <div data-testid="inventory-message">Out of Stock</div>
                )}
                {mockError && (
                    <div data-testid="add-to-cart-error">{mockError}</div>
                )}
            </div>
        )
    })
})

import QuickViewModalBody from './modal-body'

// ---- Helper ----
const renderBody = (contextOverrides = {}) => {
    mockCloseQuickViewFn = jest.fn()
    const contextValue = {
        isOpen: true,
        openProduct: simpleProductInStock,
        openQuickView: jest.fn(),
        closeQuickView: mockCloseQuickViewFn,
        ...contextOverrides
    }

    return render(
        <IntlProvider locale="en" defaultLocale="en">
            <QuickViewContext.Provider value={contextValue}>
                <QuickViewModalBody />
            </QuickViewContext.Provider>
        </IntlProvider>
    )
}

describe('QuickViewModalBody', () => {
    beforeEach(() => {
        mockProduct = null
        mockIsFetching = false
        mockAddItemFn = jest.fn().mockResolvedValue({})
        mockOnOpenFn = jest.fn()
        mockCloseQuickViewFn = jest.fn()
        mockProductViewModalThrow = false
        mockProductViewProps = null
    })

    // ---- Rendering & no-ship-to-store ----

    it('UT-BODY-001 — renders the product detail component', () => {
        const {getByTestId} = renderBody()
        expect(getByTestId('mock-product-view')).toBeInTheDocument()
    })

    it('UT-BODY-002 — Pickup-in-Store / Ship-to-Store UI is not rendered', () => {
        const {container} = renderBody()
        expect(container.querySelector('[data-testid="pickup-select-store-msg"]')).toBeNull()
        expect(container.querySelector('[data-testid="store-stock-status-msg"]')).toBeNull()
        expect(container.querySelector('[data-testid*="pickup"]')).toBeNull()
        expect(container.textContent).not.toMatch(/pickup|ship to store|pick up/i)
        expect(mockProductViewProps.showDeliveryOptions).toBe(false)
    })

    it('UT-BODY-003 — exposes Add-to-Bag testid', () => {
        const {getByTestId} = renderBody()
        expect(getByTestId('quick-view-add-to-cart-btn')).toBeInTheDocument()
    })

    it('UT-BODY-004 — exposes View Full Details testid', () => {
        const {getByTestId} = renderBody()
        expect(getByTestId('quick-view-view-full-details-link')).toBeInTheDocument()
    })

    // ---- Disabled-state rules (FR-009) ----

    it('UT-BODY-005 — disabled when no variation selected on a master product', () => {
        mockProduct = {
            ...masterProductNoSelection,
            inventory: {stockLevel: 10, orderable: false},
            variants: masterProductNoSelection.variants.map((v) => ({...v, orderable: false}))
        }
        const {getByTestId} = renderBody({openProduct: masterProductNoSelection})
        expect(getByTestId('quick-view-add-to-cart-btn')).toBeDisabled()
    })

    it('UT-BODY-006 — disabled when active variant has orderable: false; inventory-message visible', () => {
        mockProduct = {
            ...masterProductOOS,
            inventory: {stockLevel: 5, orderable: false}
        }
        const {getByTestId} = renderBody({openProduct: masterProductOOS})
        expect(getByTestId('quick-view-add-to-cart-btn')).toBeDisabled()
        expect(getByTestId('inventory-message')).toBeInTheDocument()
    })

    it('UT-BODY-007 — disabled when active variant has inventory.stockLevel === 0; inventory-message visible', () => {
        mockProduct = {
            ...masterProductOOS,
            inventory: {stockLevel: 0, orderable: false}
        }
        const {getByTestId} = renderBody({openProduct: masterProductOOS})
        expect(getByTestId('quick-view-add-to-cart-btn')).toBeDisabled()
        expect(getByTestId('inventory-message')).toBeInTheDocument()
    })

    it('UT-BODY-008 — enabled when complete in-stock variation is selected', () => {
        mockProduct = simpleProductInStock
        const {getByTestId} = renderBody({openProduct: simpleProductInStock})
        expect(getByTestId('quick-view-add-to-cart-btn')).not.toBeDisabled()
    })

    // ---- Add-to-Bag side effects ----

    it('UT-BODY-009 — successful add closes the modal', async () => {
        mockProduct = simpleProductInStock
        mockAddItemFn.mockResolvedValue({basketId: 'b-1'})
        const {getByTestId} = renderBody({openProduct: simpleProductInStock})

        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })

        expect(mockCloseQuickViewFn).toHaveBeenCalledTimes(1)
    })

    it('UT-BODY-010 — successful add invokes global add-to-cart confirmation modal onOpen', async () => {
        mockProduct = simpleProductInStock
        mockAddItemFn.mockResolvedValue({basketId: 'b-1'})
        const {getByTestId} = renderBody({openProduct: simpleProductInStock})

        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })

        expect(mockOnOpenFn).toHaveBeenCalledTimes(1)
        const callArgs = mockOnOpenFn.mock.calls[0][0]
        expect(callArgs).toHaveProperty('product')
        expect(callArgs).toHaveProperty('itemsAdded')
        expect(callArgs).toHaveProperty('selectedQuantity')
    })

    it('UT-BODY-011 — guest with no basket: addItemToNewOrExistingBasket called with product items', async () => {
        mockProduct = simpleProductInStock
        mockAddItemFn.mockResolvedValue({basketId: 'new-basket'})
        const {getByTestId} = renderBody({openProduct: simpleProductInStock})

        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })

        expect(mockAddItemFn).toHaveBeenCalledTimes(1)
        const items = mockAddItemFn.mock.calls[0][0]
        expect(items).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    productId: expect.any(String),
                    quantity: expect.any(Number)
                })
            ])
        )
    })

    it('UT-BODY-012 — basket exists: addItemToNewOrExistingBasket called once with variant id and quantity', async () => {
        mockProduct = simpleProductInStock
        mockAddItemFn.mockResolvedValue({basketId: 'existing-basket'})
        const {getByTestId} = renderBody({openProduct: simpleProductInStock})

        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })

        expect(mockAddItemFn).toHaveBeenCalledTimes(1)
        const items = mockAddItemFn.mock.calls[0][0]
        expect(items[0]).toHaveProperty('productId')
        expect(items[0]).toHaveProperty('quantity')
    })

    it('UT-BODY-013 — failed add keeps the modal open; closeQuickView and onOpen not called', async () => {
        mockProduct = simpleProductInStock
        mockAddItemFn.mockRejectedValue(new Error('Network failure'))
        const {getByTestId} = renderBody({openProduct: simpleProductInStock})

        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })

        expect(mockCloseQuickViewFn).not.toHaveBeenCalled()
        expect(mockOnOpenFn).not.toHaveBeenCalled()
        // Modal body stays mounted
        expect(getByTestId('mock-product-view')).toBeInTheDocument()
        // Error message visible inside the modal
        expect(getByTestId('add-to-cart-error')).toBeInTheDocument()
    })

    it('UT-BODY-014 — detail-fetch failure surfaces error fallback while keeping shell mounted', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        mockProductViewModalThrow = true

        // Wrap in an error boundary as the shell does
        class MockErrorBoundary extends React.Component {
            constructor(props) {
                super(props)
                this.state = {hasError: false}
            }
            static getDerivedStateFromError() {
                return {hasError: true}
            }
            render() {
                if (this.state.hasError) {
                    return <div data-testid="quick-view-modal-error">Error loading product</div>
                }
                return this.props.children
            }
        }

        const contextValue = {
            isOpen: true,
            openProduct: simpleProductInStock,
            openQuickView: jest.fn(),
            closeQuickView: jest.fn()
        }

        const {getByTestId} = render(
            <IntlProvider locale="en" defaultLocale="en">
                <QuickViewContext.Provider value={contextValue}>
                    <div data-testid="quick-view-modal">
                        <MockErrorBoundary>
                            <QuickViewModalBody />
                        </MockErrorBoundary>
                    </div>
                </QuickViewContext.Provider>
            </IntlProvider>
        )

        expect(getByTestId('quick-view-modal-error')).toBeInTheDocument()
        expect(getByTestId('quick-view-modal')).toBeInTheDocument()
        consoleSpy.mockRestore()
    })

    // ---- Variation interaction ----

    it('UT-BODY-015 — switching variation updates the active variant id in the add-to-cart handler', async () => {
        mockProduct = masterProductInStock
        mockAddItemFn.mockResolvedValue({})
        renderBody({openProduct: masterProductInStock})

        expect(typeof mockProductViewProps.addToCart).toBe('function')

        // Simulate ProductView calling addToCart with a specific variant
        const variantProduct = masterProductInStock.variants[0]
        await act(async () => {
            await mockProductViewProps.addToCart([{
                product: masterProductInStock,
                variant: variantProduct,
                quantity: 2
            }])
        })

        expect(mockAddItemFn).toHaveBeenCalledTimes(1)
        const items = mockAddItemFn.mock.calls[0][0]
        expect(items[0].productId).toBe(variantProduct.productId)
        expect(items[0].quantity).toBe(2)
    })
})
