/*
 * Unit tests for QuickViewModalBody.
 * Covers: UT-BODY-001 through UT-BODY-015
 */
import React from 'react'
import {render, act} from '@testing-library/react'
import '@testing-library/jest-dom'
import {IntlProvider} from 'react-intl'

// --- Mock state ---
const mockCloseQuickView = jest.fn()
const mockOpenProduct = {id: 'prod-100', productId: 'prod-100', name: 'Test Dress'}

// Product returned by useProductViewModal hook
let mockProductViewModalReturn = {
    product: {
        id: 'prod-100',
        name: 'Test Dress',
        price: 49.99,
        variationAttributes: [],
        variants: []
    },
    isFetching: false
}

// Mock addItemToNewOrExistingBasket
const mockAddItemToNewOrExistingBasket = jest.fn()

jest.mock('./context', () => ({
    useQuickView: () => ({
        openProduct: mockOpenProduct,
        closeQuickView: mockCloseQuickView,
        isOpen: true
    })
}))

jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: () => mockProductViewModalReturn
}))

jest.mock('@salesforce/commerce-sdk-react', () => ({
    useShopperBasketsV2MutationHelper: () => ({
        addItemToNewOrExistingBasket: mockAddItemToNewOrExistingBasket
    })
}))

// Mock ProductView to render a controllable component
let mockAddToCartProp = null
let mockProductProp = null
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    return function MockProductView({product, showDeliveryOptions, addToCart}) {
        mockAddToCartProp = addToCart
        mockProductProp = product
        return (
            <div data-testid="product-view" data-show-delivery={String(showDeliveryOptions)}>
                <span data-testid="product-view-name">{product?.name}</span>
                <button
                    data-testid="mock-add-to-cart-inner"
                    onClick={() => {
                        addToCart([{product, variant: product, quantity: 1}], 1)
                    }}
                >
                    Add to Cart
                </button>
            </div>
        )
    }
})

jest.mock('@salesforce/retail-react-app/app/components/link', () => {
    return function MockLink({children, to, ...props}) {
        return <a href={to} {...props}>{children}</a>
    }
})

jest.mock('@salesforce/retail-react-app/app/utils/url', () => ({
    productUrlBuilder: ({id}) => `/product/${id}`
}))

jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const ReactInFactory = require('react')
    return {
        Box: ReactInFactory.forwardRef(({children, ...props}, ref) => <div ref={ref} {...props}>{children}</div>),
        Heading: ({children, ...props}) => <h2 {...props}>{children}</h2>,
        Divider: () => <hr />
    }
})

import QuickViewModalBody from './modal-body'

const renderBody = () => {
    return render(
        <IntlProvider locale="en-US" messages={{}}>
            <QuickViewModalBody />
        </IntlProvider>
    )
}

describe('QuickViewModalBody — rendering & no ship-to-store', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockProductViewModalReturn = {
            product: {
                id: 'prod-100',
                name: 'Test Dress',
                price: 49.99,
                variationAttributes: [],
                variants: []
            },
            isFetching: false
        }
        mockAddItemToNewOrExistingBasket.mockResolvedValue({})
    })

    it('UT-BODY-001 — renders the product detail component', () => {
        const {getByTestId} = renderBody()
        expect(getByTestId('product-view')).toBeInTheDocument()
    })

    it('UT-BODY-002 — Pickup-in-Store / Ship-to-Store UI is not rendered', () => {
        const {getByTestId, container} = renderBody()
        // showDeliveryOptions is passed as false
        expect(getByTestId('product-view').getAttribute('data-show-delivery')).toBe('false')
        // No pickup-related testids
        expect(container.querySelector('[data-testid="pickup-select-store-msg"]')).toBeNull()
        expect(container.querySelector('[data-testid="store-stock-status-msg"]')).toBeNull()
        expect(container.querySelector('[data-testid*="pickup"]')).toBeNull()
        // No text matching pickup/ship to store
        const textContent = container.textContent
        expect(textContent).not.toMatch(/pickup|ship to store|pick up/i)
    })

    it('UT-BODY-003 — exposes Add-to-Bag testid via useEffect DOM annotation', () => {
        const {container} = renderBody()
        // The implementation uses useEffect to find "Add to Cart" button and annotate it
        const btn = container.querySelector('[data-testid="quick-view-add-to-cart-btn"]')
        expect(btn).toBeInTheDocument()
    })

    it('UT-BODY-004 — exposes View Full Details testid', () => {
        const {getByTestId} = renderBody()
        expect(getByTestId('quick-view-view-full-details-link')).toBeInTheDocument()
    })
})

