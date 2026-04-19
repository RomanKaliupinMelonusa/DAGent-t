/*
 * ProductTile Override — wraps the base ProductTile with a Quick View
 * overlay bar that slides up on hover (desktop) or is always visible
 * (mobile/tablet). Clicking the bar opens a QuickViewModal.
 */
import React from 'react'
import PropTypes from 'prop-types'
import {Box, useDisclosure} from '@salesforce/retail-react-app/app/components/shared/ui'
import OriginalProductTile from '@salesforce/retail-react-app/app/components/product-tile'
import QuickViewModal from '../quick-view-modal'
import {ViewIcon} from '@chakra-ui/icons'

/**
 * Enhanced ProductTile with Quick View overlay bar.
 * Wraps the base ProductTile in a group-hover container and adds
 * an absolutely-positioned bar at the bottom of the product image area.
 */
const ProductTile = (props) => {
    const {product, ...rest} = props
    const {isOpen, onOpen, onClose} = useDisclosure()

    // Don't show Quick View for sets, bundles, or missing productId
    const isSet = product?.type?.set === true
    const isBundle = product?.type?.bundle === true
    const hasProductId = Boolean(product?.productId)
    const showQuickView = hasProductId && !isSet && !isBundle

    const productName = product?.productName || product?.name || ''

    const handleQuickView = (e) => {
        e.preventDefault()
        e.stopPropagation()
        onOpen()
    }

    return (
        <Box position="relative" role="group">
            <OriginalProductTile product={product} {...rest} />

            {showQuickView && (
                <>
                    {/*
                     * Invisible overlay matching the product image area (1:1 aspect ratio).
                     * The base ProductTile renders a 1:1 AspectRatio for the image, so
                     * paddingBottom="100%" gives us a box with height == width, matching
                     * the image dimensions. overflow="hidden" clips the bar when it slides
                     * below the image edge on desktop.
                     */}
                    <Box
                        position="absolute"
                        top={0}
                        left={0}
                        right={0}
                        pb="100%"
                        overflow="hidden"
                        pointerEvents="none"
                        zIndex={1}
                    >
                        <Box
                            as="button"
                            data-testid="quick-view-btn"
                            aria-label={`Quick View ${productName}`}
                            position="absolute"
                            bottom={0}
                            left={0}
                            right={0}
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
                            pointerEvents="auto"
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
                    </Box>

                    {/* Only mount QuickViewModal when open — prevents
                        useProductViewModal hook from firing during SSR
                        for every tile on the page */}
                    {isOpen && (
                        <QuickViewModal
                            product={product}
                            isOpen={isOpen}
                            onClose={onClose}
                        />
                    )}
                </>
            )}
        </Box>
    )
}

ProductTile.displayName = 'ProductTile'

ProductTile.propTypes = {
    product: PropTypes.shape({
        currency: PropTypes.string,
        image: PropTypes.shape({
            alt: PropTypes.string,
            disBaseLink: PropTypes.string,
            link: PropTypes.string
        }),
        imageGroups: PropTypes.array,
        price: PropTypes.number,
        priceRanges: PropTypes.array,
        tieredPrices: PropTypes.array,
        name: PropTypes.string,
        productName: PropTypes.string,
        productId: PropTypes.string,
        productPromotions: PropTypes.array,
        representedProduct: PropTypes.object,
        hitType: PropTypes.string,
        variationAttributes: PropTypes.array,
        variants: PropTypes.array,
        type: PropTypes.shape({
            set: PropTypes.bool,
            bundle: PropTypes.bool,
            item: PropTypes.bool
        })
    }),
    enableFavourite: PropTypes.bool,
    isFavourite: PropTypes.bool,
    onFavouriteToggle: PropTypes.func,
    imageViewType: PropTypes.string,
    selectableAttributeId: PropTypes.string,
    dynamicImageProps: PropTypes.object,
    badgeDetails: PropTypes.array,
    isRefreshingData: PropTypes.bool
}

export default ProductTile

// Re-export Skeleton from the base component
export {Skeleton} from '@salesforce/retail-react-app/app/components/product-tile'
