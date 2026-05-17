/*
 * QuickViewTrigger — button overlay rendered on each eligible product tile.
 *
 * SSR-safe via the isMounted pattern: the button renders with stable markup
 * on the server, but onClick is a no-op until after hydration.
 *
 * See contracts/quick-view-trigger.md for the binding surface.
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
        (event) => {
            event.stopPropagation()
            event.preventDefault()
            openQuickView(product)
        },
        [openQuickView, product]
    )

    // Don't render for missing product id
    if (!product?.id && !product?.productId) {
        return null
    }

    // Don't render for sets or bundles (FR-014)
    if (product?.type?.set || product?.type?.bundle) {
        return null
    }

    const productId = product.productId || product.id

    return (
        <Button
            data-testid={`quick-view-trigger-${productId}`}
            type="button"
            aria-haspopup="dialog"
            aria-controls="quick-view-modal"
            aria-label={intl.formatMessage(messages.triggerAriaLabelMobile, {
                productName: product.name || product.productName || ''
            })}
            onClick={mounted ? handleClick : noop}
            size="sm"
            variant="solid"
            bg="white"
            color="gray.800"
            _hover={{bg: 'gray.100'}}
            opacity={{base: 1, lg: 0}}
            _groupHover={{opacity: 1}}
            _focusVisible={{opacity: 1}}
            position="absolute"
            bottom="8px"
            left="50%"
            transform="translateX(-50%)"
            zIndex={1}
            transition="opacity 0.2s"
            boxShadow="md"
        >
            {intl.formatMessage(messages.triggerLabel)}
        </Button>
    )
}

QuickViewTrigger.propTypes = {
    product: PropTypes.object.isRequired
}

export default QuickViewTrigger
