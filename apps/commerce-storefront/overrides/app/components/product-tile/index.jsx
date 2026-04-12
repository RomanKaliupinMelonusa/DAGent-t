/*
 * ProductTile Override — wraps the base ProductTile and adds a Quick View button
 * overlay that opens a QuickViewModal on click.
 */
import React from 'react'
import PropTypes from 'prop-types'
import {Box, Button, useDisclosure} from '@salesforce/retail-react-app/app/components/shared/ui'
import OriginalProductTile, {
    Skeleton
} from '@salesforce/retail-react-app/app/components/product-tile'
import QuickViewModal from '../quick-view-modal'

/**
 * Enhanced ProductTile with Quick View support.
 * Wraps the base ProductTile in a group container and overlays a Quick View button
 * that is visible on hover (desktop) or always visible (mobile).
 */
const ProductTileWithQuickView = (props) => {
    const {product, ...rest} = props
    const {isOpen, onOpen, onClose} = useDisclosure()

    // Don't show Quick View for sets, bundles, or missing product data
    const isSet = product?.type?.set === true
    const isBundle = product?.type?.bundle === true
    const hasProductId = Boolean(product?.productId)
    const showQuickView = hasProductId && !isSet && !isBundle

    if (!showQuickView) {
        return <OriginalProductTile product={product} {...rest} />
    }

    const productName = product?.productName || product?.name || ''

    return (
        <Box position="relative" role="group">
            <OriginalProductTile product={product} {...rest} />
            <Button
                data-testid="quick-view-btn"
                aria-label={`Quick View ${productName}`}
                size="sm"
                colorScheme="blue"
                variant="solid"
                position="absolute"
                bottom="0"
                left="50%"
                transform="translateX(-50%)"
                mb={2}
                opacity={{base: 1, lg: 0}}
                _groupHover={{opacity: 1}}
                transition="opacity 0.2s"
                zIndex={1}
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onOpen()
                }}
            >
                Quick View
            </Button>
            <QuickViewModal product={product} isOpen={isOpen} onClose={onClose} />
        </Box>
    )
}

ProductTileWithQuickView.propTypes = {
    product: PropTypes.object,
    dynamicImageProps: PropTypes.object,
    enableFavourite: PropTypes.bool,
    isFavourite: PropTypes.bool,
    onFavouriteToggle: PropTypes.func,
    onClick: PropTypes.func,
    imageViewType: PropTypes.string,
    selectableAttributeId: PropTypes.string,
    badgeDetails: PropTypes.object,
    isRefreshingData: PropTypes.bool
}

export {Skeleton}
export default ProductTileWithQuickView
