/*
 * ProductTile Override — wraps the base ProductTile to add a Quick View trigger
 * overlay on each eligible tile.
 *
 * The trigger is rendered as a sibling overlay positioned over the tile image.
 * The base tile's PDP link continues to work unchanged.
 *
 * Re-exports Skeleton unchanged from the base module.
 */
import React from 'react'
import {Box} from '@salesforce/retail-react-app/app/components/shared/ui'
import BaseProductTile from '@salesforce/retail-react-app/app/components/product-tile'
import QuickViewTrigger from '../quick-view-modal/trigger'

export {Skeleton} from '@salesforce/retail-react-app/app/components/product-tile'

const ProductTile = (props) => {
    const {product, ...rest} = props

    return (
        <Box position="relative" role="group">
            <BaseProductTile product={product} {...rest} />
            <QuickViewTrigger product={product} />
        </Box>
    )
}

ProductTile.propTypes = BaseProductTile.propTypes

export default ProductTile
