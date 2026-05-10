/*
 * ProductTile Override — wraps the base ProductTile with a Quick View trigger overlay.
 *
 * The wrapper renders a positioned container (role="group" for Chakra's _groupHover)
 * with the base tile inside and the QuickViewTrigger as a sibling positioned over
 * the tile image area.
 *
 * Re-exports Skeleton from the base module unchanged.
 */
import React from 'react'
import {Box} from '@salesforce/retail-react-app/app/components/shared/ui'
import BaseProductTile, {
    Skeleton
} from '@salesforce/retail-react-app/app/components/product-tile'
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

export {Skeleton}
export default ProductTile
