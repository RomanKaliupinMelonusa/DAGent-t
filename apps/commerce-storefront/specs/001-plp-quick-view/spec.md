# Feature Specification: PLP Product Quick View Modal

**Feature Branch**: `001-plp-quick-view`
**Created**: 2026-05-06
**Status**: Draft
**Input**: User description: "I want to create a product quick view modal on the plp without ship to store for now. ship to store will be developed later. Add e2e tests as a separate .md file (separate from main development); e2e tests will be developed separately via separate agent session, must use http://localhost:49968/category/womens-clothing-dresses (port could be different — mention this). Also create separate md file for unit tests; unit tests will be created within the separate agentic coding session to avoid hallucination and strict rule following."

## Overview

Add a Quick View affordance to product tiles on the Product List Page (PLP) of the commerce storefront. When triggered, a modal opens that lets a shopper review the product's key details (gallery, price, variation swatches, quantity) and add the item to the bag without leaving the PLP. The Quick View modal **does not** include the Ship-to-Store / Pickup-in-Store option in this iteration; that capability will be developed in a follow-up feature.

After a successful add-to-bag, the Quick View modal closes and the existing global Add-to-Cart confirmation modal (the same surface used from the PDP) takes over so the shopper sees a consistent confirmation experience.

Test artifacts (E2E and unit) are authored as **separate, parallel specifications** in this same feature folder. They are intentionally separated from this development spec so that two distinct downstream agent sessions can implement them in isolation:

- E2E test plan → [apps/commerce-storefront/specs/001-plp-quick-view/contracts/e2e-tests.md](contracts/e2e-tests.md)
- Unit test plan → [apps/commerce-storefront/specs/001-plp-quick-view/unit-tests.md](unit-tests.md)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preview product without leaving the PLP (Priority: P1)

A shopper browsing the women's dresses PLP wants to review a tile's details (larger image, price, available colors/sizes) without losing their place in the product grid. They click the tile's "Quick View" trigger and a modal opens with the product gallery, price, variation swatches, quantity picker, and an Add-to-Bag button. They can dismiss the modal and continue browsing the same scroll position.

**Why this priority**: This is the core value proposition of the feature — letting shoppers triage products faster on the PLP by removing the round-trip to the PDP. Without this, no other story has meaning.

**Independent Test**: Open a PLP, click the Quick View trigger on any in-stock product tile, verify the modal renders the product details, then close it and confirm the PLP scroll position is preserved.

**Acceptance Scenarios**:

1. **Given** a shopper is on a PLP with rendered product tiles, **When** they activate the Quick View trigger on a tile, **Then** a modal opens displaying the product's gallery, name, price, available variation options, and quantity picker — without navigating away from the PLP.
2. **Given** the Quick View modal is open, **When** the shopper closes it via the close button, the overlay click, or the `Escape` key, **Then** the modal closes and keyboard focus returns to the trigger that opened it.
3. **Given** the Quick View modal is open on a product with multiple color/size options, **When** the shopper selects a different variation, **Then** the displayed image, price, and availability update to reflect the chosen variation.

---

### User Story 2 - Add to bag from Quick View (Priority: P1)

A shopper using Quick View has selected the variation and quantity they want and wants to add it to their bag. They click "Add to Bag" inside the modal. On success, the Quick View modal closes and the standard add-to-cart confirmation modal appears showing the item that was added, just like it does from the PDP.

**Why this priority**: Adding to bag is the primary conversion event of the feature; previewing without the ability to act has limited value.

**Independent Test**: Open Quick View on a tile that has at least one valid in-stock variation, choose a complete variation, click Add to Bag, and verify the item is added to the basket and the standard add-to-cart confirmation modal appears.

**Acceptance Scenarios**:

1. **Given** a complete, in-stock variation is selected in Quick View, **When** the shopper clicks Add to Bag, **Then** the item is added to the basket, the Quick View modal closes, and the standard add-to-cart confirmation modal appears with the added item.
2. **Given** the shopper is anonymous and no basket exists yet, **When** they click Add to Bag, **Then** a basket is created and the item is added in a single shopper-facing action (no extra prompts).
3. **Given** the add-to-bag request fails (network or server error), **When** the failure occurs, **Then** the Quick View modal stays open, an inline error message is shown, and the shopper can retry.

---

### User Story 3 - Avoid invalid add-to-bag attempts (Priority: P2)

A shopper opens Quick View on a product where they have not yet picked a complete variation, or the variation they chose is out of stock. The Add-to-Bag button is disabled and a clear inventory/availability message explains why, preventing wasted clicks and confusing errors.

**Why this priority**: Protects shoppers from confusing failure paths once the core flow exists; not strictly required for an MVP but expected for production quality.

