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
  body = undefined as unknown | undefined,
  headers = {} as Record<string, string>,
}): HttpRequest {
  const headerMap = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );

  return {
    method,
    headers: {
      get: (name: string) => headerMap.get(name.toLowerCase()) ?? null,
    },
    json:
      body === undefined
        ? jest.fn().mockRejectedValue(new Error("No body"))
        : body === null
          ? jest.fn().mockRejectedValue(new Error("Invalid JSON"))
          : jest.fn().mockResolvedValue(body),
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

  // -----------------------------------------------------------------------
  // Auth — 401 cases
  // -----------------------------------------------------------------------

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
      headers: { "X-Demo-Token": "wrong-token" },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(401);
    expect(result.jsonBody).toEqual({
      error: "UNAUTHORIZED",
      message: "Missing or invalid demo token.",
    });
  });

  // -----------------------------------------------------------------------
  // GET — 200 success
  // -----------------------------------------------------------------------

  it("GET returns 200 with a valid UserProfile shape", async () => {
    const req = createMockRequest({
      method: "GET",
      headers: { "X-Demo-Token": TEST_TOKEN },
    });
    const ctx = createMockContext();

    const result = await profileHandler(req, ctx);

    expect(result.status).toBe(200);

    // Validate response matches the UserProfile schema
    const parsed = UserProfileSchema.safeParse(result.jsonBody);
    expect(parsed.success).toBe(true);
    expect(result.jsonBody).toEqual({
      id: "00000000-0000-0000-0000-000000000001",
      displayName: "Demo User",
      email: "demo@example.com",
      theme: "system",
    });
  });

  // -----------------------------------------------------------------------
  // PATCH — 200 success
  // -----------------------------------------------------------------------

  it("PATCH returns 200 with merged profile on valid body", async () => {
    const req = createMockRequest({
      method: "PATCH",
      body: { displayName: "New Name", theme: "dark" },
      headers: { "X-Demo-Token": TEST_TOKEN },
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

    // Validate response matches the UserProfile schema
    const parsed = UserProfileSchema.safeParse(result.jsonBody);
    expect(parsed.success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // PATCH — 400 validation errors
  // -----------------------------------------------------------------------

  it("PATCH returns 400 for displayName with 1 character", async () => {
    const req = createMockRequest({
      method: "PATCH",
      body: { displayName: "A", theme: "dark" },
      headers: { "X-Demo-Token": TEST_TOKEN },
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
      headers: { "X-Demo-Token": TEST_TOKEN },
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
      headers: { "X-Demo-Token": TEST_TOKEN },
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
