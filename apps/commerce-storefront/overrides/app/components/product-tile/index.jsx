/*
 * ProductTile Override — renders the base ProductTile with a Quick View
 * trigger button overlaid on the image area.
 *
 * The trigger is a sibling to the base tile, positioned absolutely over the
 * image. Testids are placed only on elements owned by this override — never
 * on the base component's root (prop-spread footgun).
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
            {product && <QuickViewTrigger product={product} />}
        </Box>
    )
}

export default ProductTile
export {Skeleton}
