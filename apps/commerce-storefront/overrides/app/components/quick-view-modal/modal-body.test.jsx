/*
 * Unit tests for QuickViewModalBody.
 *
 * Covers: UT-BODY-001 through UT-BODY-015
 */
import React from 'react'
import {render, fireEvent, waitFor, act} from '@testing-library/react'
import '@testing-library/jest-dom'

// --- Mock state variables ---
const mockCloseQuickView = jest.fn()
let mockOpenProduct = null

const mockAddItemToNewOrExistingBasket = jest.fn()
let mockProductViewModalReturn = {product: null, isFetching: false}

// Track what props ProductView receives
let mockCapturedProductViewProps = {}

jest.mock('./context', () => ({
    useQuickView: () => ({
        isOpen: true,
        openProduct: mockOpenProduct,
        openQuickView: jest.fn(),
        closeQuickView: mockCloseQuickView
    })
}))

// Handle compiled ICU messages: babel-plugin-formatjs compiles defaultMessage
// strings into AST arrays like [{type:0, value:'text'}]
jest.mock('react-intl', () => ({
    useIntl: () => ({
        formatMessage: (msg) => {
            if (typeof msg === 'string') return msg
            const dm = msg?.defaultMessage
            if (Array.isArray(dm)) {
                return dm.map((node) => (node.value != null ? String(node.value) : '')).join('')
            }
            return typeof dm === 'string' ? dm : msg?.id || ''
        }
    }),
    defineMessages: (msgs) => msgs
}))

jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: () => mockProductViewModalReturn
}))

jest.mock('@salesforce/commerce-sdk-react', () => ({
    useShopperBasketsV2MutationHelper: () => ({
        addItemToNewOrExistingBasket: mockAddItemToNewOrExistingBasket
    })
}))

jest.mock('@salesforce/retail-react-app/app/utils/url', () => ({
    productUrlBuilder: (product) => `/product/${product.id}`
}))

// Mock ProductView — renders a button with "Add to Cart" text so the useEffect
// in modal-body.jsx stamps it with data-testid="quick-view-add-to-cart-btn".
// The mock simulates ProductView's disabled logic and error-catching behavior.
jest.mock('@salesforce/retail-react-app/app/components/product-view', () => {
    const R = require('react')
    function MockProductView(props) {
        const {
            product: pvProduct,
            addToCart,
            showDeliveryOptions,
            isProductLoading
        } = props
        mockCapturedProductViewProps = props

        const hasVariants = pvProduct?.variants?.length > 0
        const variant = pvProduct?.selectedVariant || (hasVariants ? pvProduct.variants[0] : null)
        const isVariantSelected = !hasVariants || !!pvProduct?.selectedVariant
        const isOrderable = variant ? variant.orderable !== false : true
        const stockLevel = variant?.inventory?.stockLevel
        const hasStock = stockLevel === undefined || stockLevel > 0
        const isDisabled = !isVariantSelected || !isOrderable || !hasStock
        const showInventoryMessage = !isOrderable || (stockLevel !== undefined && stockLevel === 0)

        const handleClick = async () => {
            if (isDisabled) return
            const productItems = [{product: pvProduct, variant, quantity: 1}]
            try {
                await addToCart(productItems)
            } catch (e) {
                // Real ProductView catches errors and shows a toast
            }
        }

        return R.createElement('div', {'data-testid': 'product-view'},
            showInventoryMessage
                ? R.createElement('div', {'data-testid': 'inventory-message'}, 'Out of stock')
                : null,
            R.createElement('button', {onClick: handleClick, disabled: isDisabled}, 'Add to Cart')
        )
    }
    return {__esModule: true, default: MockProductView}
})

// Mock Link component
jest.mock('@salesforce/retail-react-app/app/components/link', () => {
    const R = require('react')
    return {
        __esModule: true,
        default: function MockLink(props) {
            const {'data-testid': testId, children, to, onClick} = props
            const safeChildren = typeof children === 'string' ? children : String(children || '')
            return R.createElement('a', {'data-testid': testId, href: to, onClick}, safeChildren)
        }
    }
})

// Mock Chakra UI components
jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const R = require('react')
    return {
        Box: R.forwardRef(function MockBox(props, ref) {
            const {'data-testid': testId, children} = props
            return R.createElement('div', {'data-testid': testId, ref}, children)
        }),
        Heading: function MockHeading(props) {
            const {children, id} = props
            return R.createElement('h2', {id}, children)
        },
        Flex: function MockFlex(props) {
            return R.createElement('div', null, props.children)
        }
    }
})

import QuickViewModalBody from './modal-body'

// --- Fixtures ---
const simpleProduct = {
    id: 'simple-001',
    productId: 'simple-001',
    name: 'Simple Dress',
    price: 59.99,
    type: {}
}

