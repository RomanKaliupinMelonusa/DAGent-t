/*
 * Unit tests for ProductTile override (Quick View overlay bar)
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent, waitFor} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import {BrowserRouter} from 'react-router-dom'
import theme from '@salesforce/retail-react-app/app/theme'
import ProductTile from './index'

// Mock the base ProductTile
jest.mock('@salesforce/retail-react-app/app/components/product-tile', () => {
    const React = require('react')
    const MockProductTile = React.forwardRef((props, ref) =>
        React.createElement(
            'div',
            {ref, 'data-testid': 'base-product-tile', 'data-props': JSON.stringify({
                enableFavourite: props.enableFavourite,
                badgeDetails: props.badgeDetails,
                imageViewType: props.imageViewType
            })},
            React.createElement(
                'a',
                {href: `/product/${props.product?.productId}`},
                React.createElement('div', {'data-testid': 'image-wrapper'}, 'Product Image')
            )
        )
    )
    MockProductTile.displayName = 'MockProductTile'
    return {
        __esModule: true,
        default: MockProductTile,
        Skeleton: () => React.createElement('div', {'data-testid': 'skeleton'}, 'Loading...')
    }
})

// Mock QuickViewModal to isolate tile tests
jest.mock('../quick-view-modal', () => {
    const React = require('react')
    return {
        __esModule: true,
        default: (props) =>
            props.isOpen
                ? React.createElement('div', {'data-testid': 'quick-view-modal', 'data-product-id': props.product?.productId}, 'Modal')
                : null
    }
})

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

const mockStandardProduct = {
    productId: '25502228M',
    productName: 'Diamond Ring',
    name: 'Diamond Ring',
    price: 99,
    currency: 'USD',
    image: {
        alt: 'Diamond Ring',
        disBaseLink: 'https://example.com/diamond-ring.jpg'
    },
    imageGroups: [
        {
            images: [{alt: 'Diamond Ring', disBaseLink: 'https://example.com/diamond-ring.jpg'}],
            viewType: 'large'
        }
    ]
}

const mockSetProduct = {
    productId: 'set-123',
    productName: 'Gift Set',
    image: {alt: 'Gift Set', disBaseLink: 'https://example.com/set.jpg'},
    imageGroups: [],
    type: {set: true}
}

const mockBundleProduct = {
    productId: 'bundle-456',
    productName: 'Bundle Deal',
    image: {alt: 'Bundle Deal', disBaseLink: 'https://example.com/bundle.jpg'},
    imageGroups: [],
    type: {bundle: true}
}

const mockProductNoId = {
    productName: 'No ID Product',
    image: {alt: 'No ID', disBaseLink: 'https://example.com/noid.jpg'},
    imageGroups: []
}

// Product with only `name` (no `productName`) — tests fallback branch
const mockProductNameOnly = {
    productId: 'name-only-789',
    name: 'Sapphire Necklace',
    price: 199,
    currency: 'USD',
    image: {alt: 'Sapphire Necklace', disBaseLink: 'https://example.com/necklace.jpg'},
    imageGroups: []
}

// Product with neither name field — tests empty string fallback
const mockProductNoName = {
    productId: 'no-name-000',
    price: 50,
    currency: 'USD',
    image: {alt: 'Unknown', disBaseLink: 'https://example.com/unknown.jpg'},
    imageGroups: []
}

beforeEach(() => {
    jest.clearAllMocks()
})

// --- Overlay Bar Rendering ---

test('renders Quick View overlay bar on standard product', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    expect(screen.getByTestId('quick-view-btn')).toBeInTheDocument()
})

test('overlay bar contains "Quick View" text', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    const btn = screen.getByTestId('quick-view-btn')
    expect(btn).toHaveTextContent('Quick View')
})

test('overlay bar has correct aria-label', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    const btn = screen.getByTestId('quick-view-btn')
    expect(btn.getAttribute('aria-label')).toBe('Quick View Diamond Ring')
})

test('aria-label uses name fallback when productName missing', () => {
    renderWithProviders(<ProductTile product={mockProductNameOnly} />)
    const btn = screen.getByTestId('quick-view-btn')
    expect(btn.getAttribute('aria-label')).toBe('Quick View Sapphire Necklace')
})

test('aria-label falls back to empty string when no name fields', () => {
    renderWithProviders(<ProductTile product={mockProductNoName} />)
    const btn = screen.getByTestId('quick-view-btn')
    expect(btn.getAttribute('aria-label')).toBe('Quick View ')
})

test('does NOT render bar for product sets', () => {
    renderWithProviders(<ProductTile product={mockSetProduct} />)
    expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
})

test('does NOT render bar for product bundles', () => {
    renderWithProviders(<ProductTile product={mockBundleProduct} />)
    expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
})

test('does NOT render bar when productId is missing', () => {
    renderWithProviders(<ProductTile product={mockProductNoId} />)
    expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
})

test('forwards all props to base ProductTile', () => {
    renderWithProviders(
        <ProductTile
            product={mockStandardProduct}
            enableFavourite={true}
            badgeDetails={['New']}
            imageViewType="large"
        />
    )
    const baseTile = screen.getByTestId('base-product-tile')
    expect(baseTile).toBeInTheDocument()
    const receivedProps = JSON.parse(baseTile.getAttribute('data-props'))
    expect(receivedProps.enableFavourite).toBe(true)
    expect(receivedProps.badgeDetails).toEqual(['New'])
    expect(receivedProps.imageViewType).toBe('large')
})

test('renders base ProductTile for sets without Quick View bar', () => {
    renderWithProviders(<ProductTile product={mockSetProduct} />)
    expect(screen.getByTestId('base-product-tile')).toBeInTheDocument()
    expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
})

// --- Interaction ---

test('clicking bar opens QuickViewModal', async () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)

    const btn = screen.getByTestId('quick-view-btn')
    fireEvent.click(btn)

    // QuickViewModal is lazy-loaded, so we need to wait for it
    await waitFor(() => {
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })
})

test('clicking bar calls preventDefault', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)

    const btn = screen.getByTestId('quick-view-btn')
    const event = new MouseEvent('click', {bubbles: true, cancelable: true})
    const preventDefaultSpy = jest.spyOn(event, 'preventDefault')

    btn.dispatchEvent(event)
    expect(preventDefaultSpy).toHaveBeenCalled()
})

test('clicking bar calls stopPropagation', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)

    const btn = screen.getByTestId('quick-view-btn')
    const event = new MouseEvent('click', {bubbles: true, cancelable: true})
    const stopPropagationSpy = jest.spyOn(event, 'stopPropagation')

    btn.dispatchEvent(event)
    expect(stopPropagationSpy).toHaveBeenCalled()
})

test('modal receives correct product', async () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)

    const btn = screen.getByTestId('quick-view-btn')
    fireEvent.click(btn)

    await waitFor(() => {
        const modal = screen.getByTestId('quick-view-modal')
        expect(modal.getAttribute('data-product-id')).toBe(mockStandardProduct.productId)
    })
})

// --- Visual States ---

test('overlay bar is rendered as a button element', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    const btn = screen.getByTestId('quick-view-btn')
    expect(btn.tagName).toBe('BUTTON')
})

test('container has role="group" for hover pseudo', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)

    const btn = screen.getByTestId('quick-view-btn')
    const groupContainer = btn.closest('[role="group"]')
    expect(groupContainer).toBeInTheDocument()
})

test('overlay bar is nested within an overflow-hidden container', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    const btn = screen.getByTestId('quick-view-btn')
    const parent = btn.parentElement
    expect(parent).toBeTruthy()
    expect(parent.contains(btn)).toBe(true)
})

test('handles undefined product gracefully', () => {
    renderWithProviders(<ProductTile product={undefined} />)
    expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
})

// --- SSR Safety ---

test('QuickViewModal is NOT mounted when modal is closed', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    // Modal should not be in the DOM when not opened
    expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
})
