/*
 * i18n message catalog for Quick View Modal feature.
 */
import {defineMessages} from 'react-intl'

const messages = defineMessages({
    triggerLabel: {
        id: 'commerce-storefront.quickView.triggerLabel',
        defaultMessage: 'Quick View'
    },
    triggerAriaLabelMobile: {
        id: 'commerce-storefront.quickView.triggerAriaLabelMobile',
        defaultMessage: 'Quick View for {productName}'
    },
    closeLabel: {
        id: 'commerce-storefront.quickView.closeLabel',
        defaultMessage: 'Close Quick View'
    },
    viewFullDetailsLabel: {
        id: 'commerce-storefront.quickView.viewFullDetailsLabel',
        defaultMessage: 'View Full Details'
    },
    errorFallback: {
        id: 'commerce-storefront.quickView.errorFallback',
        defaultMessage: 'Something went wrong loading this product. Please close and try again.'
    }
})

export default messages
