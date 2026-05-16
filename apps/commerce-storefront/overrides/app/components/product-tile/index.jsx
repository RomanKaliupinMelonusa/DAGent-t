/*
 * ProductTile Override — renders the base ProductTile with a sibling
 * QuickViewTrigger overlay positioned over the tile image area.
 *
 * The trigger is rendered on a wrapper element (not the base tile root)
 * to avoid the prop-spread footgun where a parent-supplied data-testid
 * would overwrite ours.
 *
 * Set/Bundle exclusion is handled inside QuickViewTrigger itself (renders null).
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

// Re-export Skeleton so PLP can import {Skeleton} from this override
export {Skeleton}
export default ProductTile
