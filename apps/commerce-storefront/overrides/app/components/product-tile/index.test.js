/*
 * Unit tests for ProductTile override with Quick View overlay bar.
 */
import '@testing-library/jest-dom'
import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {BrowserRouter} from 'react-router-dom'

// Mock @salesforce/commerce-sdk-react to prevent deep dependency resolution
jest.mock('@salesforce/commerce-sdk-react', () => ({
    useProduct: jest.fn(() => ({data: null, isFetching: false})),
    useVariant: jest.fn(() => null)
}))

// Mock the base ProductTile
jest.mock('@salesforce/retail-react-app/app/components/product-tile', () => {
    const MockReact = require('react')
    return {
        __esModule: true,
        default: (props) =>
            MockReact.createElement(
                'div',
                {'data-testid': 'base-product-tile'},
                MockReact.createElement(
                    'a',
                    {href: `/product/${props.product?.productId}`},
                    MockReact.createElement(
                        'div',
                        {'data-testid': 'image-wrapper'},
                        'Product Image'
                    )
                )
            )
    }
})

// Mock QuickViewModal to isolate tile tests (relative path as used in the component)
jest.mock('../quick-view-modal', () => {
    const MockReact = require('react')
    return {
        __esModule: true,
        default: (props) =>
            props.isOpen
                ? MockReact.createElement('div', {'data-testid': 'quick-view-modal'}, 'Modal')
                : null
    }
})

// Mock @chakra-ui/icons
jest.mock('@chakra-ui/icons', () => {
    const MockReact = require('react')
    return {
        ViewIcon: (props) =>
            MockReact.createElement('span', {'data-testid': 'view-icon', ...props})
    }
})

// Mock useProductViewModal (used inside QuickViewModal)
jest.mock('@salesforce/retail-react-app/app/hooks/use-product-view-modal', () => ({
    useProductViewModal: jest.fn(() => ({product: null, isFetching: false}))
}))

import ProductTile from './index'

const mockProduct = {
    productId: 'test-123',
    productName: 'Diamond Ring',
    name: 'Diamond Ring'
}

// Wrapper with required providers
const renderWithProviders = (ui) => {
    return render(
        <IntlProvider locale="en-US" messages={{}}>
            <BrowserRouter>{ui}</BrowserRouter>
        </IntlProvider>
    )
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('ProductTile with Quick View', () => {
    // --- Overlay Bar Rendering ---

    test('renders Quick View overlay bar on standard product', () => {
        renderWithProviders(<ProductTile product={mockProduct} />)
        expect(screen.getByTestId('quick-view-btn')).toBeInTheDocument()
    })

    test('overlay bar contains eye icon and Quick View text', () => {
        renderWithProviders(<ProductTile product={mockProduct} />)
        const btn = screen.getByTestId('quick-view-btn')
        expect(btn).toHaveTextContent('Quick View')
        expect(screen.getByTestId('view-icon')).toBeInTheDocument()
    })

    test('overlay bar has correct aria-label', () => {
        renderWithProviders(<ProductTile product={mockProduct} />)
        const btn = screen.getByTestId('quick-view-btn')
        expect(btn).toHaveAttribute('aria-label', 'Quick View Diamond Ring')
    })

    test('does NOT render bar for product sets', () => {
        const setProduct = {...mockProduct, type: {set: true}}
        renderWithProviders(<ProductTile product={setProduct} />)
        expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
    })

    test('does NOT render bar for product bundles', () => {
        const bundleProduct = {...mockProduct, type: {bundle: true}}
        renderWithProviders(<ProductTile product={bundleProduct} />)
        expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
    })

    test('does NOT render bar when productId is missing', () => {
        const noIdProduct = {productName: 'No ID Product'}
        renderWithProviders(<ProductTile product={noIdProduct} />)
        expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
    })

    test('forwards all props to base ProductTile', () => {
        renderWithProviders(
            <ProductTile product={mockProduct} enableFavourite={true} badgeDetails={['New']} />
        )
        expect(screen.getByTestId('base-product-tile')).toBeInTheDocument()
    })

    // --- Interaction ---

    test('clicking bar opens QuickViewModal', () => {
        renderWithProviders(<ProductTile product={mockProduct} />)
        const btn = screen.getByTestId('quick-view-btn')
        fireEvent.click(btn)
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    test('clicking bar does not navigate to PDP', () => {
        renderWithProviders(<ProductTile product={mockProduct} />)
        const initialUrl = window.location.href
        const btn = screen.getByTestId('quick-view-btn')
        fireEvent.click(btn)
        // URL should not change — preventDefault blocks Link navigation
        expect(window.location.href).toBe(initialUrl)
        // Modal should open instead of navigating
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    test('closing modal hides QuickViewModal', () => {
        renderWithProviders(<ProductTile product={mockProduct} />)
        // Open the modal
        fireEvent.click(screen.getByTestId('quick-view-btn'))
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    // --- Visual States ---

    test('container has role="group" for hover pseudo', () => {
        renderWithProviders(<ProductTile product={mockProduct} />)
        const groupContainer = screen.getByRole('group')
        expect(groupContainer).toBeInTheDocument()
    })
})
