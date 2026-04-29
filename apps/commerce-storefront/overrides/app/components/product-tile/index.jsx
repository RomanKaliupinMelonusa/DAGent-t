/*
 * ProductTile Override — wraps base ProductTile with a Quick View trigger button.
 * The trigger uses the isMounted pattern per SSR guidelines (§5) — it is absent
 * from server-rendered HTML and appears only after hydration.
 *
 * Desktop: revealed on hover/focus over the tile image area (opacity transition).
 * Mobile: persistently visible compact icon button anchored to the tile image.
 */
import React, {useState, useEffect, useCallback, Suspense, lazy} from 'react'
import PropTypes from 'prop-types'
import {
    Box,
    IconButton,
    useDisclosure,
    useBreakpointValue
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {ViewIcon} from '@chakra-ui/icons'
import BaseProductTile, {
    Skeleton
} from '@salesforce/retail-react-app/app/components/product-tile'

// Lazy-load the Quick View Modal — only fetched on first click (code-splitting)
const QuickViewModal = lazy(() => import('../quick-view-modal'))

/**
 * ProductTile with Quick View trigger overlay.
 */
const ProductTile = ({product, ...rest}) => {
    // isMounted pattern: interactive trigger only renders after hydration (SSR safety §5)
    const [isMounted, setIsMounted] = useState(false)
    useEffect(() => {
        setIsMounted(true)
    }, [])

    const {isOpen, onOpen, onClose} = useDisclosure()

    // On mobile: trigger is always visible. On desktop: revealed on hover via CSS.
    const triggerOpacity = useBreakpointValue({base: 1, md: 0})

    const handleQuickView = useCallback(
        (e) => {
            e.preventDefault()
            e.stopPropagation()
            onOpen()
        },
        [onOpen]
    )

    const productId = product?.productId || product?.id || ''

    return (
        <Box
            position="relative"
            role="group"
        >
            <BaseProductTile product={product} {...rest} />

            {/* Quick View trigger — client-only (isMounted guard).
                Always in DOM after hydration for E2E visibility.
                Desktop: opacity 0 → 1 on group hover via _groupHover.
                Mobile: always opacity 1. */}
            {isMounted && (
                <IconButton
                    data-testid="quick-view-trigger"
                    aria-label="Quick view"
                    icon={<ViewIcon />}
                    size="sm"
                    variant="solid"
                    colorScheme="white"
                    bg="white"
                    color="gray.800"
                    boxShadow="md"
                    borderRadius="full"
                    position="absolute"
                    bottom="50%"
                    left="50%"
                    transform="translateX(-50%)"
                    zIndex={2}
                    onClick={handleQuickView}
                    opacity={triggerOpacity}
                    _groupHover={{opacity: 1}}
                    transition="opacity 0.2s"
                />
            )}

            {/* Quick View Modal — only mounts when open (no SSR, no hook execution per tile) */}
            {isOpen && (
                <Suspense fallback={null}>
                    <QuickViewModal
                        product={product}
                        isOpen={isOpen}
                        onClose={onClose}
                    />
                </Suspense>
            )}
        </Box>
    )
}

ProductTile.propTypes = {
    product: PropTypes.object
}

export default ProductTile
export {Skeleton}
