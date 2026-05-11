/*
 * ProductTile Override — wraps the base ProductTile with a QuickViewTrigger
 * overlay. The trigger is positioned over the tile image area so it is
 * accessible via hover (desktop) and always visible on touch devices.
 *
 * NOTE: The testid for the trigger lives on a WRAPPER element, not on the
 * base tile's root — this avoids the PWA Kit prop-spread footgun where
 * parent pages pass data-testid via props.
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
            {product && <QuickViewTrigger product={product} />}
        </Box>
    )
}

ProductTile.displayName = 'ProductTile'

export default ProductTile
export {Skeleton}
