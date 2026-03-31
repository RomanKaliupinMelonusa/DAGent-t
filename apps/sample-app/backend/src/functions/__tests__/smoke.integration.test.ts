// =============================================================================
// Integration Tests — Smoke Tests Against Live Deployed Endpoints
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
// fn-hello — GET /hello
// ---------------------------------------------------------------------------

describeIntegration("fn-hello (live)", () => {
  it("returns 200 with default greeting when no name provided", async () => {
    const res = await apiFetch("/hello");
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(body.message).toBe("Hello, World!");
    expect(body.timestamp).toBeDefined();
    // Verify timestamp is valid ISO-8601
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("returns 200 with custom greeting when name is provided", async () => {
    const res = await apiFetch("/hello?name=IntegrationTest");
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(body.message).toBe("Hello, IntegrationTest!");
    expect(body.timestamp).toBeDefined();
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    const longName = "a".repeat(101);
    const res = await apiFetch(`/hello?name=${longName}`);
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
    expect(body.message).toContain("100 characters");
  });
});

// ---------------------------------------------------------------------------
// fn-health — GET /health (anonymous)
// ---------------------------------------------------------------------------

describeIntegration("fn-health (live)", () => {
  it("returns 200 with status ok and valid timestamp (anonymous)", async () => {
    // Health endpoint is anonymous — no function key needed
    const url = `${BASE_URL}/health`;
    const res = await fetch(url);
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    // Verify timestamp is valid ISO-8601
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("returns 200 without authentication headers", async () => {
    // Explicitly verify no auth is required
    const url = `${BASE_URL}/health`;
    const res = await fetch(url, {
      headers: {}, // No x-functions-key, no auth headers
    });
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(body.status).toBe("ok");
  });

  it("rejects non-GET methods with 404 or 405", async () => {
    const url = `${BASE_URL}/health`;
    const res = await fetch(url, { method: "POST" });
    // Azure Functions returns 404 for unregistered method+route combos
    expect([404, 405]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// fn-demo-login — POST /auth/login
// ---------------------------------------------------------------------------

describeIntegration("fn-demo-login (live)", () => {
  it("returns 200 with token and displayName for valid demo credentials", async () => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "demo", password: "demopass" }),
    });
    expect(res.status).toBe(200);

    const body: Json = await res.json();
    expect(body.token).toBeDefined();
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.displayName).toBe("Demo User");
  });

  it("returns 401 for invalid credentials", async () => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "wrong", password: "wrong" }),
    });
    expect(res.status).toBe(401);

    const body: Json = await res.json();
    expect(body.error).toBe("UNAUTHORIZED");
  });

  it("returns 400 for missing fields", async () => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);

    const body: Json = await res.json();
    expect(body.error).toBe("INVALID_INPUT");
  });
});
