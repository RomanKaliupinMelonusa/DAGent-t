# Phase 0 — Research: PLP Product Quick View Modal

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)
**Branch**: `001-plp-quick-view` | **Date**: 2026-05-06

This document resolves all `NEEDS CLARIFICATION` items implied by the spec and records the decisions the implementation will follow. Each entry uses the standard `Decision / Rationale / Alternatives considered` format.

---

## R-001: Reuse `ProductView` vs. clone a slim Quick-View body

- **Decision**: Reuse the base PWA Kit `ProductView` component (`@salesforce/retail-react-app/app/components/product-view`) directly, passed through `<ProductView showDeliveryOptions={false} showImageGallery imageSize="md" addToCart={...} category={undefined} />`.
- **Rationale**: `ProductView` already encapsulates ~1000 lines of swatch interaction, quantity picker, inventory messaging, master/variant flows, error toasts, and accessibility. `showDeliveryOptions={false}` is the documented prop-level kill-switch that excludes the entire pickup/delivery `RadioGroup`, satisfying FR-004 cleanly without forking the component.
- **Alternatives considered**:
  - *Clone a Quick-View-only product body.* Rejected: duplicates large surface area, drifts under upstream PWA Kit updates, doubles maintenance.
  - *Hide pickup UI via CSS overrides.* Rejected: brittle, leaks DOM, fails the negative E2E flow that asserts no pickup testids are rendered.

## R-002: Add-to-Bag orchestration

- **Decision**: Implement a slim `addToCart` handler inside the modal body that (a) reads `useCurrentBasket()`, (b) calls `useShopperBasketsV2Mutation('createBasket')` if no basket id, (c) calls `useShopperBasketsV2Mutation('addItemToBasket')` with the selected variant id and quantity, (d) on success calls `closeQuickView()` then `addToCartModalContext.onOpen({product, itemsAdded, selectedQuantity})`, (e) on failure surfaces the inline error via `useToast` (already wired by base `ProductView`) and leaves the modal open.
- **Rationale**: This mirrors the SDK-level recipe used by the PDP without entangling the PDP's `handleAddToCart` (which also handles pickup-in-store, multiship, Einstein, and product sets — all out of scope). Keeps the surface area inspectable and unit-testable.
- **Alternatives considered**:
  - *Reuse PDP's `handleAddToCart` directly.* Rejected: drags in pickup-in-store and product-set logic that contradicts FR-004 / FR-014.
  - *Implement raw `fetch` calls.* Rejected: bypasses the SDK's cache invalidation that drives the global `AddToCartModal`'s read of `useCurrentBasket`.

## R-003: Add-to-Cart confirmation surface (post-success)

- **Decision**: Consume the existing app-shell-mounted `<AddToCartModal>` via `useAddToCartModalContext().onOpen({product, itemsAdded, selectedQuantity})`. Do **not** mount a second `AddToCartModal` inside this feature.
- **Rationale**: PWA Kit's `AddToCartModalProvider` is already mounted near the root by `_app`. Consuming the same surface gives shoppers parity with PDP and avoids competing portals.

## R-004: Modal shell composition

- **Decision**: Compose Chakra `Modal` + `ModalOverlay` + `ModalContent` + `ModalCloseButton` directly inside `overrides/app/components/quick-view-modal/modal-shell.jsx`. Use responsive `size`: `full` on base, `5xl` on `lg`. Children are gated on `isOpen` so the body never mounts during SSR. Wrap the body in `react-error-boundary`'s `ErrorBoundary` with a fallback element exposing `data-testid="quick-view-modal-error"`.
- **Rationale**: A direct Chakra composition is the lightest abstraction and gives full control over `aria-labelledby`, focus trap, and close paths.
- **Alternatives considered**:
  - *Reuse `BonusProductSelectionModal` shell.* Rejected: bakes in bonus-product layout structure.
  - *Build a custom dialog from scratch.* Rejected: would re-implement focus trap and overlay semantics that Chakra already provides.

## R-005: SSR / hydration strategy

- **Decision**:
  - Trigger button uses the `isMounted` pattern: `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])`. The trigger renders SSR-deterministic markup (a `<button>` with stable text) but `onClick` is a no-op until `mounted === true`. Modal `isOpen` is seeded `false` on the client so SSR HTML is identical pre- and post-hydration.
  - Modal contents are wrapped in `{isOpen && <ModalShell>}` so `useProduct` / `useProductViewModal` never run for 25 tiles during SSR.
- **Rationale**: Avoids hydration mismatches and avoids per-tile detail fetches at first paint (FR-015 / SC-004).

## R-006: Variation state ownership

- **Decision**: Delegate to `useProductViewModal(initialProduct, controlledVariationValues)` (from `@salesforce/retail-react-app/app/hooks/use-product-view-modal`). Pass the resulting `product` and helpers into `<ProductView>`.
- **Rationale**: This hook already merges initial PLP-tile data with the SCAPI detail response and handles error toasts; re-orchestrating `useProduct` + `useVariant` by hand would duplicate logic and risk drift.

## R-007: Set / Bundle exclusion

- **Decision**: Hide the Quick View trigger entirely when `product.type?.set === true` or `product.type?.bundle === true`. The base tile's PDP link continues to work, so set/bundle shoppers reach the PDP unchanged. (FR-014; SC-008.)
- **Rationale**: Set/bundle UIs introduce additional flows (master+children, bundle child-selection) explicitly out of scope for v1. Hiding the trigger is a one-line predicate and avoids any partial UX.

