/*
 * QuickViewTrigger — button overlay rendered on each eligible product tile.
 *
 * - Returns null for sets, bundles, or products without an id.
 * - Uses the isMounted pattern so the onClick handler is inert during SSR.
 * - Calls event.stopPropagation() to prevent the tile's PDP link from firing.
 *
 * See contracts/quick-view-trigger.md.
 */
import React, {useState, useEffect, useCallback} from 'react'
import PropTypes from 'prop-types'
import {useIntl} from 'react-intl'
import {Button, Box} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useQuickView} from './context'
import messages from './messages'

const noop = () => {}

const QuickViewTrigger = ({product}) => {
    const intl = useIntl()
    const {openQuickView} = useQuickView()
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    const handleClick = useCallback(
        (e) => {
            e.stopPropagation()
            e.preventDefault()
            openQuickView(product)
        },
        [openQuickView, product]
    )

    // Render nothing for ineligible products
    if (!product?.productId && !product?.id) return null
    if (product?.type?.set || product?.type?.bundle) return null

    const productId = product.productId || product.id

    return (
        <Box
            position="absolute"
            bottom={2}
            left="50%"
            transform="translateX(-50%)"
            zIndex={1}
            opacity={{base: 1, lg: 0}}
            _groupHover={{opacity: 1}}
            transition="opacity 0.2s"
        >
            <Button
                type="button"
                size="sm"
                variant="solid"
                colorScheme="blue"
                data-testid={`quick-view-trigger-${productId}`}
                aria-haspopup="dialog"
                aria-controls="quick-view-modal"
                aria-label={intl.formatMessage(messages.triggerAriaLabelMobile, {
                    productName: product.productName || product.name || ''
                })}
                onClick={mounted ? handleClick : noop}
            >
                {intl.formatMessage(messages.triggerLabel)}
            </Button>
        </Box>
    )
}

QuickViewTrigger.propTypes = {
    product: PropTypes.object.isRequired
}

export default QuickViewTrigger
