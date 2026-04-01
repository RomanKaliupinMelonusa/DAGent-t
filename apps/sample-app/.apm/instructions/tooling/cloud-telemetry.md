## Cloud Telemetry (Application Insights)

When any HTTP call returns a **5xx status** or a Playwright/Jest assertion fails
because the API returned an error, query Application Insights for the server-side
stack trace before reporting failure. HTTP 500 response bodies are intentionally
opaque — App Insights has the real exception with file names and line numbers.

**Prerequisite:** You must already be authenticated via `az login`.

### Setup (run once per session)

```bash
az extension add --name application-insights --yes 2>/dev/null
```

### When to query

| Agent | Trigger |
|---|---|
| `integration-test` | Any `curl`/test request returns HTTP 5xx |
| `live-ui` | Playwright test fails AND the failure relates to an API call (error banner, missing data, network error) |

**Do NOT query** for pure UI assertion failures (wrong text, missing element) that
have no backend component.

### Ingestion delay

App Insights has a 2-5 minute ingestion lag. **Wait 30 seconds** after observing the
error, then query. If results are empty, retry once after another 30 seconds. If still
empty, report the failure without telemetry — do not loop.

### Fetch exceptions (primary query)

```bash
# TODO: Replace YOUR-APP-INSIGHTS and YOUR-RESOURCE-GROUP with values from apm.yml config.environment
az monitor app-insights query \
  --app YOUR-APP-INSIGHTS \
  --resource-group YOUR-RESOURCE-GROUP \
  --analytics-query "exceptions | where timestamp > ago(15m) | project timestamp, problemId, outerMessage, innermostMessage | order by timestamp desc | take 5" \
  --output table
```

### Fetch failed requests (if exceptions is empty)

```bash
az monitor app-insights query \
  --app YOUR-APP-INSIGHTS \
  --resource-group YOUR-RESOURCE-GROUP \
  --analytics-query "requests | where timestamp > ago(15m) and resultCode startswith '5' | project timestamp, name, resultCode, duration, url | order by timestamp desc | take 5" \
  --output table
```

### Fetch error traces (last resort)

```bash
az monitor app-insights query \
  --app YOUR-APP-INSIGHTS \
  --resource-group YOUR-RESOURCE-GROUP \
  --analytics-query "traces | where timestamp > ago(15m) and severityLevel >= 3 | project timestamp, message, severityLevel | order by timestamp desc | take 5" \
  --output table
```

### How to use

1. Observe a 5xx or API-related test failure -> wait 30s -> run **exceptions** query.
2. If empty, try **failed requests**, then **error traces**. Max 2 retries total.
3. **Append** the top result(s) to your `pipeline:fail` message.
   Example: `npm run pipeline:fail "<slug>" "<item>" "500 on POST /api/endpoint — AppInsights: NullReferenceError in service.ts:42 ..."`.
4. This telemetry flows automatically to redevelopment agents via the orchestrator's
   downstream failure context injection — giving the dev agent the actual cloud stack trace.
