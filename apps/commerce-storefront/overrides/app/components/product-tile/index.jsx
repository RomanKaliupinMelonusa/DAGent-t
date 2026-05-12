/*
 * ProductTile Override — wraps the base ProductTile with a Quick View trigger overlay.
 *
 * The trigger is rendered as a sibling overlay positioned over the tile image area.
 * The base tile's PDP link click behavior is unchanged.
 *
 * Re-exports `Skeleton` from the base module unchanged.
 */
import React from 'react'
import BaseProductTile, {
    Skeleton
} from '@salesforce/retail-react-app/app/components/product-tile'
import {Box} from '@salesforce/retail-react-app/app/components/shared/ui'
import QuickViewTrigger from '../quick-view-modal/trigger'

const ProductTile = (props) => {
    const {product, ...rest} = props

    return (
        <Box position="relative" role="group">
            <BaseProductTile product={product} {...rest} />
            <QuickViewTrigger product={product} />
        </Box>
    )
}

export default ProductTile
export {Skeleton}