## R-008: i18n strategy

- **Decision**: All user-visible strings live in a feature-local `messages.js` using `react-intl`'s `defineMessages`. Strings: trigger label (visible), trigger `aria-label` (icon variant on mobile), modal close label, "View Full Details" link text, modal error fallback copy. Existing `npm run build-translations` extracts them into the per-locale JSON files under `apps/commerce-storefront/translations/`.
- **Rationale**: Conforms to existing PWA Kit i18n contract (FR-016) and the project's existing translation pipeline.

## R-009: Accessibility behaviors

- **Decision**:
  - Trigger: `aria-haspopup="dialog"`, `aria-controls={modalId}`, visible label on desktop and `aria-label` on the mobile icon variant.
  - Modal: `aria-labelledby={productHeadingId}` (the heading rendered by the modal body), Chakra default focus trap on, `returnFocusOnClose` true, dismiss via close button / overlay click / `Escape` (Chakra defaults already cover all three).
  - Focus restoration is delegated to Chakra `Modal`'s default `returnFocusOnClose` behavior; no custom `useRef` plumbing required for the trigger element because Chakra captures the active element on open.
- **Rationale**: Meets FR-010 / FR-011 / FR-012 with the lowest custom-code surface.

## R-010: Test split & ownership

- **Decision**: Three `.md` documents in this feature folder; three different agent sessions own them.

  | Document | Owner session | Tooling |
  | --- | --- | --- |
  | `plan.md` (this file) + `tasks.md` | Main development session | (no tests authored here) |
  | `contracts/e2e-tests.md` | E2E session | Playwright via Playwright MCP |
  | `unit-tests.md` | Unit-test session | Jest + React Testing Library |

- **Rationale**: User explicitly requested separation to reduce hallucination and to allow Playwright MCP to drive E2E without context bleed from production code authoring.

## R-011: Why `e2e-tests.md` lives under `contracts/`

- **Decision**: Place the E2E flow document at `contracts/e2e-tests.md` rather than at the spec root.
- **Rationale**: The E2E document is **dual-consumed** — the developer session reads it to know which testids and DOM affordances to expose; the E2E agent reads it to know what to assert. Placing it under `contracts/` puts it next to the other binding contracts (`quick-view-trigger.md`, `quick-view-modal.md`, `quick-view-context.md`) and signals to both downstream sessions that it is the authoritative testid + flow specification.
- **Alternatives considered**:
  - *Keep at the spec root.* Rejected: developer session might read it as "test material to skip" rather than as a contract it must satisfy.
  - *Duplicate it under `contracts/`.* Rejected: two sources of truth invite drift.

## R-012: Testid contract (single source of truth)

- **Decision**: The development session emits exactly these new testids (no aliases, no synonyms):
  - `quick-view-trigger-{productId}` (one per eligible tile)
  - `quick-view-modal` (one when open)
  - `quick-view-modal-error` (one when error)
  - `quick-view-add-to-cart-btn` (one when modal open)
  - `quick-view-view-full-details-link` (one when modal open)

  Existing testids reused unchanged: `sf-product-tile-{productId}`, `product-view`, `add-to-cart-modal`, `product-added`, `inventory-message`.
- **Rationale**: Single contract referenced by `contracts/e2e-tests.md` and `unit-tests.md`. New testids only on wrapper elements owned by overrides — never on base-component roots (avoids the prop-spread footgun called out by the upstream PWA Kit override guidelines).

## R-013: Storefront URL / port for E2E

- **Decision**: E2E session resolves the storefront base URL in this priority order: (1) `STOREFRONT_URL` env var; (2) `playwright.config.ts` `webServer` resolution. The default category path is `/category/womens-clothing-dresses`. The example port `49968` documented in the user's request is **not stable** and MUST NOT be hard-coded.
- **Rationale**: The dev server picks an available port; in CI and on other developer machines the port differs.

## R-014: Console-error budget

- **Decision**: Every E2E flow asserts a finite mechanically-derived console-error budget (zero unless a known framework warning is explicitly tolerated). Unit tests rely on the project's existing Jest config to fail on `console.error` leaks beyond the existing baseline.
- **Rationale**: Catches regressions where Quick View logs hydration warnings or unhandled rejections that would otherwise slip past green E2E assertions.

---

## Resolution status

| NEEDS CLARIFICATION (implied) | Resolved by |
| --- | --- |
| Which delivery options to suppress, and how? | R-001 |
| How to add to bag without recreating PDP logic? | R-002 |
| Where does the post-add confirmation live? | R-003 |
| What kind of modal shell? | R-004 |
| How to keep SSR clean for 25 tiles? | R-005 |
| Who owns variation state? | R-006 |
| How to handle product sets/bundles? | R-007 |
| How are strings localized? | R-008 |
| Accessibility expectations? | R-009 |
| Why split into three .md files? | R-010 |
| Why does `e2e-tests.md` live under contracts/? | R-011 |
| What testids are part of the contract? | R-012 |
| What URL/port for E2E? | R-013 |
| What console-error budget? | R-014 |

All items resolved. Plan may proceed to Phase 1.
