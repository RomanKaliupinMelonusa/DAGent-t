# Implementation Plan: PLP Product Quick View Modal

**Branch**: `001-plp-quick-view` | **Date**: 2026-05-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/apps/commerce-storefront/specs/001-plp-quick-view/spec.md`

> **Three sessions, three docs.** This feature is built across three independent agent sessions; each session reads only the files it owns:
>
> | Session | Owns / authors | Reads (input contracts) |
> | --- | --- | --- |
> | **Main development** | this `plan.md` + [tasks.md](tasks.md) (developer task list) + the storefront source code | [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md), and **[contracts/e2e-tests.md](contracts/e2e-tests.md)** as the testid/UX contract it must satisfy |
> | **E2E tests (Playwright via Playwright MCP)** | [e2e-tasks.md](e2e-tasks.md) + `apps/commerce-storefront/e2e/product-quick-view.spec.ts` | [contracts/e2e-tests.md](contracts/e2e-tests.md) (the binding contract) + [contracts/quick-view-trigger.md](contracts/quick-view-trigger.md) and [contracts/quick-view-modal.md](contracts/quick-view-modal.md) for selector reference |
> | **Unit tests (Jest + RTL)** | [unit-tasks.md](unit-tasks.md) + unit test files under `overrides/app/components/quick-view-modal/` | [unit-tests.md](unit-tests.md) (the binding contract) + [contracts/](contracts/) |
>
> The development session **does not author E2E or unit tests**. Its only obligation toward the test sessions is to expose the testids, public surfaces, and behavior contracts those documents enumerate.
>
> **`contracts/e2e-tests.md` is the canonical place** for the E2E flow contract because it is consumed by both the developer (to know what testids to render) and the E2E agent (to know what to assert).

## Summary

Add a Quick View modal triggered from each PLP product tile in the commerce-storefront app. The modal renders the base PWA Kit `ProductView` with `showDeliveryOptions={false}` (Pickup-in-Store / Ship-to-Store deferred), supports variation switching and Add-to-Bag, and on success closes itself and hands off to the existing global `AddToCartModal`. Implementation strategy: **wrap, do not re-implement** — extend the existing `ProductTile` override into a tile wrapper that renders a sibling trigger overlay; mount a Quick View context provider near the app shell; introduce a single shell+body modal pair under `overrides/app/components/quick-view-modal/`. Server rendering stays parity-clean via the documented `isMounted` pattern and `{isOpen && <Modal>}` gating.

## Technical Context

**Language/Version**: JavaScript / JSX, ES2022, Node 18/20/22 (engines pinned in `apps/commerce-storefront/package.json`).

**Primary Dependencies**:
- Salesforce PWA Kit / `@salesforce/retail-react-app` 9.1.1 (extended via the project's `ccExtensibility` overrides directory).
- `@salesforce/commerce-sdk-react` (`useProduct`, `useShopperBasketsV2Mutation as useShopperBasketsMutation`, `useCurrentBasket`).
- `@salesforce/retail-react-app/app/components/product-view`, `.../product-tile`, `.../hooks/use-add-to-cart-modal`, `.../hooks/use-product-view-modal`.
- Chakra UI (PWA Kit's UI primitives — `Modal`, `ModalOverlay`, `ModalContent`, `ModalCloseButton`, `Button`).
- `react-error-boundary` (already part of the PWA Kit dependency graph).
- `react-intl` (i18n; existing translations pipeline in `apps/commerce-storefront/translations/`).

**Storage**: N/A (storefront client; persistence lives in SCAPI/SLAS via the SDK hooks).

**Testing**:
- Development session: no test code authored here. Only ensure DOM testids and public module shapes match the contracts in [contracts/e2e-tests.md](contracts/e2e-tests.md) and [unit-tests.md](unit-tests.md).
- Unit tests (separate session): Jest + React Testing Library (`pwa-kit-dev test`, `apps/commerce-storefront/jest.config.js`).
- E2E tests (separate session): Playwright via **Playwright MCP**, against the local dev server. Existing config at `apps/commerce-storefront/playwright.config.ts` and shared fixture at `apps/commerce-storefront/e2e/fixtures.ts`.

**Target Platform**: Modern desktop and mobile browsers per existing `browserslist` (iOS ≥ 9, Android ≥ 4.4.4, last 4 ChromeAndroid). Storefront ships SSR via PWA Kit `pwa-kit-dev start`.

**Project Type**: SFCC PWA Kit React storefront (`commerce-storefront` workspace under `apps/`), extended via `ccExtensibility.overridesDir = "overrides"`.

**Performance Goals**:
- No additional product-detail fetches at initial PLP server render (FR-015 / SC-004).
- Quick View open → first interactive paint of `ProductView` body within typical SCAPI single-product latency on a warm cache.
- No regression to PLP server render time vs. baseline.

**Constraints**:
- MUST NOT mount a second global `AddToCartModal` — consume the existing one via `useAddToCartModalContext`.
- MUST NOT introduce bespoke `fetch` calls — all data goes through SDK hooks.
- MUST NOT add testids on the base `ProductTile` / `ProductView` root (PWA Kit prop-spread footgun); only on wrapper elements owned by the override.
- MUST NOT pre-fetch product detail for all tiles at page load (mount body only when `isOpen`).
- MUST NOT render any Pickup-in-Store / Ship-to-Store UI inside the Quick View modal (FR-004, SC-006). This is v1's hardest "negative" requirement.
- MUST remain SSR-safe — the trigger renders deterministically server-side, the modal does not.

**Scale/Scope**:
- ~25 product tiles per PLP. Trigger renders once per tile; modal is a singleton at app-shell level.
- Two new override entry points (`product-tile/index.jsx` becomes a wrapper; new `quick-view-modal/` directory with shell, body, provider, trigger).
- New i18n strings: trigger label, modal aria-labelled-by anchor copy, View Full Details, error fallback copy.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution at `apps/commerce-storefront/.specify/memory/constitution.md` is the unfilled template (placeholder principles). With no ratified principles to evaluate against, no gate violations apply. **Status: PASS (no constraints to violate).** Documented here so a later ratification can re-evaluate this plan without rewriting it.

Likely future gates this plan would still satisfy:

- **Reuse-First**: Reuses `ProductView`, `useProductViewModal`, `useShopperBasketsMutation`, `useAddToCartModalContext`, and the existing global `AddToCartModal`. New surfaces are limited to a tile-trigger wrapper, a context provider, and a single modal shell+body pair.
- **SSR Safety**: Trigger uses the `isMounted` pattern; modal contents are gated on `{isOpen && ...}`.
- **Test Discipline**: E2E and unit tests are spec'd in separate documents owned by separate agent sessions, with strict-rule-following and no improvisation.
- **No Architectural Forks**: Plan explicitly rejects cloning `ProductView` or PDP's `handleAddToCart`; it borrows the SDK calls and the modal-context handoff only.

## Project Structure

### Documentation (this feature)

```text
apps/commerce-storefront/specs/001-plp-quick-view/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification
├── unit-tests.md        # Unit test contract (separate Jest session)
├── research.md          # Phase 0 output (this command)
├── data-model.md        # Phase 1 output (this command)
├── quickstart.md        # Phase 1 output (this command)
├── contracts/
│   ├── e2e-tests.md               # E2E test contract (Playwright MCP session) — lives here so dev + E2E sessions both read the same testid contract
│   ├── quick-view-context.md      # Provider / context shape
│   ├── quick-view-trigger.md      # Tile-trigger props + DOM contract
│   └── quick-view-modal.md        # Modal shell+body props + DOM contract
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository)

