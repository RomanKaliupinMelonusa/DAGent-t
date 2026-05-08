/*
 * ProductTile Override — renders the base ProductTile with a sibling
 * QuickViewTrigger overlay for the Quick View feature.
 *
 * The wrapper uses position:relative so the trigger can be absolutely
 * positioned over the tile image area. The `role="group"` enables
 * Chakra's _groupHover on the trigger for desktop hover reveal.
 */
import React from 'react'
import {Box} from '@salesforce/retail-react-app/app/components/shared/ui'
import BaseProductTile, {
    Skeleton as BaseSkeleton
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

export const Skeleton = BaseSkeleton
export default ProductTile
