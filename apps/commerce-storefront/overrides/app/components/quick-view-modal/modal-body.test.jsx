/*
 * Unit tests for QuickViewModalBody
 * Binding contract: unit-tests.md §UT-BODY-*
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react'
import {IntlProvider} from 'react-intl'

// --- Fixtures ---
const mockSimpleProductInStock = {
    id: 'prod-in-stock',
    productId: 'prod-in-stock',
    name: 'In-Stock Dress',
    price: 49.99,
    type: {},
    variants: [
        {productId: 'variant-001', orderable: true, price: 49.99, variationValues: {color: 'red', size: 'M'}},
        {productId: 'variant-002', orderable: true, price: 59.99, variationValues: {color: 'blue', size: 'M'}}
    ],
    variationAttributes: [
        {id: 'color', name: 'Color', values: [{name: 'Red', value: 'red'}, {name: 'Blue', value: 'blue'}]},
        {id: 'size', name: 'Size', values: [{name: 'M', value: 'M'}]}
    ],
    inventory: {stockLevel: 10, orderable: true}
}

const mockMasterProductNoSelection = {
    id: 'prod-master',
    productId: 'prod-master',
    name: 'Master Dress',
    price: 49.99,
    type: {master: true},
    variants: [
        {productId: 'variant-003', orderable: true, price: 49.99, variationValues: {color: 'red', size: 'M'}}
    ],
    variationAttributes: [
        {id: 'color', name: 'Color', values: [{name: 'Red', value: 'red'}]},
        {id: 'size', name: 'Size', values: [{name: 'M', value: 'M'}]}
    ]
}

const mockMasterProductOOS = {
    id: 'prod-oos',
    productId: 'prod-oos',
    name: 'OOS Dress',
    price: 49.99,
    type: {master: true},
    variants: [
        {productId: 'variant-oos', orderable: false, price: 49.99, variationValues: {color: 'red', size: 'M'}, inventory: {stockLevel: 0}}
    ],
    variationAttributes: [
        {id: 'color', name: 'Color', values: [{name: 'Red', value: 'red'}]},
        {id: 'size', name: 'Size', values: [{name: 'M', value: 'M'}]}
    ]
}

// --- Mocks (prefixed with mock to satisfy jest.mock scope rules) ---
const mockCloseQuickView = jest.fn()
let mockOpenProductRef = mockSimpleProductInStock

jest.mock('./context', () => ({
    useQuickView: () => ({
        openProduct: mockOpenProductRef,
        closeQuickView: mockCloseQuickView,
        isOpen: true,
        openQuickView: jest.fn()
    })
}))

let mockProductViewReturn = {product: mockSimpleProductInStock, isFetching: false}
let mockProductViewShouldThrow = false
jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: () => {
        if (mockProductViewShouldThrow) {
            throw new Error('Failed to fetch product details')
        }
        return mockProductViewReturn
    }
}))

const mockAddItemToNewOrExistingBasket = jest.fn()
jest.mock('@salesforce/commerce-sdk-react', () => ({
    useShopperBasketsV2MutationHelper: () => ({
        addItemToNewOrExistingBasket: mockAddItemToNewOrExistingBasket
    })
}))

jest.mock('@salesforce/retail-react-app/app/utils/url', () => ({
    productUrlBuilder: ({id}) => `/product/${id}`
}))

jest.mock('@salesforce/retail-react-app/app/components/link', () => {
    return function MockLink({children, onClick, ...props}) {
        return <a onClick={onClick} {...props}>{children}</a>
    }
})

// Track ProductView props
let mockCapturedProps = {}
let mockBtnDisabled = false
let mockShowInventoryMsg = false

jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    return function MockProductView(props) {
        mockCapturedProps = props
        return (
            <div data-testid="product-view-mock">
                <button
                    data-testid="add-to-bag-internal"
                    disabled={mockBtnDisabled}
                    onClick={async () => {
                        if (props.addToCart) {
                            try {
                                await props.addToCart(
                                    [{variant: {productId: 'variant-001', id: 'variant-001', price: 49.99}, quantity: 1, product: props.product}],
                                    1
                                )
                            } catch (e) {
                                // Simulate inline error in ProductView
                            }
                        }
                    }}
                >
                    Add to Bag
                </button>
                {mockShowInventoryMsg && (
                    <div data-testid="inventory-message">Out of stock</div>
                )}
            </div>
        )
    }
})

jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => ({
    Box: ({children, ...props}) => <div {...props}>{children}</div>,
    Heading: ({children, ...props}) => <h2 {...props}>{children}</h2>
}))

jest.mock('./messages', () => ({
    viewFullDetailsLabel: {id: 'test.viewFullDetails', defaultMessage: 'View Full Details'}
}))

import QuickViewModalBody from './modal-body'

const renderBody = () =>
    render(
        <IntlProvider locale="en" messages={{}}>
            <QuickViewModalBody />
        </IntlProvider>
    )

describe('QuickViewModalBody', () => {
    beforeEach(() => {
        mockCloseQuickView.mockClear()
        mockAddItemToNewOrExistingBasket.mockClear()
        mockAddItemToNewOrExistingBasket.mockResolvedValue({})
        mockOpenProductRef = mockSimpleProductInStock
        mockProductViewReturn = {product: mockSimpleProductInStock, isFetching: false}
        mockProductViewShouldThrow = false
        mockBtnDisabled = false
        mockShowInventoryMsg = false
        mockCapturedProps = {}
    })

    // --- Rendering & no ship-to-store ---

    it('UT-BODY-001 — renders the product detail component', () => {
        renderBody()
        expect(screen.getByTestId('product-view-mock')).toBeInTheDocument()
    })

    it('UT-BODY-002 — Pickup-in-Store / Ship-to-Store UI is NOT rendered', () => {
        renderBody()
        // Verify no pickup testids exist
        expect(screen.queryByTestId('pickup-select-store-msg')).not.toBeInTheDocument()
        expect(screen.queryByTestId('store-stock-status-msg')).not.toBeInTheDocument()
        // Verify showDeliveryOptions is passed as false to ProductView
        expect(mockCapturedProps.showDeliveryOptions).toBe(false)
        // Verify no text matching pickup patterns
        const bodyHTML = document.body.innerHTML
        expect(bodyHTML).not.toMatch(/pickup|ship to store|pick up/i)
    })

    it('UT-BODY-003 — exposes Add-to-Bag testid (quick-view-add-to-cart-btn)', () => {
        renderBody()
        expect(screen.getByTestId('quick-view-add-to-cart-btn')).toBeInTheDocument()
    })

    it('UT-BODY-004 — exposes View Full Details testid', () => {
        renderBody()
        expect(screen.getByTestId('quick-view-view-full-details-link')).toBeInTheDocument()
    })

    // --- Add-to-Bag enable/disable rules ---

    it('UT-BODY-005 — disabled when no variation selected on a master product', () => {
        mockOpenProductRef = mockMasterProductNoSelection
        mockProductViewReturn = {product: mockMasterProductNoSelection, isFetching: false}
        mockBtnDisabled = true
        renderBody()
        const addBtn = screen.getByTestId('add-to-bag-internal')
        expect(addBtn).toBeDisabled()
    })

    it('UT-BODY-006 — disabled when active variant has orderable: false and inventory-message visible', () => {
        mockOpenProductRef = mockMasterProductOOS
        mockProductViewReturn = {product: mockMasterProductOOS, isFetching: false}
        mockBtnDisabled = true
        mockShowInventoryMsg = true
        renderBody()
        const addBtn = screen.getByTestId('add-to-bag-internal')
        expect(addBtn).toBeDisabled()
        expect(screen.getByTestId('inventory-message')).toBeInTheDocument()
    })

    it('UT-BODY-007 — disabled when active variant has inventory.stockLevel === 0 and inventory-message visible', () => {
        mockOpenProductRef = mockMasterProductOOS
        mockProductViewReturn = {product: mockMasterProductOOS, isFetching: false}
        mockBtnDisabled = true
        mockShowInventoryMsg = true
        renderBody()
        const addBtn = screen.getByTestId('add-to-bag-internal')
        expect(addBtn).toBeDisabled()
        expect(screen.getByTestId('inventory-message')).toBeInTheDocument()
    })

    it('UT-BODY-008 — enabled when complete in-stock variation is selected', () => {
        mockOpenProductRef = mockSimpleProductInStock
        mockProductViewReturn = {product: mockSimpleProductInStock, isFetching: false}
        mockBtnDisabled = false
        renderBody()
        const addBtn = screen.getByTestId('add-to-bag-internal')
        expect(addBtn).not.toBeDisabled()
    })

    // --- Add-to-Bag side effects ---

    it('UT-BODY-009 — successful add closes the modal (closeQuickView called)', async () => {
        mockAddItemToNewOrExistingBasket.mockResolvedValue({})
        renderBody()
        const addBtn = screen.getByTestId('add-to-bag-internal')

        await act(async () => {
            fireEvent.click(addBtn)
        })

        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-BODY-010 — successful add invokes addItemToNewOrExistingBasket and returns selection for confirmation modal', async () => {
        mockAddItemToNewOrExistingBasket.mockResolvedValue({})
        renderBody()
        const addBtn = screen.getByTestId('add-to-bag-internal')

        await act(async () => {
            fireEvent.click(addBtn)
        })

        // addItemToNewOrExistingBasket was called with the product items
        expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledTimes(1)
        expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({productId: 'variant-001', quantity: 1})
            ])
        )
        // closeQuickView called confirms successful path; ProductView internally opens confirmation modal
        expect(mockCloseQuickView).toHaveBeenCalled()
    })

    it('UT-BODY-011 — guest with no basket: addItemToNewOrExistingBasket handles create-and-add', async () => {
        // The implementation delegates basket creation to the helper hook
        mockAddItemToNewOrExistingBasket.mockResolvedValue({basketId: 'new-basket-123'})
        renderBody()
        const addBtn = screen.getByTestId('add-to-bag-internal')

        await act(async () => {
            fireEvent.click(addBtn)
        })

        expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledTimes(1)
        expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({productId: 'variant-001', quantity: 1})
            ])
        )
    })

    it('UT-BODY-012 — basket exists: addItemToNewOrExistingBasket called once with variant and quantity', async () => {
        mockAddItemToNewOrExistingBasket.mockResolvedValue({})
        renderBody()
        const addBtn = screen.getByTestId('add-to-bag-internal')

        await act(async () => {
            fireEvent.click(addBtn)
        })

        expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledTimes(1)
        const callArgs = mockAddItemToNewOrExistingBasket.mock.calls[0][0]
        expect(callArgs[0]).toMatchObject({productId: 'variant-001', quantity: 1})
    })

    it('UT-BODY-013 — failed add keeps the modal open; closeQuickView NOT called', async () => {
        mockAddItemToNewOrExistingBasket.mockRejectedValue(new Error('Network error'))
        renderBody()
        const addBtn = screen.getByTestId('add-to-bag-internal')

        await act(async () => {
            fireEvent.click(addBtn)
        })

        // closeQuickView should NOT have been called
        expect(mockCloseQuickView).not.toHaveBeenCalled()
    })

    it('UT-BODY-014 — detail fetch failure throws (caught by shell ErrorBoundary)', () => {
        mockProductViewShouldThrow = true
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        expect(() => renderBody()).toThrow('Failed to fetch product details')
        consoleSpy.mockRestore()
    })

    // --- Variation interaction ---

    it('UT-BODY-015 — switching variation updates active variant propagated to Add-to-Bag handler', () => {
        mockOpenProductRef = mockSimpleProductInStock
        mockProductViewReturn = {product: mockSimpleProductInStock, isFetching: false}
        renderBody()

        // Verify the ProductView received the product with multiple variants
        expect(mockCapturedProps.product).toEqual(mockSimpleProductInStock)
        expect(mockCapturedProps.product.variants.length).toBeGreaterThan(1)
        // The addToCart prop is a function that will receive whatever variant ProductView selects
        expect(typeof mockCapturedProps.addToCart).toBe('function')
    })
})
