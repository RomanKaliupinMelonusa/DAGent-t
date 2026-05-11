/*
 * i18n message descriptors for the Quick View feature.
 */
import {defineMessages} from 'react-intl'

const messages = defineMessages({
    triggerLabel: {
        id: 'commerce-storefront.quickView.triggerLabel',
        defaultMessage: 'Quick View'
    },
    triggerAriaLabelMobile: {
        id: 'commerce-storefront.quickView.triggerAriaLabelMobile',
        defaultMessage: 'Quick view {productName}'
    },
    closeLabel: {
        id: 'commerce-storefront.quickView.closeLabel',
        defaultMessage: 'Close quick view'
    },
    viewFullDetailsLabel: {
        id: 'commerce-storefront.quickView.viewFullDetailsLabel',
        defaultMessage: 'View Full Details'
    },
    errorFallback: {
        id: 'commerce-storefront.quickView.errorFallback',
        defaultMessage: 'Unable to load product details. Please try again.'
    }
})

export default messages
