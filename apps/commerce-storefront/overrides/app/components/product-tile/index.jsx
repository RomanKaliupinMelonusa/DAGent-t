/*
 * ProductTile Override — Adds Quick View overlay bar to the base ProductTile.
 *
 * Wraps the base ProductTile in a group container and adds a full-width
 * semi-transparent overlay bar at the bottom of the product image area.
 * Clicking the bar opens a QuickViewModal with full product details.
 */

import React from 'react'
import PropTypes from 'prop-types'
import {Box, useDisclosure} from '@salesforce/retail-react-app/app/components/shared/ui'
import {ViewIcon} from '@chakra-ui/icons'
import OriginalProductTile, {
    Skeleton
} from '@salesforce/retail-react-app/app/components/product-tile'
import QuickViewModal from '../quick-view-modal'

// Re-export the Skeleton so PLP pages that import { Skeleton } still work
export {Skeleton}

/**
 * Enhanced ProductTile with Quick View overlay bar.
 * The overlay bar slides up from the bottom of the product image on hover (desktop)
 * and is always visible on mobile/tablet viewports.
 */
const ProductTile = (props) => {
    const {product, ...rest} = props
    const {isOpen, onOpen, onClose} = useDisclosure()

    // Don't render Quick View for product sets, bundles, or missing productId
    const isSet = product?.type?.set === true
    const isBundle = product?.type?.bundle === true
    const hasProductId = Boolean(product?.productId)
    const showQuickView = hasProductId && !isSet && !isBundle

    const handleQuickView = (e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpen()
    }

    return (
        <Box position="relative" role="group">
            <Box overflow="hidden" position="relative" css={{'& a': {display: 'block'}}}>
                <OriginalProductTile product={product} {...rest} />
                {showQuickView && (
                    <Box
                        as="button"
                        data-testid="quick-view-btn"
                        aria-label={`Quick View ${product?.productName || product?.name || ''}`}
                        position="absolute"
                        bottom="0"
                        left="0"
                        right="0"
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                        py={2}
                        bg="rgba(0, 0, 0, 0.6)"
                        backdropFilter="blur(2px)"
                        color="white"
                        fontSize="sm"
                        fontWeight="semibold"
                        cursor="pointer"
                        zIndex={1}
                        opacity={{base: 1, lg: 0}}
                        transform={{base: 'translateY(0)', lg: 'translateY(100%)'}}
                        _groupHover={{opacity: 1, transform: 'translateY(0)'}}
                        _focus={{
                            opacity: 1,
                            transform: 'translateY(0)',
                            outline: '2px solid',
                            outlineColor: 'blue.300'
                        }}
                        _active={{bg: 'rgba(0, 0, 0, 0.75)'}}
                        transition="all 0.25s ease-in-out"
                        onClick={handleQuickView}
                    >
                        <ViewIcon mr={2} />
                        Quick View
                    </Box>
                )}
            </Box>
            {showQuickView && (
                <QuickViewModal product={product} isOpen={isOpen} onClose={onClose} />
            )}
        </Box>
    )
}

ProductTile.displayName = 'ProductTile'

ProductTile.propTypes = {
    product: PropTypes.object,
    dynamicImageProps: PropTypes.object,
    enableFavourite: PropTypes.bool,
    isFavourite: PropTypes.bool,
    onFavouriteToggle: PropTypes.func,
    onClick: PropTypes.func,
    imageViewType: PropTypes.string,
    selectableAttributeId: PropTypes.string,
    badgeDetails: PropTypes.array,
    isRefreshingData: PropTypes.bool
}

export default ProductTile
