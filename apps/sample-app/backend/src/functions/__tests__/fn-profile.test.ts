// =============================================================================
// Tests — fn-profile (User Profile Endpoint)
// =============================================================================

import profileHandler from "../fn-profile";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { UserProfileSchema } from "@branded/schemas";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const TEST_TOKEN = "test-demo-token-abc123";

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
  // Auth — 401 cases
  // -------------------------------------------------------------------------

  it("returns 401 when no X-Demo-Token header is provided (GET)", async () => {
    const req = createMockRequest({ method: "GET" });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(401);
    expect(result.jsonBody).toEqual({
      error: "UNAUTHORIZED",
      message: "Missing or invalid demo token.",
    });
  });

  it("returns 401 when wrong X-Demo-Token is provided (GET)", async () => {
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
  // GET — 200 success
  // -------------------------------------------------------------------------

  it("GET returns 200 with valid UserProfile shape", async () => {
    const req = createMockRequest({
      method: "GET",
      headers: { "x-demo-token": TEST_TOKEN },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(200);

    // Validate shape using Zod schema
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
  // PATCH — 200 success
  // -------------------------------------------------------------------------

  it("PATCH returns 200 with merged profile on valid body", async () => {
    const req = createMockRequest({
      method: "PATCH",
      body: { displayName: "New Name", theme: "dark" },
      headers: { "x-demo-token": TEST_TOKEN },
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

    // Also validate returned shape
    const parsed = UserProfileSchema.safeParse(result.jsonBody);
    expect(parsed.success).toBe(true);
  });

  // -------------------------------------------------------------------------
  // PATCH — 400 validation errors
  // -------------------------------------------------------------------------

  it("PATCH returns 400 for 1-character displayName", async () => {
    const req = createMockRequest({
      method: "PATCH",
      body: { displayName: "A", theme: "light" },
      headers: { "x-demo-token": TEST_TOKEN },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
    expect(result.jsonBody.message).toContain("displayName");
  });

  it("PATCH returns 400 for invalid theme value", async () => {
    const req = createMockRequest({
      method: "PATCH",
      body: { displayName: "Valid Name", theme: "blue" },
      headers: { "x-demo-token": TEST_TOKEN },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
    expect(result.jsonBody.message).toContain("theme");
  });

  it("PATCH returns 400 for unparseable JSON body", async () => {
    const req = createMockRequest({
      method: "PATCH",
      body: null,
      headers: { "x-demo-token": TEST_TOKEN },
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
