/*
 * ProductTile Override — wraps the base ProductTile to add a Quick View
 * trigger overlay on each tile's image area.
 *
 * - The trigger is positioned as a sibling overlay; no testids are added
 *   to the base tile's root element (avoids the prop-spread footgun).
 * - The tile's existing PDP link / image click behavior is unaffected.
 * - Sets and bundles are handled by the trigger itself (renders null).
 *
 * See contracts/quick-view-trigger.md for the trigger DOM contract.
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
