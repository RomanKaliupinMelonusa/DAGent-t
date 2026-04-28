# Baseline Volatility Tagging

When you emit `console_errors`, `network_failures`, or `uncaught_exceptions` entries in the baseline JSON, **tag known-permanent PWA-Kit platform noise** with two extra fields:

- `volatility: "persistent"` — the entry will not be fixed by this feature.
- `category` — coarse taxonomy used by triage rendering and dashboards.

The triage renderer (`baseline-advisory.ts`) splits persistent entries into a separate **"Permanent platform warnings — DO NOT investigate"** block, and the LLM router emits a hard rule when *all* surviving evidence after baseline subtraction matches persistent patterns. Without these tags the debug agent will chase platform noise that this feature cannot fix.

## Curated allowlist (closed)

Match each entry's `pattern` field against the substrings below. Matching is **case-insensitive substring** — not regex. When a pattern matches, add the listed `volatility` and `category`. The list is **closed**: do not invent new persistent classifications. Propose additions through a PR comment on this fragment.

| # | Pattern substring (case-insensitive) | volatility | category |
|---|---|---|---|
| 1 | `Warning: The result of getServerSnapshot should be cached` | `persistent` | `framework-warning` |
| 2 | `Warning: %s: Support for defaultProps will be removed from function components` | `persistent` | `legacy-deprecation` |
| 3 | `Failed to load resource: net::ERR_NAME_NOT_RESOLVED` **and** the failed request URL contains `c360a.salesforce.com` or `DataCloud` | `persistent` | `network-sandbox` |
| 4 | `retail-react-app.use-datacloud._handleApiError ERROR` | `persistent` | `network-sandbox` |
| 5 | `r: 403 Forbidden` (Einstein recommendations — sandbox returns 403 in dev) | `persistent` | `network-sandbox` |
| 6 | A `Warning:` message that **also** contains `will be removed` **and** `future major release` (React deprecation catch-all) | `persistent` | `legacy-deprecation` |

Rule #3 is **URL-conditional**: only tag when the runtime request URL captured in this session contains one of the listed domain fragments. A bare `ERR_NAME_NOT_RESOLVED` against an unknown host stays untagged.

Rule #6 is **compound**: the message must contain all three substrings — `Warning:`, `will be removed`, *and* `future major release`. A bare `Warning: …` without the deprecation phrasing stays untagged.

## Do NOT tag as persistent

The following classes of entries **must stay untagged** (omit both fields → renderer treats them as transient). These can indicate real regressions and the debug agent must take them seriously:

- `TypeError`, `ReferenceError`, `RangeError`, `SyntaxError`.
- HTTP `5xx` responses from any endpoint.
- Generic `Error:` thrown from feature code paths (anything under `app/`, `overrides/`, `worker/`, `config/`).
- Hydration mismatches (`Text content does not match`, `Hydration failed`).
- Anything not listed in the allowlist above, even if it "looks platform-y."

When in doubt, **omit the fields**. Untagged is the safe default.

## Output shape

Add `volatility` and `category` as siblings of `pattern` / `source_page` / `count` on the same entry object. Example (`console_errors[]`):

```json
{
  "pattern": "Warning: The result of getServerSnapshot should be cached to avoid an infinite loop",
  "source_page": "PLP",
  "count": 1,
  "volatility": "persistent",
  "category": "framework-warning"
}
```

A `network_failures[]` entry tagged via rule #3:

```json
{
  "pattern": "Failed to load resource: net::ERR_NAME_NOT_RESOLVED",
  "source_page": "PLP",
  "count": 2,
  "volatility": "persistent",
  "category": "network-sandbox"
}
```

An untagged entry (no allowlist match — feature regression candidate):

```json
{
  "pattern": "TypeError: Cannot read properties of undefined (reading 'masterId')",
  "source_page": "PLP",
  "count": 1
}
```

## Hard rules

- **Closed allowlist.** Tag only the six patterns above. Anything else → omit both fields.
- **Never tag a regression candidate as persistent.** `TypeError`, `ReferenceError`, HTTP 5xx, and feature-code errors stay untagged regardless of how often they appear in the baseline.
- **Never invent patterns.** Every entry — tagged or not — must have been observed during this Playwright capture session (existing baseline-analyzer rule).
- **Field names are exact.** `volatility` (not `severity` / `kind`) and `category` (not `class` / `type`). The downstream loader rejects unknown fields silently and the renderer will treat the entry as transient.
- **Allowed values only.** `volatility` ∈ `{persistent, transient}`. `category` ∈ `{framework-warning, network-sandbox, legacy-deprecation, app-specific}`. Any other value is rejected.
