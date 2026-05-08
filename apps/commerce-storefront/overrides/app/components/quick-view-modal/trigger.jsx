/*
 * QuickViewTrigger — button overlay on product tiles that opens the Quick View modal.
 *
 * Uses the isMounted pattern to prevent interaction before hydration.
 * Hidden for product sets and bundles (FR-014).
 */
import React, {useState, useEffect} from 'react'
import PropTypes from 'prop-types'
import {useIntl} from 'react-intl'
import {IconButton} from '@salesforce/retail-react-app/app/components/shared/ui'
import {VisibilityIcon} from '@salesforce/retail-react-app/app/components/icons'
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

    // PLP search hits usually expose `productId`, while detail responses expose `id`.
    // Normalize so Quick View can be opened from either shape.
    const normalizedProductId = product?.id || product?.productId
    if (!normalizedProductId) return null
    if (product.type?.set || product.type?.bundle) return null

    const handleClick = (event) => {
        event.stopPropagation()
        event.preventDefault()
        openQuickView(product)
    }

    return (
        <IconButton
            data-testid={`quick-view-trigger-${normalizedProductId}`}
            type="button"
            aria-haspopup="dialog"
            aria-controls="quick-view-modal"
            aria-label={intl.formatMessage(messages.triggerAriaLabelMobile, {
                productName: product.name || ''
            })}
            icon={<VisibilityIcon />}
            onClick={mounted ? handleClick : noop}
            size="sm"
            variant="solid"
            colorScheme="white"
            bg="white"
            color="gray.700"
            _hover={{bg: 'gray.100'}}
            borderRadius="full"
            boxShadow="md"
            opacity={{base: 1, lg: 0}}
            _groupHover={{opacity: 1}}
            _focusVisible={{opacity: 1}}
            transition="opacity 0.2s"
            position="absolute"
            bottom={2}
            right={2}
            zIndex={1}
        />
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
