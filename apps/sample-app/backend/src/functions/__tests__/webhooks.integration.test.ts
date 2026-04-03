// =============================================================================
// Integration Tests — Webhook Dispatcher (Live Deployed Endpoints)
// =============================================================================
// Run with: RUN_INTEGRATION=true INTEGRATION_API_BASE_URL=<url> npm run test:integration
// These tests hit real Azure Function endpoints and require:
//   - INTEGRATION_API_BASE_URL: e.g. https://func-sample-app-001.azurewebsites.net/api
//   - INTEGRATION_FUNCTION_KEY: Azure Function host key for authLevel:"function"
// =============================================================================

const describeIntegration =
  process.env.RUN_INTEGRATION === "true" ? describe : describe.skip;

const BASE_URL = process.env.INTEGRATION_API_BASE_URL ?? "";
const FUNC_KEY = process.env.INTEGRATION_FUNCTION_KEY ?? "";

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
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (FUNC_KEY) {
    headers["x-functions-key"] = FUNC_KEY;
  }
  return fetch(url, { ...options, headers });
}

// ---------------------------------------------------------------------------
// GET /api/webhooks
// ---------------------------------------------------------------------------

describeIntegration("fn-webhooks GET (live)", () => {
  it("returns 200 with webhooks array", async () => {
    const res = await apiFetch("/webhooks");
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(body.webhooks).toBeDefined();
    expect(Array.isArray(body.webhooks)).toBe(true);
  });

  it("returns 401 when function key is missing", async () => {
    const url = `${BASE_URL}/webhooks`;
    const res = await fetch(url);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/webhooks
// ---------------------------------------------------------------------------

describeIntegration("fn-webhooks POST (live)", () => {
  it("returns 201 with valid payload", async () => {
    const res = await apiFetch("/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/integration-test-hook",
        workspaceId: "ws-integration-test",
      }),
    });
    expect(res.status).toBe(201);

    const body: Json = await res.json();
    expect(body.id).toBeDefined();
    expect(body.url).toBe("https://example.com/integration-test-hook");
    expect(body.workspaceId).toBe("ws-integration-test");
    expect(body.createdAt).toBeDefined();
  });

  it("returns 400 with invalid payload (missing url)", async () => {
    const res = await apiFetch("/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: "ws-1" }),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("returns 400 with invalid url format", async () => {
    const res = await apiFetch("/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "not-a-url", workspaceId: "ws-1" }),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });
});

// ---------------------------------------------------------------------------
// WEBHOOK_TIMEOUT_MS environment variable (THE TRAP)
// ---------------------------------------------------------------------------

describeIntegration("WEBHOOK_TIMEOUT_MS environment variable", () => {
  it("must be set to 5000 in the deployed environment", () => {
    if (process.env.WEBHOOK_TIMEOUT_MS !== "5000") {
      console.error(
        "WEBHOOK_TIMEOUT_MS is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys.",
      );
      fail(
        "WEBHOOK_TIMEOUT_MS is missing. You must update .github/workflows/deploy-backend.yml, commit it to the working-tree, and ensure it deploys.",
      );
    }
    expect(process.env.WEBHOOK_TIMEOUT_MS).toBe("5000");
  });
});
