# Resolving Fixture URLs Against the Running Config (PWA Kit)

The acceptance contract emits `test_fixtures[]` — resolved URLs plus the runtime preconditions each flow depends on. URLs MUST be valid for the running storefront. Inventing a URL by guessing locale / site prefixes wastes a downstream test cycle and will be re-routed back to you (`fixture-validation-failure` → `$SELF`).

## Read the running config BEFORE writing acceptance.yml

Two files are authoritative:

1. `config/default.js` — `app.url.locale`, `app.url.site`, `app.url.showDefaults`.
2. `config/sites.js` — site list and active aliases.

Apply these rules to every candidate URL:

- If `url.locale === 'none'`, **strip locale prefixes** like `/uk/en-GB/` and `/en-US/` from your URLs.
- If `url.site === 'none'`, **strip site prefixes** like `/RefArch/`.
- If `url.locale === 'path'` or `'query'` and `showDefaults: false`, only non-default locales appear in URLs — when targeting the default locale, omit it.
- When in doubt, prefer the path that the user-facing storefront uses today (e.g. `/category/newarrivals` over `/uk/en-GB/category/newarrivals`).

## Cross-reference candidate URLs against the kickoff baseline

`baseline-analyzer` writes `<appRoot>/.dagent/<slug>/_kickoff/baseline.json` (or its node-scope artifact). Before adopting a URL into a fixture:

- The URL MUST NOT appear in `network_failures[].pattern` as a 4xx/5xx.
- The URL MUST NOT appear in any `console_errors[]` whose `volatility: persistent`.
- Prefer URLs that appear in `targets[].url` with no negative signal — those are the pages the analyzer already proved load cleanly.

If no baseline target matches your candidate, declare an `http_status: 200` assertion so the validator can prove the URL is reachable from the analyzer's evidence.

## Declare runtime assertions on each fixture

A fixture is more than a URL: it pins the runtime preconditions the flow depends on. Recognised assertion kinds (closed allow-list — unknown kinds are rejected):

- `http_status` — deterministic; checked against the kickoff baseline.
- `first_tile_swatch_count` — runtime; checked by `e2e-runner`.
- `in_stock` — runtime.
- `product_type` — runtime (`set` / `master` / `variant`).
- `tile_count_min` — runtime.
- `has_variations` — runtime.

Each assertion takes `{ kind, value, comparator? }` where `comparator` is `eq` (default) | `gte` | `lte` | `matches`.

**When a flow depends on data shape, declare it.** A swatch-switching flow needs a multi-color product on the first PLP tile — declare `first_tile_swatch_count: { value: 2, comparator: gte }`. A "click first variant" flow needs a master product — declare `product_type: master`. Without these, downstream agents have no routable name for "this fixture is wrong" and will instead loop on locator tweaks.

## Emit fixtures BEFORE required_flows; reference them by id

```yaml
test_fixtures:
  - id: plp-multi-color
    url: /category/newarrivals
    base_sha: <feature-branch base sha>
    asserted_at: <ISO 8601 UTC>
    asserts:
      - { kind: http_status, value: 200, comparator: eq }
      - { kind: first_tile_swatch_count, value: 2, comparator: gte }

required_flows:
  - name: switch-color-swatch
    description: User picks a different color swatch on the first PLP tile
    fixture: plp-multi-color
    steps:
      - { action: goto, url: /category/newarrivals }
      - { action: click, testid: color-swatch-btn, match: nth, nth: 1 }
      - { action: assert_visible, testid: color-swatch-btn-active, timeout_ms: 10000 }
```

Rules:

- Every fixture id must be unique within the file.
- Every `required_flows[].fixture` must reference a declared id (the schema rejects unknown ids).
- A flow's `steps[].url` SHOULD match `test_fixtures[<that flow's fixture>].url` — they are the same resolved value, declared once in the fixture and re-used in the goto.
- `base_sha` is the HEAD SHA of the feature branch at acceptance-compile time — captured for future drift detection. Use the orchestrator-provided branch SHA, not `git rev-parse HEAD` (you do not run shell commands).

## When re-invoked with a [fixture-validation] error

If your `inputs/triage-handoff.json` contains a `[fixture-validation]`-tagged error, the post-completion validator caught a misconfigured fixture. The handoff lists which fixture id and which assertion failed. Repair by **picking a different fixture** (different product / category / locale) — do NOT retry the same URL. The validator's verdicts are deterministic; the same fixture will fail again.

If the handoff cites a runtime assertion (`first_tile_swatch_count`, `in_stock`, etc.) violated by `e2e-runner` or `qa-adversary` (`test-data` domain), the storefront's data does not match what your fixture promised. Pick a different category / product known to satisfy the assertion, or relax the comparator if the spec genuinely allows it.