**Independent Test**: Open Quick View on a master product, confirm Add to Bag is disabled until a complete variation is chosen; pick an out-of-stock variation and confirm the button remains disabled with the unavailability message.

**Acceptance Scenarios**:

1. **Given** Quick View is open on a master product with variation options not yet fully selected, **When** the modal renders, **Then** the Add-to-Bag button is disabled.
2. **Given** the shopper selects an out-of-stock or non-orderable variation, **When** that variation becomes active, **Then** the Add-to-Bag button is disabled and an availability/inventory message is visible inside the modal.
3. **Given** the shopper completes the variation selection with an in-stock variant, **When** the selection becomes valid, **Then** the Add-to-Bag button becomes enabled.

---

### User Story 4 - Continue to PDP when Quick View isn't enough (Priority: P3)

A shopper using Quick View wants more detail (full description, recommendations, reviews, etc.) than the modal exposes. They click a "View Full Details" link in the modal and are navigated to the product detail page in the same way as clicking the tile image.

**Why this priority**: Useful escape hatch but not required to deliver the primary value of Quick View.

**Independent Test**: Open Quick View on any tile, click "View Full Details", and confirm navigation to the corresponding PDP.

**Acceptance Scenarios**:

1. **Given** Quick View is open on a product, **When** the shopper clicks "View Full Details", **Then** they navigate to that product's PDP and the modal closes.

---

### Edge Cases

- **Set / Bundle products**: For the first iteration, Quick View does not handle product sets/bundles. The trigger is hidden (or replaced with a direct link) on such tiles so shoppers click through to the PDP instead.
- **Master product with no variation pre-selected**: Add-to-Bag is disabled until a complete, valid variation is chosen.
- **Out-of-stock variant**: Add-to-Bag is disabled and an inventory/availability message renders inside the modal.
- **Network failure on add-to-bag**: The modal stays open, an inline error appears, and the shopper can retry.
- **Detail fetch failure**: The modal renders an error fallback inside its body without crashing the PLP route.
- **Server-rendered first paint**: The trigger and modal must not break server rendering — the modal does not pre-fetch or pre-render product details for every tile during initial PLP load.
- **Anonymous and registered shoppers**: Both are supported; basket creation is automatic for guests.
- **Tile click behavior unchanged**: Clicking the tile image or title still navigates to the PDP. The Quick View trigger does not interfere with that navigation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST surface a Quick View trigger on every applicable product tile on the PLP.
- **FR-002**: On desktop pointer devices, the Quick View trigger MAY be revealed on hover/focus over the tile image; on touch/mobile devices, the trigger MUST be persistently visible (does not depend on hover).
- **FR-003**: Activating the Quick View trigger MUST open a modal containing, at minimum: product image gallery, product name, price, variation selectors (color/size/etc., as applicable), quantity picker, an Add-to-Bag primary action, and a "View Full Details" navigation link.
- **FR-004**: The Quick View modal MUST NOT include any Ship-to-Store / Pickup-in-Store / pickup delivery options or related UI in this feature iteration.
- **FR-005**: Selecting a different variation inside the Quick View modal MUST update the displayed image, price, and availability without closing the modal.
- **FR-006**: Clicking Add-to-Bag inside the Quick View modal MUST add the selected product/variation/quantity to the shopper's current basket; if no basket exists, one MUST be created automatically (supporting both anonymous and registered shoppers).
- **FR-007**: On successful add-to-bag from Quick View, the Quick View modal MUST close and the existing global add-to-cart confirmation modal MUST open showing the just-added item(s), matching the PDP confirmation experience.
- **FR-008**: On a failed add-to-bag, the Quick View modal MUST remain open and surface an inline error message that allows the shopper to retry.
- **FR-009**: The Add-to-Bag button MUST be disabled when the active selection is incomplete (e.g., master product with unselected variation) or unavailable (e.g., out-of-stock or non-orderable variant), and an availability/inventory message MUST be visible in those cases.
- **FR-010**: The Quick View modal MUST be dismissable via a visible close control, clicking the overlay, and pressing `Escape`.
- **FR-011**: When the Quick View modal closes, keyboard focus MUST return to the trigger element that opened it.
- **FR-012**: The Quick View modal MUST trap keyboard focus while open and expose accessible labelling (`aria-labelledby` referencing the product heading; trigger announces it controls a dialog).
- **FR-013**: The Quick View trigger MUST NOT navigate away from the PLP; clicking the tile's image or title MUST continue to navigate to the PDP unchanged.
- **FR-014**: On product tiles representing product sets or bundles, the system MUST NOT open Quick View; either the trigger is hidden or replaced with a link to the PDP. (Sets/bundles are deferred to a future iteration.)
- **FR-015**: The Quick View trigger and modal MUST be safe to render through server rendering; the modal MUST NOT trigger product detail fetches during the initial PLP server render.
- **FR-016**: All user-visible strings in the Quick View trigger and modal MUST be localizable through the existing translation pipeline.
- **FR-017**: The Quick View "View Full Details" link MUST navigate the shopper to the product's PDP and close the modal.
- **FR-018**: A failure to fetch product details inside the Quick View modal MUST surface a contained error state inside the modal body without crashing the PLP route.
- **FR-019**: The Quick View modal MUST be visually responsive: a centered dialog on desktop and a full-height sheet/drawer presentation on mobile viewports.
- **FR-020**: The feature MUST ship with a separate E2E test specification document and a separate unit test specification document (linked from this spec) so test work can be executed by distinct downstream agent sessions.

