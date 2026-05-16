/*
 * QuickViewTrigger — the button rendered on each product tile that opens
 * the Quick View modal for that product.
 *
 * Contract: contracts/quick-view-trigger.md
 *
 * SSR-safe via the isMounted pattern: the button renders deterministic
 * markup on the server but the onClick handler is a no-op until the
 * component mounts on the client.
 */
import React, {useState, useEffect, useCallback} from 'react'
import PropTypes from 'prop-types'
import {useIntl} from 'react-intl'
import {Button, useBreakpointValue} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useQuickView} from './context'
import messages from './messages'

const noop = () => {}

const QuickViewTrigger = ({product}) => {
    const intl = useIntl()
    const {openQuickView} = useQuickView()
    const [mounted, setMounted] = useState(false)
    const isMobile = useBreakpointValue({base: true, lg: false})

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

    // Resolve product identifier — SCAPI tiles use `productId`, detail responses use `id`
    const productIdentifier = product?.productId || product?.id

    // Don't render for missing id or set/bundle products (FR-014, SC-008)
    if (!productIdentifier) return null
    if (product.type?.set || product.type?.bundle) return null

    return (
        <Button
            type="button"
            data-testid={`quick-view-trigger-${productIdentifier}`}
            aria-haspopup="dialog"
            aria-controls="quick-view-modal"
            aria-label={
                isMobile
                    ? intl.formatMessage(messages.triggerAriaLabelMobile, {
                          productName: product.name || product.productName || ''
                      })
                    : undefined
            }
            onClick={mounted ? handleClick : noop}
            size="sm"
            variant="solid"
            colorScheme="blue"
            position="absolute"
            bottom={2}
            left="50%"
            transform="translateX(-50%)"
            opacity={{base: 1, lg: 0}}
            _groupHover={{opacity: 1}}
            _groupFocusWithin={{opacity: 1}}
            transition="opacity 0.2s"
            zIndex={1}
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
        productName: PropTypes.string,
        type: PropTypes.shape({
            set: PropTypes.bool,
            bundle: PropTypes.bool
        })
    })
}

export default QuickViewTrigger