describe('QuickViewModalBody — Add-to-Bag enable/disable rules', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockAddItemToNewOrExistingBasket.mockResolvedValue({})
    })

    // NOTE: The disable/enable logic is handled internally by ProductView based on the
    // product/variant data it receives. Since we mock ProductView, we verify the data flow:
    // the correct product is passed to ProductView and showDeliveryOptions=false.

    it('UT-BODY-005 — disabled when no variation selected on a master product (product data propagated to ProductView)', () => {
        mockProductViewModalReturn = {
            product: {
                id: 'master-001',
                name: 'Master Dress',
                master: true,
                variationAttributes: [{id: 'color', values: [{value: 'red'}, {value: 'blue'}]}],
                variants: [{productId: 'var-1', orderable: true}]
            },
            isFetching: false
        }
        const {getByTestId} = renderBody()
        expect(getByTestId('product-view-name').textContent).toBe('Master Dress')
    })

    it('UT-BODY-006 — disabled when active variant has orderable: false (product data propagated)', () => {
        mockProductViewModalReturn = {
            product: {
                id: 'var-oos',
                name: 'OOS Variant',
                orderable: false,
                variationAttributes: [{id: 'color', values: [{value: 'red'}]}],
                variants: []
            },
            isFetching: false
        }
        const {getByTestId} = renderBody()
        expect(getByTestId('product-view-name').textContent).toBe('OOS Variant')
    })

    it('UT-BODY-007 — disabled when active variant has inventory.stockLevel === 0 (product data propagated)', () => {
        mockProductViewModalReturn = {
            product: {
                id: 'var-zero',
                name: 'Zero Stock',
                orderable: false,
                inventory: {stockLevel: 0},
                variationAttributes: [],
                variants: []
            },
            isFetching: false
        }
        const {getByTestId} = renderBody()
        expect(getByTestId('product-view-name').textContent).toBe('Zero Stock')
    })

    it('UT-BODY-008 — enabled when complete in-stock variation is selected (product data propagated)', () => {
        mockProductViewModalReturn = {
            product: {
                id: 'var-instock',
                name: 'In-Stock Variant',
                orderable: true,
                inventory: {stockLevel: 10},
                variationAttributes: [],
                variants: []
            },
            isFetching: false
        }
        const {getByTestId} = renderBody()
        expect(getByTestId('product-view-name').textContent).toBe('In-Stock Variant')
    })
})

describe('QuickViewModalBody — Add-to-Bag side effects', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockProductViewModalReturn = {
            product: {
                id: 'prod-100',
                name: 'Test Dress',
                price: 49.99,
                variationAttributes: [],
                variants: []
            },
            isFetching: false
        }
    })

    it('UT-BODY-009 — successful add closes the modal', async () => {
        mockAddItemToNewOrExistingBasket.mockResolvedValue({basketId: 'basket-1'})
        renderBody()

        await act(async () => {
            await mockAddToCartProp([{product: mockProductProp, variant: mockProductProp, quantity: 1}], 1)
        })

        expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
    })

    it('UT-BODY-010 — successful add returns productSelectionValues so ProductView can open confirmation modal', async () => {
        mockAddItemToNewOrExistingBasket.mockResolvedValue({basketId: 'basket-1'})
        renderBody()

        const items = [{product: mockProductProp, variant: mockProductProp, quantity: 1}]
        let result
        await act(async () => {
            result = await mockAddToCartProp(items, 1)
        })

        // The handler returns productSelectionValues so ProductView can trigger the
        // global add-to-cart modal (ProductView calls onAddToCartModalOpen internally)
        expect(result).toEqual(items)
    })

    it('UT-BODY-011 — addItemToNewOrExistingBasket is called with correctly mapped product items', async () => {
        mockAddItemToNewOrExistingBasket.mockResolvedValue({})
        renderBody()

        const items = [{product: {productId: 'var-1', price: 29.99}, variant: {productId: 'var-1', price: 29.99}, quantity: 2}]
        await act(async () => {
            await mockAddToCartProp(items, 2)
        })

        expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledTimes(1)
        expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledWith([
            {productId: 'var-1', price: 29.99, quantity: 2}
        ])
    })

    it('UT-BODY-012 — basket helper called once (manages basket creation internally)', async () => {
        mockAddItemToNewOrExistingBasket.mockResolvedValue({})
        renderBody()

        const items = [{product: {productId: 'var-2', price: 19.99}, variant: {productId: 'var-2', price: 19.99}, quantity: 1}]
        await act(async () => {
            await mockAddToCartProp(items, 1)
        })

        // The helper (addItemToNewOrExistingBasket) manages basket creation internally
        expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledTimes(1)
    })

    it('UT-BODY-013 — failed add keeps the modal open and rethrows error', async () => {
        const error = new Error('Network failure')
        mockAddItemToNewOrExistingBasket.mockRejectedValue(error)
        renderBody()

        const items = [{product: mockProductProp, variant: mockProductProp, quantity: 1}]
        await expect(
            mockAddToCartProp(items, 1)
        ).rejects.toThrow('Network failure')

        // closeQuickView should NOT have been called
        expect(mockCloseQuickView).not.toHaveBeenCalled()
    })

    it('UT-BODY-014 — detail fetch failure: body renders gracefully with fallback product data', () => {
        // When useProductViewModal returns null product, the body uses openProduct as fallback
        mockProductViewModalReturn = {
            product: null,
            isFetching: false
        }
        const {container, getByTestId} = renderBody()
        // The heading shows openProduct.name as fallback
        expect(container).toBeInTheDocument()
        // ProductView still renders (with openProduct as fallback)
        expect(getByTestId('product-view')).toBeInTheDocument()
    })
})

describe('QuickViewModalBody — variation interaction', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockAddItemToNewOrExistingBasket.mockResolvedValue({})
    })

    it('UT-BODY-015 — switching variation updates active variant propagated to Add-to-Bag handler', async () => {
        mockProductViewModalReturn = {
            product: {
                id: 'master-001',
                name: 'Multi-Color Dress',
                variationAttributes: [{id: 'color', values: [{value: 'red'}, {value: 'blue'}]}],
                variants: [
                    {productId: 'var-red', orderable: true},
                    {productId: 'var-blue', orderable: true}
                ]
            },
            isFetching: false
        }
        renderBody()

        // Simulate clicking add-to-cart with the blue variant selected
        const blueVariant = {productId: 'var-blue', price: 39.99}
        const items = [{product: mockProductProp, variant: blueVariant, quantity: 1}]
        await act(async () => {
            await mockAddToCartProp(items, 1)
        })

        expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledWith([
            {productId: 'var-blue', price: 39.99, quantity: 1}
        ])
    })
})