### Key Entities

- **Product Tile**: A representation of a product on the PLP. Owns identity (product id), summary fields (name, price, image, swatches), and now hosts the Quick View trigger.
- **Quick View Session State**: The transient UI state of the Quick View experience — which product (if any) is currently open, modal open/closed flag, and the active variation selection inside the modal.
- **Basket / Basket Line Item**: The shopper's current basket and the line items added through the Quick View add-to-bag action. Existing entity — Quick View only contributes line items; it does not redefine the basket model.
- **Add-to-Cart Confirmation Surface**: The existing global modal that displays just-added line items after a successful add. Quick View consumes this surface; it does not introduce a parallel one.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper can open the Quick View modal, select a valid variation, and add to bag in under 15 seconds from the PLP, without any full-page navigation.
- **SC-002**: At least 95% of Quick View add-to-bag attempts on valid in-stock variations result in the item appearing in the basket and the standard add-to-cart confirmation modal opening.
- **SC-003**: Quick View additions do not increase the rate of basket-related errors (4xx/5xx on basket endpoints) compared to the baseline PDP add-to-bag rate.
- **SC-004**: Initial PLP server render performance does not regress measurably (no additional product-detail fetches per tile at initial render; identical server-rendered HTML for the tile region pre- and post-feature).
- **SC-005**: 100% of Quick View modal interactions are operable from the keyboard alone: trigger activation, variation selection, quantity change, add-to-bag, and dismissal.
- **SC-006**: 0 instances of the Pickup-in-Store / Ship-to-Store UI render inside the Quick View modal in any tested scenario for this iteration.
- **SC-007**: Closing the Quick View modal returns keyboard focus to the originating trigger in 100% of dismiss paths (button, overlay click, `Escape`).
- **SC-008**: When a tile represents a product set or bundle, the Quick View modal MUST NOT open in 100% of attempts (trigger hidden or replaced with PDP link).

## Assumptions

- Quick View is scoped to **simple products and master/variant products** in this iteration. Product sets and bundles are explicitly deferred and excluded.
- The existing global add-to-cart confirmation modal (used by the PDP) is reused as-is for the Quick View success path. No alternate confirmation surface is introduced.
- The PLP tile's existing click target (image / title) continues to navigate to the PDP. Quick View is an additional affordance, not a replacement.
- The current locale/i18n pipeline is reused for any new copy; no new translation infrastructure is introduced.
- The feature targets the same set of supported browsers and devices the storefront already supports; no new device-specific support requirements are assumed.
- Authentication state (anonymous / registered) is handled by the existing basket-creation flow; Quick View does not introduce new auth behavior.
- E2E and unit test specifications are authored separately (see linked documents) and will be implemented by distinct agent sessions to keep behavior, E2E, and unit-test concerns isolated and to reduce hallucination risk.
- The local development storefront's port may vary between environments; downstream test specs MUST treat the URL host:port as configurable rather than hard-coded, while still documenting a default.

## Out of Scope

- Ship-to-Store / Pickup-in-Store delivery options inside the Quick View modal (deferred to a later feature).
- Product Sets and Bundles inside the Quick View modal (deferred).
- Wishlist / favourite toggle inside the Quick View modal.
- Recommended-products carousel inside the Quick View modal.
- Bonus product selection inside the Quick View modal.
- Analytics / Einstein "view product" tracking on Quick View open.
- Implementation of E2E and unit tests (only their specifications are produced by this feature; the tests themselves are implemented in separate downstream agent sessions per the linked test specs).

## Dependencies

- Existing PLP and product tile components on the storefront.
- Existing global add-to-cart confirmation modal infrastructure used by the PDP.
- Existing basket / add-to-basket capabilities used by the PDP add-to-bag flow.
- Existing i18n / translation pipeline.
- Existing storefront-level error boundary / error fallback conventions.
