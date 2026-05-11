/*
 * ProductTile Override — wraps the base ProductTile with a Quick View trigger
 * overlay. The trigger is rendered as a sibling positioned over the tile image.
 *
 * The wrapper adds `data-testid` on its own Box; it does NOT put a data-testid
 * on the base tile root (avoids the PWA Kit prop-spread footgun where parent
 * pages overwrite testids via {...rest}).
 *
 * Re-exports Skeleton unchanged from the base module.
 */
import React from 'react'
import {Box} from '@salesforce/retail-react-app/app/components/shared/ui'
import BaseProductTile from '@salesforce/retail-react-app/app/components/product-tile'
export {Skeleton} from '@salesforce/retail-react-app/app/components/product-tile'
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

// Forward propTypes from the base component
ProductTile.propTypes = BaseProductTile.propTypes

export default ProductTile