The feature is delivered exclusively under the PWA Kit overrides directory. No changes outside `apps/commerce-storefront/overrides/app/`.

```text
apps/commerce-storefront/
├── overrides/app/
│   ├── components/
│   │   ├── _app/
│   │   │   └── index.jsx                       # MODIFY: mount <QuickViewProvider> alongside existing providers
│   │   ├── product-tile/
│   │   │   └── index.jsx                       # MODIFY: stop being a transparent re-export; render base tile + sibling QuickViewTrigger overlay
│   │   └── quick-view-modal/                   # NEW directory
│   │       ├── index.jsx                       # NEW: barrel — re-exports provider, hook, shell, trigger
│   │       ├── context.jsx                     # NEW: QuickViewContext + QuickViewProvider + useQuickView()
│   │       ├── trigger.jsx                     # NEW: QuickViewTrigger button (isMounted-gated)
│   │       ├── modal-shell.jsx                 # NEW: gated <Modal> with ErrorBoundary + close handlers
│   │       ├── modal-body.jsx                  # NEW: useProductViewModal + <ProductView showDeliveryOptions={false}/>
│   │       └── messages.js                     # NEW: react-intl defineMessages catalog for this feature
│   └── (no other override touched)
├── e2e/                                        # OWNED BY E2E SESSION — not authored by this plan
│   └── product-quick-view.spec.ts              # (added by the E2E session per contracts/e2e-tests.md)
├── translations/                               # i18n strings auto-extracted by existing build script
└── (no other files touched)
```

