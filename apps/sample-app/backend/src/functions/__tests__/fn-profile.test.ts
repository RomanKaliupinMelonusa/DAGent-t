// =============================================================================
// Tests — fn-profile (User Profile GET + PATCH)
// =============================================================================

import profileHandler from "../fn-profile";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { UserProfileSchema } from "@branded/schemas";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const DEMO_TOKEN = "test-token";

function createMockContext(): InvocationContext {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    trace: jest.fn(),
    debug: jest.fn(),
    invocationId: "test-invocation-id",
  } as unknown as InvocationContext;
}

function createMockRequest({
  method = "GET",
  body,
  headers = {},
}: {
  method?: string;
  body?: unknown | null;
  headers?: Record<string, string>;
}): HttpRequest {
  return {
    method,
    headers: {
      get: jest.fn((name: string) => headers[name.toLowerCase()] ?? null),
    },
    json:
      body === null
        ? jest.fn().mockRejectedValue(new Error("Invalid JSON"))
        : body !== undefined
          ? jest.fn().mockResolvedValue(body)
          : jest.fn(),
  } as unknown as HttpRequest;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("fn-profile", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      DEMO_TOKEN,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------------------
  // Auth guard tests
  // -------------------------------------------------------------------------

  it("returns 401 when no token is provided (GET)", async () => {
    const req = createMockRequest({ method: "GET" });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(401);
    expect(result.jsonBody).toEqual({
      error: "UNAUTHORIZED",
      message: "Missing or invalid demo token.",
    });
  });

  it("returns 401 when wrong token is provided (GET)", async () => {
    const req = createMockRequest({
      method: "GET",
      headers: { "x-demo-token": "wrong-token" },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(401);
    expect(result.jsonBody).toEqual({
      error: "UNAUTHORIZED",
      message: "Missing or invalid demo token.",
    });
  });

  // -------------------------------------------------------------------------
  // GET /profile tests
  // -------------------------------------------------------------------------

  it("returns 200 with valid UserProfile shape on GET", async () => {
    const req = createMockRequest({
      method: "GET",
      headers: { "x-demo-token": DEMO_TOKEN },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(200);

    // Validate response against the Zod schema
    const parsed = UserProfileSchema.safeParse(result.jsonBody);
    expect(parsed.success).toBe(true);

    // Verify exact mock data
    expect(result.jsonBody).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      displayName: "Demo User",
      email: "demo@example.com",
      theme: "system",
    });
  });

  // -------------------------------------------------------------------------
  // PATCH /profile tests
  // -------------------------------------------------------------------------

  it("returns 200 with merged profile on valid PATCH", async () => {
    const req = createMockRequest({
      method: "PATCH",
      headers: { "x-demo-token": DEMO_TOKEN },
      body: { displayName: "New Name", theme: "dark" },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      displayName: "New Name",
      email: "demo@example.com",
      theme: "dark",
    });

    // Validate merged response against schema
    const parsed = UserProfileSchema.safeParse(result.jsonBody);
    expect(parsed.success).toBe(true);
  });

  it("returns 400 when displayName is too short (1 char)", async () => {
    const req = createMockRequest({
      method: "PATCH",
      headers: { "x-demo-token": DEMO_TOKEN },
      body: { displayName: "A", theme: "dark" },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 when theme is invalid ('blue')", async () => {
    const req = createMockRequest({
      method: "PATCH",
      headers: { "x-demo-token": DEMO_TOKEN },
      body: { displayName: "Valid Name", theme: "blue" },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 when body is unparseable JSON", async () => {
    const req = createMockRequest({
      method: "PATCH",
      headers: { "x-demo-token": DEMO_TOKEN },
      body: null,
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toEqual({
      error: "INVALID_INPUT",
      message: "Invalid JSON body.",
    });
  });
});
