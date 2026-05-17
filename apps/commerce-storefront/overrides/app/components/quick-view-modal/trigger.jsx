/*
 * QuickViewTrigger — button overlay rendered inside each product tile.
 *
 * - Returns null for sets/bundles or missing product id.
 * - Uses the isMounted pattern so onClick is inert during SSR/hydration.
 * - Calls event.stopPropagation() to prevent the tile's <Link> from navigating.
 *
 * See: contracts/quick-view-trigger.md
 */
import React, {useState, useEffect, useCallback} from 'react'
import PropTypes from 'prop-types'
import {useIntl} from 'react-intl'
import {Button} from '@salesforce/retail-react-app/app/components/shared/ui'
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

    // Resolve the product id — search hits use `productId`, detail responses use `id`
    const productId = product?.productId || product?.id

    // Exclusion: no product id
    if (!productId) return null

    // Exclusion: sets and bundles (FR-014)
    if (product.type?.set || product.type?.bundle) return null

    return (
        <Button
            type="button"
            data-testid={`quick-view-trigger-${productId}`}
            aria-haspopup="dialog"
            aria-controls="quick-view-modal"
            aria-label={intl.formatMessage(messages.triggerAriaLabelMobile, {
                productName: product.name || product.productName || ''
            })}
            onClick={mounted ? handleClick : noop}
            size="sm"
            variant="solid"
            colorScheme="blue"
            position="absolute"
            bottom="2"
            left="50%"
            transform="translateX(-50%)"
            opacity={{base: 1, lg: 0}}
            _groupHover={{opacity: 1}}
            transition="opacity 0.2s"
            zIndex="1"
        >
            {intl.formatMessage(messages.triggerLabel)}
        </Button>
    )
}

QuickViewTrigger.propTypes = {
    product: PropTypes.shape({
        id: PropTypes.string,
        productId: PropTypes.string,
        name: PropTypes.string,
        type: PropTypes.shape({
            set: PropTypes.bool,
            bundle: PropTypes.bool
        })
    })
}

export default QuickViewTrigger
