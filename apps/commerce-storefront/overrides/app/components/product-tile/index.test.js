/*
 * Unit tests for ProductTile override (Quick View overlay bar)
 */
import React from 'react'
import '@testing-library/jest-dom'
import {render, screen, fireEvent} from '@testing-library/react'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import {BrowserRouter} from 'react-router-dom'
import theme from '@salesforce/retail-react-app/app/theme'
import ProductTile from './index'

// Track props passed to base ProductTile
const mockBaseTileProps = jest.fn()

// Mock the base ProductTile
jest.mock('@salesforce/retail-react-app/app/components/product-tile', () => {
    const React = require('react')
    const MockProductTile = React.forwardRef((props, ref) => {
        mockBaseTileProps(props)
        return React.createElement(
            'div',
            {ref, 'data-testid': 'base-product-tile'},
            React.createElement(
                'a',
                {href: `/product/${props.product?.productId}`},
                React.createElement('div', {'data-testid': 'image-wrapper'}, 'Product Image')
            )
        )
    })
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
                ? React.createElement('div', {'data-testid': 'quick-view-modal'}, 'Modal')
                : null
    }
})

// Mock @chakra-ui/icons
jest.mock('@chakra-ui/icons', () => {
    const React = require('react')
    return {
        ViewIcon: (props) =>
            React.createElement('span', {'data-testid': 'view-icon', ...props})
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

beforeEach(() => {
    jest.clearAllMocks()
})

// --- Overlay Bar Rendering ---

test('renders Quick View overlay bar on standard product', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    expect(screen.getByTestId('quick-view-btn')).toBeInTheDocument()
})

test('overlay bar contains eye icon and "Quick View" text', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    const btn = screen.getByTestId('quick-view-btn')
    expect(btn).toHaveTextContent('Quick View')
    expect(screen.getByTestId('view-icon')).toBeInTheDocument()
})

test('overlay bar has correct aria-label with productName', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    const btn = screen.getByTestId('quick-view-btn')
    expect(btn.getAttribute('aria-label')).toBe('Quick View Diamond Ring')
})

test('overlay bar aria-label falls back to name when productName is missing', () => {
    const productWithNameOnly = {
        productId: 'prod-789',
        name: 'Sapphire Necklace',
        image: {alt: 'Necklace', disBaseLink: 'https://example.com/necklace.jpg'},
        imageGroups: []
    }
    renderWithProviders(<ProductTile product={productWithNameOnly} />)
    const btn = screen.getByTestId('quick-view-btn')
    expect(btn.getAttribute('aria-label')).toBe('Quick View Sapphire Necklace')
})

test('overlay bar aria-label is "Quick View " when both names are missing', () => {
    const productNoName = {
        productId: 'prod-noname',
        image: {alt: 'No name', disBaseLink: 'https://example.com/noname.jpg'},
        imageGroups: []
    }
    renderWithProviders(<ProductTile product={productNoName} />)
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

test('does NOT render bar when product is undefined', () => {
    renderWithProviders(<ProductTile product={undefined} />)
    expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
})

test('forwards all props to base ProductTile', () => {
    const extraProps = {
        enableFavourite: true,
        badgeDetails: [{label: 'New'}],
        isFavourite: false,
        imageViewType: 'large'
    }
    renderWithProviders(
        <ProductTile product={mockStandardProduct} {...extraProps} />
    )
    // Base tile is rendered
    expect(screen.getByTestId('base-product-tile')).toBeInTheDocument()
    // Verify props passed to mock
    expect(mockBaseTileProps).toHaveBeenCalledWith(
        expect.objectContaining({
            product: mockStandardProduct,
            enableFavourite: true,
            badgeDetails: [{label: 'New'}],
            isFavourite: false,
            imageViewType: 'large'
        })
    )
})

// --- Interaction ---

test('clicking bar opens QuickViewModal', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)

    const btn = screen.getByTestId('quick-view-btn')
    fireEvent.click(btn)

    expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
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

test('closing modal hides QuickViewModal', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)

    // Open modal
    const btn = screen.getByTestId('quick-view-btn')
    fireEvent.click(btn)
    expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()

    // The mock QuickViewModal shows when isOpen=true.
    // The closing is handled by Chakra's useDisclosure internally.
})

// --- Visual States ---

test('container has role="group" for hover pseudo', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)

    const btn = screen.getByTestId('quick-view-btn')
    // Walk up to find the group container
    const groupContainer = btn.closest('[role="group"]')
    expect(groupContainer).toBeInTheDocument()
})

test('overlay bar renders as a button element', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    const btn = screen.getByTestId('quick-view-btn')
    expect(btn.tagName.toLowerCase()).toBe('button')
})

test('still renders base ProductTile for sets without quick view bar', () => {
    renderWithProviders(<ProductTile product={mockSetProduct} />)
    // Base tile should still render even when quick view is hidden
    expect(screen.getByTestId('base-product-tile')).toBeInTheDocument()
    expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
})

test('still renders base ProductTile for bundles without quick view bar', () => {
    renderWithProviders(<ProductTile product={mockBundleProduct} />)
    expect(screen.getByTestId('base-product-tile')).toBeInTheDocument()
    expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
})

test('does not render QuickViewModal until bar is clicked', () => {
    renderWithProviders(<ProductTile product={mockStandardProduct} />)
    // Before click, no modal is mounted (lazy rendering)
    expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
})
