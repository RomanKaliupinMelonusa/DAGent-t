/*
 * ProductTile Override — wraps the base ProductTile with a Quick View
 * overlay bar that slides up on hover (desktop) or is always visible
 * (mobile/tablet). Clicking the bar opens a QuickViewModal.
 *
 * SSR Safety: QuickViewModal is only mounted when isOpen === true,
 * which only happens after a client-side click. This prevents the
 * useProductViewModal / useProduct / useToast hooks from running
 * during server-side rendering for every tile on the PLP.
 */
import React from 'react'
import PropTypes from 'prop-types'
import {Box, useDisclosure} from '@salesforce/retail-react-app/app/components/shared/ui'
import OriginalProductTile from '@salesforce/retail-react-app/app/components/product-tile'

// Lazy-load QuickViewModal — avoids hook execution during SSR entirely.
// React.lazy + Suspense ensures the module (and its hooks) are only evaluated
// when the fallback boundary is hit client-side.
const QuickViewModal = React.lazy(() => import('../quick-view-modal'))

/**
 * Simple eye icon SVG to avoid depending on @chakra-ui/icons during SSR.
 */
const EyeIcon = (props) => (
    <Box as="span" display="inline-flex" mr={2} {...props}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    </Box>
)

/**
 * Enhanced ProductTile with Quick View overlay bar.
 * Wraps the base ProductTile in a group-hover container and adds
 * an absolutely-positioned bar at the bottom of the product image area.
 *
 * NOTE: The PLP passes data-testid="sf-product-tile-{id}" which the base
 * ProductTile spreads onto its Link, overwriting its hardcoded
 * data-testid="product-tile". We add data-testid="product-tile" to
 * our wrapper so E2E selectors like [data-testid="product-tile"] work.
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
        <Box position="relative" role="group" data-testid="product-tile">
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
                            <EyeIcon />
                            Quick View
                        </Box>
                    </Box>

                    {/* Only mount QuickViewModal when opened — prevents SSR hook execution */}
                    {isOpen && (
                        <React.Suspense fallback={null}>
                            <QuickViewModal
                                product={product}
                                isOpen={isOpen}
                                onClose={onClose}
                            />
                        </React.Suspense>
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
