/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import React from 'react'
import {render, screen, fireEvent} from '@testing-library/react'
import '@testing-library/jest-dom'
import {ChakraProvider} from '@salesforce/retail-react-app/app/components/shared/ui'
import theme from '@salesforce/retail-react-app/app/theme'
import {IntlProvider} from 'react-intl'
import {BrowserRouter} from 'react-router-dom'

// Mock the base ProductTile
jest.mock('@salesforce/retail-react-app/app/components/product-tile', () => {
    const React = require('react')
    return {
        __esModule: true,
        default: (props) =>
            React.createElement(
                'div',
                {'data-testid': 'base-product-tile'},
                React.createElement(
                    'a',
                    {href: `/product/${props.product?.productId}`},
                    React.createElement(
                        'div',
                        {'data-testid': 'image-wrapper'},
                        'Product Image'
                    )
                )
            )
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
        ViewIcon: (props) => React.createElement('svg', {'data-testid': 'view-icon', ...props})
    }
})

import ProductTile from './index'

const standardProduct = {
    productId: '123',
    productName: 'Diamond Ring',
    name: 'Diamond Ring'
}

const productSet = {
    productId: '456',
    productName: 'Gift Set',
    type: {set: true}
}

const productBundle = {
    productId: '789',
    productName: 'Bundle Pack',
    type: {bundle: true}
}

const productNoId = {
    productName: 'No ID Product'
}

/**
 * Lightweight test renderer with minimal providers.
 */
const renderWithProviders = (ui) => {
    return render(
        <ChakraProvider theme={theme}>
            <IntlProvider locale="en-US" defaultLocale="en-US" messages={{}}>
                <BrowserRouter>{ui}</BrowserRouter>
            </IntlProvider>
        </ChakraProvider>
    )
}

beforeEach(() => {
    jest.clearAllMocks()
})

describe('ProductTile Override', () => {
    // --- Overlay Bar Rendering ---
    test('renders Quick View overlay bar on standard product', () => {
        renderWithProviders(<ProductTile product={standardProduct} />)
        expect(screen.getByTestId('quick-view-btn')).toBeInTheDocument()
    })

    test('overlay bar contains eye icon and "Quick View" text', () => {
        renderWithProviders(<ProductTile product={standardProduct} />)
        const bar = screen.getByTestId('quick-view-btn')
        expect(screen.getByTestId('view-icon')).toBeInTheDocument()
        expect(bar).toHaveTextContent('Quick View')
    })

    test('overlay bar has correct aria-label', () => {
        renderWithProviders(<ProductTile product={standardProduct} />)
        const bar = screen.getByTestId('quick-view-btn')
        expect(bar.getAttribute('aria-label')).toBe('Quick View Diamond Ring')
    })

    test('does NOT render bar for product sets', () => {
        renderWithProviders(<ProductTile product={productSet} />)
        expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
    })

    test('does NOT render bar for product bundles', () => {
        renderWithProviders(<ProductTile product={productBundle} />)
        expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
    })

    test('does NOT render bar when productId is missing', () => {
        renderWithProviders(<ProductTile product={productNoId} />)
        expect(screen.queryByTestId('quick-view-btn')).not.toBeInTheDocument()
    })

    test('forwards all props to base ProductTile', () => {
        renderWithProviders(
            <ProductTile
                product={standardProduct}
                enableFavourite={true}
                badgeDetails={['New']}
            />
        )
        expect(screen.getByTestId('base-product-tile')).toBeInTheDocument()
    })

    // --- Interaction Tests ---
    test('clicking bar opens QuickViewModal', () => {
        renderWithProviders(<ProductTile product={standardProduct} />)
        const bar = screen.getByTestId('quick-view-btn')
        fireEvent.click(bar)
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    test('clicking bar calls preventDefault', () => {
        renderWithProviders(<ProductTile product={standardProduct} />)
        const bar = screen.getByTestId('quick-view-btn')
        const clickEvent = new MouseEvent('click', {bubbles: true, cancelable: true})
        Object.defineProperty(clickEvent, 'preventDefault', {value: jest.fn()})
        Object.defineProperty(clickEvent, 'stopPropagation', {value: jest.fn()})
        bar.dispatchEvent(clickEvent)
        expect(clickEvent.preventDefault).toHaveBeenCalled()
    })

    test('clicking bar calls stopPropagation', () => {
        renderWithProviders(<ProductTile product={standardProduct} />)
        const bar = screen.getByTestId('quick-view-btn')
        const clickEvent = new MouseEvent('click', {bubbles: true, cancelable: true})
        Object.defineProperty(clickEvent, 'preventDefault', {value: jest.fn()})
        Object.defineProperty(clickEvent, 'stopPropagation', {value: jest.fn()})
        bar.dispatchEvent(clickEvent)
        expect(clickEvent.stopPropagation).toHaveBeenCalled()
    })

    test('closing modal hides QuickViewModal', () => {
        renderWithProviders(<ProductTile product={standardProduct} />)
        expect(screen.queryByTestId('quick-view-modal')).not.toBeInTheDocument()
        const bar = screen.getByTestId('quick-view-btn')
        fireEvent.click(bar)
        expect(screen.getByTestId('quick-view-modal')).toBeInTheDocument()
    })

    // --- Visual State Tests ---
    test('container has role="group" for hover pseudo', () => {
        renderWithProviders(<ProductTile product={standardProduct} />)
        const container = screen.getByTestId('product-tile-container')
        expect(container.getAttribute('role')).toBe('group')
    })

    test('renders base product tile', () => {
        renderWithProviders(<ProductTile product={standardProduct} />)
        expect(screen.getByTestId('base-product-tile')).toBeInTheDocument()
    })
})
