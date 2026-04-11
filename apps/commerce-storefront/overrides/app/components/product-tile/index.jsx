/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import React from 'react'
import PropTypes from 'prop-types'
import {
    Box,
    Button,
    useDisclosure
} from '@salesforce/retail-react-app/app/components/shared/ui'
import OriginalProductTile, {
    Skeleton
} from '@salesforce/retail-react-app/app/components/product-tile'
import QuickViewModal from '../quick-view-modal'
import {isQuickViewEligible, getQuickViewAriaLabel} from '../../utils/quick-view'
import {QUICK_VIEW_TEST_IDS} from '../../constants'

/**
 * ProductTile override that wraps the base ProductTile with a Quick View button overlay.
 *
 * On hover (desktop) or always visible (mobile), a "Quick View" button appears over
 * the product image. Clicking it opens a modal with the full ProductView for the item,
 * allowing variant selection and add-to-cart without navigating to the PDP.
 */
const ProductTileWithQuickView = (props) => {
    const {product, ...rest} = props
    const {isOpen, onOpen, onClose} = useDisclosure()

    // If the product is not eligible for Quick View (sets, bundles, missing ID),
    // render the original tile without any overlay or modal.
    if (!isQuickViewEligible(product)) {
        return <OriginalProductTile product={product} {...rest} />
    }

    const handleQuickViewClick = (e) => {
        // Prevent the parent Link from navigating to the PDP
        e.preventDefault()
        e.stopPropagation()
        onOpen()
    }

    return (
        <Box position="relative" role="group">
            <OriginalProductTile product={product} {...rest} />

            {/* Quick View button overlay — hidden by default, visible on hover (desktop)
                or always visible on mobile (base breakpoint) */}
            <Button
                data-testid={QUICK_VIEW_TEST_IDS.BTN}
                aria-label={getQuickViewAriaLabel(product)}
                size="sm"
                colorScheme="blue"
                variant="solid"
                position="absolute"
                bottom="0"
                left="50%"
                transform="translateX(-50%)"
                mb={2}
                zIndex={1}
                opacity={{base: 1, lg: 0}}
                _groupHover={{opacity: 1}}
                transition="opacity 0.2s"
                onClick={handleQuickViewClick}
            >
                Quick View
            </Button>

            {/* QuickViewModal rendered outside the Link to avoid nesting issues */}
            <QuickViewModal
                product={product}
                isOpen={isOpen}
                onClose={onClose}
            />
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

// Re-export Skeleton so consumers importing { Skeleton } from product-tile still work
export {Skeleton}
export default ProductTileWithQuickView
