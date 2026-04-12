/*
 * ProductTile Override — Wraps the base ProductTile with a Quick View overlay bar.
 *
 * - Adds a full-width semi-transparent overlay bar at the bottom of the product image
 * - On desktop: bar slides up on hover (via _groupHover)
 * - On mobile: bar is always visible
 * - Clicking the bar opens a QuickViewModal with full product details
 * - Sets/bundles and products without productId are excluded from Quick View
 */

import React from 'react'
import PropTypes from 'prop-types'
import {Box, useDisclosure} from '@salesforce/retail-react-app/app/components/shared/ui'
import OriginalProductTile from '@salesforce/retail-react-app/app/components/product-tile'
import QuickViewModal from '../quick-view-modal'
import {ViewIcon} from '@chakra-ui/icons'

const ProductTileWithQuickView = (props) => {
    const {product, ...rest} = props
    const {isOpen, onOpen, onClose} = useDisclosure()

    // Do not render Quick View for sets, bundles, or products without an ID
    const isSet = product?.type?.set === true
    const isBundle = product?.type?.bundle === true
    const hasProductId = !!product?.productId
    const showQuickView = hasProductId && !isSet && !isBundle

    const handleQuickView = (e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpen()
    }

    return (
        <Box position="relative" role="group">
            <Box
                sx={{
                    // Override the image wrapper to clip the sliding bar
                    '& [class*="imageWrapper"], & > a > div:first-of-type': {
                        overflow: 'hidden',
                        position: 'relative'
                    }
                }}
            >
                <OriginalProductTile product={product} {...rest} />
            </Box>

            {showQuickView && (
                <>
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

                    <QuickViewModal
                        product={product}
                        isOpen={isOpen}
                        onClose={onClose}
                    />
                </>
            )}
        </Box>
    )
}

ProductTileWithQuickView.displayName = 'ProductTile'

ProductTileWithQuickView.propTypes = {
    product: PropTypes.shape({
        productId: PropTypes.string,
        productName: PropTypes.string,
        name: PropTypes.string,
        type: PropTypes.shape({
            set: PropTypes.bool,
            bundle: PropTypes.bool,
            item: PropTypes.bool
        })
    }),
    dynamicImageProps: PropTypes.object,
    enableFavourite: PropTypes.bool,
    isFavourite: PropTypes.bool,
    onFavouriteToggle: PropTypes.func,
    imageViewType: PropTypes.string,
    selectableAttributeId: PropTypes.string,
    badgeDetails: PropTypes.array,
    isRefreshingData: PropTypes.bool
}

export default ProductTileWithQuickView

// Re-export Skeleton from the original component
export {Skeleton} from '@salesforce/retail-react-app/app/components/product-tile'
