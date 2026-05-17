/*
 * ProductTile Override — renders the base ProductTile with a sibling
 * QuickViewTrigger overlay positioned over the tile image area.
 *
 * The trigger is absolutely positioned inside a relatively-positioned wrapper.
 * The base tile's PDP link click behaviour is unchanged; the trigger calls
 * event.stopPropagation() to prevent navigation when Quick View is activated.
 *
 * The wrapper uses `role="group"` so Chakra's _groupHover on the trigger
 * fires when the user hovers over the tile image.
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

ProductTile.displayName = 'ProductTile'

export {Skeleton}
export default ProductTile
