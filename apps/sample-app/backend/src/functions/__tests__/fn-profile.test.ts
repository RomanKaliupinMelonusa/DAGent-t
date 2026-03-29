// =============================================================================
// Tests — fn-profile (User Profile API)
// =============================================================================

import profileHandler from "../fn-profile";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { UserProfileSchema } from "@branded/schemas";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const TEST_TOKEN = "test-token";

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
          : jest.fn().mockRejectedValue(new Error("No body")),
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
      DEMO_TOKEN: TEST_TOKEN,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // -------------------------------------------------------------------------
  // Auth Tests
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
  // GET Tests
  // -------------------------------------------------------------------------

  it("returns 200 with valid UserProfile shape on GET", async () => {
    const req = createMockRequest({
      method: "GET",
      headers: { "x-demo-token": TEST_TOKEN },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(200);

    // Validate response matches UserProfile schema
    const parsed = UserProfileSchema.safeParse(result.jsonBody);
    expect(parsed.success).toBe(true);
    expect(result.jsonBody).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      displayName: "Demo User",
      email: "demo@example.com",
      theme: "system",
    });
  });

  // -------------------------------------------------------------------------
  // PATCH Tests
  // -------------------------------------------------------------------------

  it("returns 200 with merged profile on valid PATCH", async () => {
    const req = createMockRequest({
      method: "PATCH",
      headers: { "x-demo-token": TEST_TOKEN },
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
  });

  it("returns 400 for displayName shorter than 2 chars on PATCH", async () => {
    const req = createMockRequest({
      method: "PATCH",
      headers: { "x-demo-token": TEST_TOKEN },
      body: { displayName: "A", theme: "dark" },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 for invalid theme value on PATCH", async () => {
    const req = createMockRequest({
      method: "PATCH",
      headers: { "x-demo-token": TEST_TOKEN },
      body: { displayName: "Valid Name", theme: "blue" },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 for unparseable JSON body on PATCH", async () => {
    const req = createMockRequest({
      method: "PATCH",
      headers: { "x-demo-token": TEST_TOKEN },
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
