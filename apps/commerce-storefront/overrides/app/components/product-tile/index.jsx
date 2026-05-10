/*
 * ProductTile Override — wraps the base ProductTile with a Quick View
 * trigger button overlay.
 *
 * The trigger is rendered as a positioned sibling on the tile wrapper.
 * The base tile's PDP link, image click, and swatch behavior are unchanged.
 *
 * Re-exports Skeleton unchanged from the base module.
 */
import React from 'react'
import {Box} from '@salesforce/retail-react-app/app/components/shared/ui'
import BaseProductTile from '@salesforce/retail-react-app/app/components/product-tile'
import QuickViewTrigger from '../quick-view-modal/trigger'

export {Skeleton} from '@salesforce/retail-react-app/app/components/product-tile'

const ProductTile = (props) => {
    const {product, ...rest} = props

    return (
        <Box position="relative" role="group">
            <BaseProductTile product={product} {...rest} />
            <QuickViewTrigger product={product} />
        </Box>
    )
}

ProductTile.displayName = 'ProductTile'

export default ProductTile
