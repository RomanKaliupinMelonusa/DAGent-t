/*
 * ProductTile Override — wraps the base ProductTile with a sibling
 * QuickViewTrigger overlay button.
 *
 * The wrapper Box uses `role="group"` so the trigger can respond to
 * _groupHover (opacity transition on desktop). The base tile's click-to-PDP
 * behavior is unaffected because the trigger calls stopPropagation().
 *
 * We DO NOT add any data-testid to the base tile's root (prop-spread footgun).
 */
import React from 'react'
import PropTypes from 'prop-types'
import {Box} from '@salesforce/retail-react-app/app/components/shared/ui'
import BaseProductTile, {Skeleton} from '@salesforce/retail-react-app/app/components/product-tile'
import QuickViewTrigger from '../quick-view-modal/trigger'

const ProductTile = ({product, ...rest}) => {
    return (
        <Box position="relative" role="group">
            <BaseProductTile product={product} {...rest} />
            <QuickViewTrigger product={product} />
        </Box>
    )
}

ProductTile.propTypes = {
    product: PropTypes.object
}

// Re-export the Skeleton so PLP pages that import {Skeleton} from 'product-tile'
// continue to work unchanged.
export {Skeleton}
export default ProductTile
