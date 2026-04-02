// =============================================================================
// Integration Tests — Health Check Endpoint (Live Deployed)
// =============================================================================
// Run with: RUN_INTEGRATION=true INTEGRATION_API_BASE_URL=<url> npm run test:integration
//
// Tests the GET /health endpoint against a live Azure Function deployment.
// Validates that STRICT_HEALTH_MODE is injected by CI/CD.
// =============================================================================

const describeIntegration =
  process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;

const BASE_URL = process.env.INTEGRATION_API_BASE_URL ?? "";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  return fetch(url, { ...options });
}

// ---------------------------------------------------------------------------
// fn-health — GET /health
// ---------------------------------------------------------------------------

describeIntegration("fn-health (live)", () => {
  it("returns 200 with status ok and mode from STRICT_HEALTH_MODE", async () => {
    const res = await apiFetch("/health");
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(body.status).toBe("ok");
    expect(body.mode).toBeDefined();

    if (body.mode === "disabled") {
      console.error(
        "STRICT_HEALTH_MODE is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys.",
      );
      fail(
        "STRICT_HEALTH_MODE is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys.",
      );
    }

    expect(body.mode).toBe("true");
  });

  it("returns valid JSON with expected shape", async () => {
    const res = await apiFetch("/health");
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(typeof body.status).toBe("string");
    expect(typeof body.mode).toBe("string");
    // Should only contain these two keys
    expect(Object.keys(body).sort()).toEqual(["mode", "status"]);
  });
});