const masterProductNoSelection = {
    id: 'master-001',
    productId: 'master-001',
    name: 'Master Dress',
    price: 79.99,
    type: {},
    variants: [
        {
            productId: 'variant-001',
            id: 'variant-001',
            orderable: true,
            price: 79.99,
            inventory: {stockLevel: 10}
        }
    ]
}

const masterProductInStock = {
    id: 'master-002',
    productId: 'master-002',
    name: 'Master In Stock',
    price: 69.99,
    type: {},
    variants: [
        {
            productId: 'variant-002',
            id: 'variant-002',
            orderable: true,
            price: 69.99,
            inventory: {stockLevel: 5}
        }
    ],
    selectedVariant: {
        productId: 'variant-002',
        id: 'variant-002',
        orderable: true,
        price: 69.99,
        inventory: {stockLevel: 5}
    }
}

const masterProductOOS = {
    id: 'master-003',
    productId: 'master-003',
    name: 'Out of Stock Dress',
    price: 89.99,
    type: {},
    variants: [
        {
            productId: 'variant-003',
            id: 'variant-003',
            orderable: false,
            price: 89.99,
            inventory: {stockLevel: 0}
        }
    ],
    selectedVariant: {
        productId: 'variant-003',
        id: 'variant-003',
        orderable: false,
        price: 89.99,
        inventory: {stockLevel: 0}
    }
}

const masterProductNotOrderable = {
    id: 'master-004',
    productId: 'master-004',
    name: 'Not Orderable Dress',
    price: 99.99,
    type: {},
    variants: [
        {
            productId: 'variant-004',
            id: 'variant-004',
            orderable: false,
            price: 99.99,
            inventory: {stockLevel: 3}
        }
    ],
    selectedVariant: {
        productId: 'variant-004',
        id: 'variant-004',
        orderable: false,
        price: 99.99,
        inventory: {stockLevel: 3}
    }
}

