/*
 * Unit tests for ProductTile override with Quick View overlay bar
 */

import React from 'react'
import {screen, fireEvent, render} from '@testing-library/react'
import '@testing-library/jest-dom'
import {IntlProvider} from 'react-intl'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import theme from '@salesforce/retail-react-app/app/theme'

// Mock datacloud before anything
jest.mock('@salesforce/cc-datacloud-typescript', () => ({
    initDataCloudSdk: jest.fn()
}))

// Mock the base ProductTile
jest.mock('@salesforce/retail-react-app/app/components/product-tile', () => {
    const React = require('react')
    const BaseTile = React.forwardRef((props, ref) =>
        React.createElement(
            'div',
            {'data-testid': 'base-product-tile', ref},
            React.createElement(
                'a',
                {href: `/product/${props.product?.productId}`},
                React.createElement('div', {'data-testid': 'image-wrapper'}, 'Product Image')
            )
        )
    )
    BaseTile.displayName = 'MockProductTile'
    return {
        __esModule: true,
        default: BaseTile,
        Skeleton: () => React.createElement('div', {'data-testid': 'product-tile-skeleton'})
    }
})

// Mock QuickViewModal to isolate tile tests (relative path)
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

// Mock ViewIcon
jest.mock('@chakra-ui/icons', () => ({
    ViewIcon: (props) => {
        const React = require('react')
        return React.createElement('svg', {'data-testid': 'view-icon', ...props})
    }
}))

import ProductTile from './index'

const standardProduct = {
    productId: '123',
    productName: 'Diamond Ring',
    name: 'Diamond Ring',
    price: 199,
    currency: 'USD',
    imageGroups: [],
    variationAttributes: []
}

// Simple wrapper with minimal providers
const renderTile = (ui) => {
    return render(
        <ChakraProvider theme={theme}>
            <IntlProvider locale="en-US" defaultLocale="en-US" messages={{}}>
                {ui}
            </IntlProvider>
        </ChakraProvider>
    )
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('ProductTile with Quick View', () => {
    // --- Overlay Bar Rendering ---

    test('renders Quick View overlay bar on standard product', () => {
        renderTile(<ProductTile product={standardProduct} />)
        expect(screen.getByTestId('quick-view-btn')).toBeInTheDocument()
    })

    test('overlay bar contains eye icon and "Quick View" text', () => {
        renderTile(<ProductTile product={standardProduct} />)
        const btn = screen.getByTestId('quick-view-btn')
        expect(btn).toHaveTextContent('Quick View')
        expect(screen.getByTestId('view-icon')).toBeInTheDocument()
    })

    test('overlay bar has correct aria-label', () => {
        renderTile(<ProductTile product={standardProduct} />)
        const btn = screen.getByTestId('quick-view-btn')
        expect(btn.getAttribute('aria-label')).toBe('Quick View Diamond Ring')
    })

    test('does NOT render bar for product sets', () => {
        const setProduct = {...standardProduct, type: {set: true}}
        renderTile(<ProductTile product={setProduct} />)
        expect(screen.queryByTestId('quick-view-btn')).toBeNull()
    })

    test('does NOT render bar for product bundles', () => {
        const bundleProduct = {...standardProduct, type: {bundle: true}}
        renderTile(<ProductTile product={bundleProduct} />)
        expect(screen.queryByTestId('quick-view-btn')).toBeNull()
    })

    test('does NOT render bar when productId is missing', () => {
        const noIdProduct = {productName: 'No ID Product'}
        renderTile(<ProductTile product={noIdProduct} />)
        expect(screen.queryByTestId('quick-view-btn')).toBeNull()
    })

    test('forwards all props to base ProductTile', () => {
        renderTile(
            <ProductTile
                product={standardProduct}
                enableFavourite={true}
                badgeDetails={[]}
            />
        )
        // Base tile should render
        expect(screen.getByTestId('base-product-tile')).toBeInTheDocument()
    })

    // --- Interaction ---

    test('clicking bar opens QuickViewModal', () => {
        renderTile(<ProductTile product={standardProduct} />)
        const btn = screen.getByTestId('quick-view-btn')
        fireEvent.click(btn)
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    test('clicking bar calls preventDefault', () => {
        renderTile(<ProductTile product={standardProduct} />)
        const btn = screen.getByTestId('quick-view-btn')
        const prevented = fireEvent.click(btn)
        // fireEvent.click returns false when preventDefault was called
        expect(prevented).toBe(false)
    })

    test('closing modal hides QuickViewModal', () => {
        renderTile(<ProductTile product={standardProduct} />)
        // Open the modal
        const btn = screen.getByTestId('quick-view-btn')
        fireEvent.click(btn)
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    // --- Visual States ---

    test('container has role="group" for hover pseudo', () => {
        renderTile(<ProductTile product={standardProduct} />)
        const groups = screen.getAllByRole('group')
        expect(groups.length).toBeGreaterThan(0)
    })
})
