/*
 * ProductTile Override — wraps the base ProductTile with a Quick View
 * trigger button overlay.
 *
 * The trigger is rendered as a positioned sibling on the tile wrapper.
 * The base tile's PDP link, image click, and swatch behavior are unchanged.
 *
 * The parent PLP page passes data-testid as a prop. We lift it to the
 * wrapper Box so E2E locators like
 * getByTestId(/^sf-product-tile-/).getByRole('link') can find the base
 * tile root <a> as a child link. Without this lift the testid lands on
 * the <a> itself (via BaseProductTile's {...rest} spread) and
 * getByRole('link') finds no children.
 *
 * Re-exports Skeleton unchanged from the base module.
 */
import React from 'react'
import {Box} from '@salesforce/retail-react-app/app/components/shared/ui'
import BaseProductTile from '@salesforce/retail-react-app/app/components/product-tile'
import QuickViewTrigger from '../quick-view-modal/trigger'

export {Skeleton} from '@salesforce/retail-react-app/app/components/product-tile'

const ProductTile = (props) => {
    // Lift data-testid to the wrapper Box so E2E locators like
    // getByTestId(/^sf-product-tile-/).getByRole('link') find the base
    // tile root <a> as a child link.
    const {product, 'data-testid': tileTestId, ...rest} = props

    return (
        <Box position="relative" role="group" data-testid={tileTestId}>
            <BaseProductTile product={product} {...rest} />
            <QuickViewTrigger product={product} />
        </Box>
    )
}

ProductTile.displayName = 'ProductTile'

export default ProductTile
