/*
 * Unit tests for the ProductTile override with Quick View trigger.
 * Validates: trigger rendering (with data-testid pattern), lazy-loading of modal,
 * SSR safety (isMounted pattern), and click behavior.
 */
import React from 'react'
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import '@testing-library/jest-dom'
import {BrowserRouter} from 'react-router-dom'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import {mockProductSearchItem} from '@salesforce/retail-react-app/app/mocks/product-search-hit-data'

// Mock BaseProductTile to avoid pulling in the full component tree
jest.mock('@salesforce/retail-react-app/app/components/product-tile', () => {
    const MockBaseTile = (props) => (
        <div data-testid="base-product-tile">{props.product?.productName}</div>
    )
    MockBaseTile.displayName = 'MockBaseProductTile'
    const MockSkeleton = () => <div data-testid="sf-product-tile-skeleton" />
    return {
        __esModule: true,
        default: MockBaseTile,
        Skeleton: MockSkeleton
    }
})

// Mock the QuickViewModal (lazy-loaded component)
jest.mock('../../quick-view-modal', () => {
    const MockQuickViewModal = (props) =>
        props.isOpen ? <div data-testid="quick-view-modal">Quick View Modal</div> : null
    MockQuickViewModal.displayName = 'MockQuickViewModal'
    return {__esModule: true, default: MockQuickViewModal}
})

jest.mock('@salesforce/retail-react-app/app/components/shared/ui', () => {
    const originalModule = jest.requireActual(
        '@salesforce/retail-react-app/app/components/shared/ui'
    )
    return {
        ...originalModule,
        useBreakpointValue: jest.fn().mockReturnValue(1) // mobile: always visible
    }
})

jest.mock('@chakra-ui/icons', () => ({
    ViewIcon: () => <span data-testid="view-icon">👁</span>
}))

import ProductTile, {Skeleton} from '../../product-tile/index'

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

describe('ProductTile with Quick View trigger', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('renders the base ProductTile', () => {
        renderWithProviders(<ProductTile product={mockProductSearchItem} />)

        expect(screen.getByTestId('base-product-tile')).toBeInTheDocument()
        expect(screen.getByText(mockProductSearchItem.productName)).toBeInTheDocument()
    })

    test('renders Quick View trigger with correct data-testid pattern after mount', async () => {
        renderWithProviders(<ProductTile product={mockProductSearchItem} />)

        // The trigger uses isMounted pattern, so it appears after useEffect runs
        await waitFor(() => {
            expect(
                screen.getByTestId(`quick-view-trigger-${mockProductSearchItem.productId}`)
            ).toBeInTheDocument()
        })
    })

    test('trigger has aria-label "Quick view"', async () => {
        renderWithProviders(<ProductTile product={mockProductSearchItem} />)

        await waitFor(() => {
            const trigger = screen.getByTestId(
                `quick-view-trigger-${mockProductSearchItem.productId}`
            )
            expect(trigger).toHaveAttribute('aria-label', 'Quick view')
        })
    })

    test('clicking the trigger opens the Quick View modal', async () => {
        renderWithProviders(<ProductTile product={mockProductSearchItem} />)

        await waitFor(() => {
            expect(
                screen.getByTestId(`quick-view-trigger-${mockProductSearchItem.productId}`)
            ).toBeInTheDocument()
        })

        const trigger = screen.getByTestId(
            `quick-view-trigger-${mockProductSearchItem.productId}`
        )

        await act(async () => {
            fireEvent.click(trigger)
        })

        await waitFor(() => {
            expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
        })
    })

    test('trigger click does not propagate (prevents navigation)', async () => {
        const parentClick = jest.fn()

        renderWithProviders(
            <div onClick={parentClick}>
                <ProductTile product={mockProductSearchItem} />
            </div>
        )

        await waitFor(() => {
            expect(
                screen.getByTestId(`quick-view-trigger-${mockProductSearchItem.productId}`)
            ).toBeInTheDocument()
        })

        const trigger = screen.getByTestId(
            `quick-view-trigger-${mockProductSearchItem.productId}`
        )

        await act(async () => {
            fireEvent.click(trigger)
        })

        expect(parentClick).not.toHaveBeenCalled()
    })

    test('exports Skeleton component', () => {
        renderWithProviders(<Skeleton />)
        expect(screen.getByTestId('sf-product-tile-skeleton')).toBeInTheDocument()
    })

    test('handles product with no productId gracefully', async () => {
        const productWithoutId = {...mockProductSearchItem, productId: undefined, id: undefined}

        renderWithProviders(<ProductTile product={productWithoutId} />)

        await waitFor(() => {
            // Should still render trigger with empty productId portion
            expect(screen.getByTestId('quick-view-trigger-')).toBeInTheDocument()
        })
    })

    test('uses product.id when productId is not available', async () => {
        const productWithId = {...mockProductSearchItem, productId: undefined, id: 'alt-id-123'}

        renderWithProviders(<ProductTile product={productWithId} />)

        await waitFor(() => {
            expect(screen.getByTestId('quick-view-trigger-alt-id-123')).toBeInTheDocument()
        })
    })
})
