/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import React, {useCallback} from 'react'
import PropTypes from 'prop-types'
import {Box, useDisclosure} from '@salesforce/retail-react-app/app/components/shared/ui'
import OriginalProductTile, {
    Skeleton
} from '@salesforce/retail-react-app/app/components/product-tile'
import {ViewIcon} from '@chakra-ui/icons'
import QuickViewModal from '../quick-view-modal'

// Re-export Skeleton so consumers importing {Skeleton} from product-tile still work
export {Skeleton}

/**
 * ProductTile override — wraps the base ProductTile with a Quick View overlay bar
 * that slides up from the bottom of the product image on hover (desktop) or
 * is always visible on mobile.
 */
const ProductTile = ({product, ...props}) => {
    const {isOpen, onOpen, onClose} = useDisclosure()

    const handleQuickView = useCallback(
        (e) => {
            e.preventDefault()
            e.stopPropagation()
            onOpen()
        },
        [onOpen]
    )

    // Do not render Quick View bar for sets, bundles, or missing product data
    const isSet = product?.type?.set === true
    const isBundle = product?.type?.bundle === true
    const hasProductId = !!product?.productId
    const showQuickView = hasProductId && !isSet && !isBundle

    return (
        <>
            <Box position="relative" role="group" data-testid="product-tile-container">
                <Box position="relative" overflow="hidden">
                    <OriginalProductTile product={product} {...props} />
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
            </Box>
            {showQuickView && (
                <QuickViewModal product={product} isOpen={isOpen} onClose={onClose} />
            )}
        </>
    )
}

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