**Structure Decision**: PWA Kit storefront with `ccExtensibility` override layout. All new code lives under `overrides/app/components/quick-view-modal/`; the only existing override files modified are `_app/index.jsx` (mount provider) and `product-tile/index.jsx` (wrap to add trigger). Minimizes blast radius and keeps the override surface auditable per the project's reuse posture.

## Phase 0 — Research

See [research.md](research.md). Output captures decisions on:

- Reuse vs. clone of `ProductView` (decision: reuse, with `showDeliveryOptions={false}`).
- Modal shell composition (Chakra `Modal` directly vs. reusing `BonusProductSelectionModal` shell).
- Add-to-Bag orchestration (slim handler reusing `useShopperBasketsMutation` + `useAddToCartModalContext.onOpen`).
- SSR strategy (`isMounted` for trigger, `{isOpen && <Modal>}` for body).
- Set/Bundle exclusion (trigger hidden when `product.type?.set || product.type?.bundle`).
- Variation state ownership (delegate to `useProductViewModal`).
- Test split rationale (development vs. E2E vs. unit, owned by different agent sessions).
- Storefront URL/port resolution (env-var-driven; do NOT hard-code `49968`).
- Why `e2e-tests.md` lives under `contracts/`.

All `NEEDS CLARIFICATION` items resolved.

## Phase 1 — Design & Contracts

### 1. Data model

[data-model.md](data-model.md) documents the runtime entities:
- `QuickViewContextValue` — `{ isOpen, openProduct, openQuickView(product), closeQuickView() }`.
- `ProductSummary` — narrow shape consumed by the trigger.
- Active variation state — owned by `useProductViewModal` / `useDerivedProduct`; not redefined here.

### 2. Contracts

The feature exposes UI / module / E2E contracts (no public HTTP API). Contracts under [contracts/](contracts/):

- [contracts/e2e-tests.md](contracts/e2e-tests.md) — **E2E flow contract** (testids, flows, URL/port resolution rules). Read by both the developer agent (to know what testids to render) and the Playwright MCP agent (to know what to assert).
- [contracts/quick-view-context.md](contracts/quick-view-context.md) — provider exports, hook return shape, lifecycle.
- [contracts/quick-view-trigger.md](contracts/quick-view-trigger.md) — props, DOM testid contract, hover/focus/touch behavior, set/bundle exclusion.
- [contracts/quick-view-modal.md](contracts/quick-view-modal.md) — shell vs. body split, gated mount, ErrorBoundary fallback, accessibility attributes, success/failure handlers.

These contracts are the binding surface for the unit-test and E2E sessions. If the development session needs to deviate, the contracts are updated first.

### 3. Quickstart

[quickstart.md](quickstart.md) — how to run the storefront locally, exercise Quick View end-to-end manually, and how to point the E2E session at the right URL/port.

### 4. Agent context update

The agent context file `.github/copilot-instructions.md` is updated by this command to reference this plan between the SPECKIT markers.

## Re-Evaluated Constitution Check (post-design)

- Constitution still placeholder → still PASS, no violations to track.
- Design adheres to the reuse-first / SSR-safe / no-second-AddToCartModal posture established in Phase 0. No `Complexity Tracking` entries required.

## Phase 2 — Task generation strategy (preview only; tasks.md is produced by `/speckit.tasks`)

The forthcoming `tasks.md` will sequence developer work as:

1. Scaffold `overrides/app/components/quick-view-modal/` with empty exports (provider, context hook, trigger, shell, body, messages).
2. Implement `QuickViewProvider` + `useQuickView` (matches `quick-view-context.md`).
3. Mount provider in `overrides/app/components/_app/index.jsx`.
4. Implement `QuickViewTrigger` (isMounted gating, set/bundle exclusion, testid, aria attrs).
5. Extend `overrides/app/components/product-tile/index.jsx` to render base tile + sibling trigger.
6. Implement `QuickViewModalShell` (gated mount, error boundary, close paths, focus restoration).
7. Implement `QuickViewModalBody` using `useProductViewModal` + `<ProductView showDeliveryOptions={false}>`, slim Add-to-Bag handler, View Full Details link, testids.
8. Add i18n messages and run `npm run build-translations` to update the catalogs.
9. Manual smoke per `quickstart.md`; hand off to the E2E and unit-test agent sessions per their respective `.md` contracts.

## Complexity Tracking

> No constitution violations to justify (constitution is unratified). Table left intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| —         | —          | —                                   |