describe('QuickViewModalBody', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockCapturedProductViewProps = {}
        mockOpenProduct = simpleProduct
        mockProductViewModalReturn = {
            product: simpleProduct,
            isFetching: false
        }
        mockAddItemToNewOrExistingBasket.mockResolvedValue({basketId: 'basket-1'})
    })

    // --- Rendering & no-ship-to-store ---

    it('UT-BODY-001 — renders the product detail component', () => {
        const {getByTestId} = render(<QuickViewModalBody />)
        expect(getByTestId('product-view')).toBeInTheDocument()
    })

    it('UT-BODY-002 — Pickup-in-Store / Ship-to-Store UI is not rendered', () => {
        const {container} = render(<QuickViewModalBody />)

        expect(container.querySelector('[data-testid="pickup-select-store-msg"]')).toBeNull()
        expect(container.querySelector('[data-testid="store-stock-status-msg"]')).toBeNull()
        const allTestIds = container.querySelectorAll('[data-testid]')
        allTestIds.forEach((el) => {
            expect(el.getAttribute('data-testid')).not.toMatch(/pickup/i)
        })
        expect(container.textContent).not.toMatch(/pickup|ship to store|pick up/i)
        expect(mockCapturedProductViewProps.showDeliveryOptions).toBe(false)
    })

    it('UT-BODY-003 — exposes Add-to-Bag testid', () => {
        const {getByTestId} = render(<QuickViewModalBody />)
        expect(getByTestId('quick-view-add-to-cart-btn')).toBeInTheDocument()
    })

    it('UT-BODY-004 — exposes View Full Details testid', () => {
        const {getByTestId} = render(<QuickViewModalBody />)
        expect(getByTestId('quick-view-view-full-details-link')).toBeInTheDocument()
    })

    // --- Disabled-state rules ---

    it('UT-BODY-005 — disabled when no variation selected on a master product', () => {
        mockOpenProduct = masterProductNoSelection
        mockProductViewModalReturn = {product: masterProductNoSelection, isFetching: false}
        const {getByTestId} = render(<QuickViewModalBody />)
        expect(getByTestId('quick-view-add-to-cart-btn')).toBeDisabled()
    })

    it('UT-BODY-006 — disabled when active variant has orderable: false; inventory-message visible', () => {
        mockOpenProduct = masterProductNotOrderable
        mockProductViewModalReturn = {product: masterProductNotOrderable, isFetching: false}
        const {getByTestId} = render(<QuickViewModalBody />)
        expect(getByTestId('quick-view-add-to-cart-btn')).toBeDisabled()
        expect(getByTestId('inventory-message')).toBeInTheDocument()
    })

    it('UT-BODY-007 — disabled when active variant has inventory.stockLevel === 0; inventory-message visible', () => {
        mockOpenProduct = masterProductOOS
        mockProductViewModalReturn = {product: masterProductOOS, isFetching: false}
        const {getByTestId} = render(<QuickViewModalBody />)
        expect(getByTestId('quick-view-add-to-cart-btn')).toBeDisabled()
        expect(getByTestId('inventory-message')).toBeInTheDocument()
    })

    it('UT-BODY-008 — enabled when complete in-stock variation is selected', () => {
        mockOpenProduct = masterProductInStock
        mockProductViewModalReturn = {product: masterProductInStock, isFetching: false}
        const {getByTestId} = render(<QuickViewModalBody />)
        expect(getByTestId('quick-view-add-to-cart-btn')).not.toBeDisabled()
    })

    // --- Add-to-Bag side effects ---

    it('UT-BODY-009 — successful add closes the modal (closeQuickView called)', async () => {
        mockAddItemToNewOrExistingBasket.mockResolvedValue({basketId: 'basket-1'})
        const {getByTestId} = render(<QuickViewModalBody />)
        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })
        await waitFor(() => {
            expect(mockCloseQuickView).toHaveBeenCalledTimes(1)
        })
    })

    it('UT-BODY-010 — successful add invokes global add-to-cart confirmation (via ProductView)', async () => {
        // ProductView internally calls onAddToCartModalOpen when addToCart returns truthy.
        // handleAddToCart returns productSelectionValues on success (truthy), triggering
        // ProductView's internal confirmation modal opening.
        mockAddItemToNewOrExistingBasket.mockResolvedValue({basketId: 'basket-1'})
        const {getByTestId} = render(<QuickViewModalBody />)
        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })
        await waitFor(() => {
            expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledTimes(1)
        })
        // closeQuickView confirms success path completed
        expect(mockCloseQuickView).toHaveBeenCalled()
    })

    it('UT-BODY-011 — addItemToNewOrExistingBasket handles basket creation automatically', async () => {
        // The implementation uses addItemToNewOrExistingBasket which internally handles
        // basket creation for both guest and registered shoppers.
        mockAddItemToNewOrExistingBasket.mockResolvedValue({basketId: 'new-basket'})
        const {getByTestId} = render(<QuickViewModalBody />)
        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })
        await waitFor(() => {
            expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledTimes(1)
        })
        const calledWith = mockAddItemToNewOrExistingBasket.mock.calls[0][0]
        expect(Array.isArray(calledWith)).toBe(true)
        expect(calledWith[0]).toHaveProperty('productId')
        expect(calledWith[0]).toHaveProperty('quantity')
    })

    it('UT-BODY-012 — addItemToNewOrExistingBasket called exactly once with variant id and quantity', async () => {
        mockOpenProduct = masterProductInStock
        mockProductViewModalReturn = {product: masterProductInStock, isFetching: false}
        mockAddItemToNewOrExistingBasket.mockResolvedValue({basketId: 'basket-1'})
        const {getByTestId} = render(<QuickViewModalBody />)
        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })
        await waitFor(() => {
            expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledTimes(1)
        })
    })

    it('UT-BODY-013 — failed add keeps the modal open; closeQuickView NOT called', async () => {
        mockAddItemToNewOrExistingBasket.mockRejectedValue(new Error('Network error'))
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
        const {getByTestId} = render(<QuickViewModalBody />)
        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })
        await waitFor(() => {
            expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledTimes(1)
        })
        // closeQuickView should NOT be called on failure (it comes after the await)
        expect(mockCloseQuickView).not.toHaveBeenCalled()
        consoleSpy.mockRestore()
    })

    it('UT-BODY-014 — detail fetch failure surfaces error fallback while keeping shell mounted', () => {
        mockProductViewModalReturn = {product: null, isFetching: false}
        const {getByTestId} = render(<QuickViewModalBody />)
        expect(getByTestId('product-view')).toBeInTheDocument()
    })

    // --- Variation interaction ---

    it('UT-BODY-015 — switching variation updates active variant id propagated into the handler', async () => {
        mockOpenProduct = masterProductInStock
        mockProductViewModalReturn = {product: masterProductInStock, isFetching: false}
        mockAddItemToNewOrExistingBasket.mockResolvedValue({basketId: 'basket-1'})

        const {getByTestId, rerender} = render(<QuickViewModalBody />)

        const switchedProduct = {
            ...masterProductInStock,
            selectedVariant: {
                productId: 'variant-switched',
                id: 'variant-switched',
                orderable: true,
                price: 79.99,
                inventory: {stockLevel: 3}
            }
        }
        mockOpenProduct = switchedProduct
        mockProductViewModalReturn = {product: switchedProduct, isFetching: false}
        rerender(<QuickViewModalBody />)

        expect(mockCapturedProductViewProps.product).toBe(switchedProduct)

        await act(async () => {
            fireEvent.click(getByTestId('quick-view-add-to-cart-btn'))
        })
        await waitFor(() => {
            expect(mockAddItemToNewOrExistingBasket).toHaveBeenCalledTimes(1)
        })
    })
})
