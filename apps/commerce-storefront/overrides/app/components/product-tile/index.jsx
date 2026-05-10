/*
 * ProductTile Override — renders the base ProductTile with a QuickViewTrigger
 * overlay positioned over the tile image area.
 *
 * The trigger is a sibling of the base tile, not a child, so the base tile's
 * prop-spread ({...rest}) does not overwrite its data-testid.
 *
 * role="group" on the wrapper enables the trigger's _groupHover visibility.
 */
import React from 'react'
import {Box} from '@chakra-ui/react'
import BaseProductTile, {
    Skeleton as BaseSkeleton
} from '@salesforce/retail-react-app/app/components/product-tile'
import QuickViewTrigger from '../quick-view-modal/trigger'

const ProductTileWithQuickView = (props) => {
    const {product, ...rest} = props

    return (
        <Box position="relative" role="group">
            <BaseProductTile product={product} {...rest} />
            <QuickViewTrigger product={product} />
        </Box>
    )
}

// Re-export Skeleton unchanged so PLP loading states work
export const Skeleton = BaseSkeleton

export default ProductTileWithQuickView
