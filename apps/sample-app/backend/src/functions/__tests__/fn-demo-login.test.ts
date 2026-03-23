// =============================================================================
// Tests — fn-demo-login (Demo Auth Login)
// =============================================================================

import demoLogin from "../fn-demo-login";
import type { HttpRequest, InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

const DEMO_TOKEN = "test-demo-token-abc123";
const DEMO_USER = "demo";
const DEMO_PASS = "demopass";

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

function createMockRequest(body: unknown | null): HttpRequest {
  return {
    json: body === null
      ? jest.fn().mockRejectedValue(new Error("Invalid JSON"))
      : jest.fn().mockResolvedValue(body),
  } as unknown as HttpRequest;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("fn-demo-login", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      AUTH_MODE: "demo",
      DEMO_USER,
      DEMO_PASS,
      DEMO_TOKEN,
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 404 when AUTH_MODE is not demo", async () => {
    process.env.AUTH_MODE = "entra";
    const req = createMockRequest({ username: DEMO_USER, password: DEMO_PASS });
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(404);
    expect(result.jsonBody).toEqual({
      error: "NOT_FOUND",
      message: "Demo auth is disabled.",
    });
  });

  it("returns 404 when AUTH_MODE is undefined", async () => {
    delete process.env.AUTH_MODE;
    const req = createMockRequest({ username: DEMO_USER, password: DEMO_PASS });
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(404);
  });

  it("returns 200 with token on valid credentials", async () => {
    const req = createMockRequest({ username: DEMO_USER, password: DEMO_PASS });
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual({
      token: DEMO_TOKEN,
      displayName: "Demo User",
    });
  });

  it("returns 401 on wrong username", async () => {
    const req = createMockRequest({ username: "wrong", password: DEMO_PASS });
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(401);
    expect(result.jsonBody).toEqual({
      error: "UNAUTHORIZED",
      message: "Invalid username or password.",
    });
  });

  it("returns 401 on wrong password", async () => {
    const req = createMockRequest({ username: DEMO_USER, password: "wrong" });
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(401);
    expect(result.jsonBody).toEqual({
      error: "UNAUTHORIZED",
      message: "Invalid username or password.",
    });
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = createMockRequest(null);
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toEqual({
      error: "INVALID_INPUT",
      message: "Invalid JSON body.",
    });
  });

  it("returns 400 when username is empty", async () => {
    const req = createMockRequest({ username: "", password: DEMO_PASS });
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
    expect(result.jsonBody.message).toContain("Username is required");
  });

  it("returns 400 when body has no fields", async () => {
    const req = createMockRequest({});
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 when password is missing", async () => {
    const req = createMockRequest({ username: DEMO_USER });
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 401 when DEMO_USER env var is unset", async () => {
    delete process.env.DEMO_USER;
    const req = createMockRequest({ username: DEMO_USER, password: DEMO_PASS });
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(401);
  });

  it("returns 200 with empty token when DEMO_TOKEN is unset", async () => {
    delete process.env.DEMO_TOKEN;
    const req = createMockRequest({ username: DEMO_USER, password: DEMO_PASS });
    const ctx = createMockContext();

    const result = await demoLogin(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual({
      token: "",
      displayName: "Demo User",
    });
  });
});
