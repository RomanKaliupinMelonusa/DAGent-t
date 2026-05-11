/*
 * ProductTile Override — wraps the base ProductTile with a QuickViewTrigger
 * overlay on the tile image area.
 *
 * The trigger is positioned absolute inside a wrapper Box with `role="group"`
 * so the Chakra `_groupHover` style on the trigger works. The base tile's
 * existing click behavior (PDP navigation) is preserved; the trigger uses
 * stopPropagation to prevent bubbling.
 *
 * DO NOT add data-testid on the base tile root — the prop-spread footgun
 * would overwrite it.
 */
import React from 'react'
import {Box} from '@chakra-ui/react'
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
