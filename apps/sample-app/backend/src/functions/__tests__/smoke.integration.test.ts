// =============================================================================
// Integration Tests — Live Deployed Azure Functions
// =============================================================================
// These tests run against the live deployed backend URL.
// Enable with: RUN_INTEGRATION=true INTEGRATION_API_BASE_URL=<url> npm run test:integration
//
// The function key is passed via INTEGRATION_FUNCTION_KEY env var.
// =============================================================================

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === "true";
const BASE_URL = process.env.INTEGRATION_API_BASE_URL ?? "";
const FUNC_KEY = process.env.INTEGRATION_FUNCTION_KEY ?? "";

// Helper: conditionally run integration tests
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helper — fetch with function key
// ---------------------------------------------------------------------------

async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const separator = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${separator}code=${FUNC_KEY}`;
  return fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
}

// ---------------------------------------------------------------------------
// fn-hello — GET /api/hello
// ---------------------------------------------------------------------------

describeIntegration("GET /api/hello (live)", () => {
  it("returns 200 with default greeting", async () => {
    const res = await apiFetch("/hello");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("message", "Hello, World!");
    expect(body).toHaveProperty("timestamp");
    // Timestamp should be a valid ISO string
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("returns greeting with name parameter", async () => {
    const res = await apiFetch("/hello?name=Integration");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.message).toBe("Hello, Integration!");
  });

  it("returns 401 without function key", async () => {
    const url = `${BASE_URL}/hello`;
    const res = await fetch(url);
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// fn-demo-login — POST /api/auth/login
// ---------------------------------------------------------------------------

describeIntegration("POST /api/auth/login (live)", () => {
  it("returns 200 with token on valid demo credentials", async () => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "demo", password: "demopass" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("token");
    expect(body.token).toBeTruthy(); // token should be non-empty
    expect(body).toHaveProperty("displayName", "Demo User");
  });

  it("returns 401 on invalid credentials", async () => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: "wrong", password: "wrong" }),
    });
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body).toHaveProperty("error", "UNAUTHORIZED");
  });

  it("returns 400 on missing body fields", async () => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty("error", "INVALID_INPUT");
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body).toHaveProperty("error", "INVALID_INPUT");
  });
});
