// =============================================================================
// Unit Tests — fn-health (Health Check Endpoint)
// =============================================================================

import health from "../fn-health";
import type { HttpRequest, InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

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

function createMockRequest(): HttpRequest {
  return {
    query: new Map(),
  } as unknown as HttpRequest;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("fn-health", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns 200 with status ok", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await health(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toBeDefined();
    expect(result.jsonBody.status).toBe("ok");
  });

  it("returns mode 'disabled' when STRICT_HEALTH_MODE is not set", async () => {
    delete process.env.STRICT_HEALTH_MODE;
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await health(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody.mode).toBe("disabled");
  });

  it("returns mode from STRICT_HEALTH_MODE env var when set", async () => {
    process.env.STRICT_HEALTH_MODE = "true";
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await health(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody.mode).toBe("true");
  });

  it("logs health endpoint call", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    await health(req, ctx);

    expect(ctx.log).toHaveBeenCalledWith("Health endpoint called");
  });

  it("returns only status and mode fields", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await health(req, ctx);

    expect(Object.keys(result.jsonBody).sort()).toEqual(["mode", "status"]);
  });

  it("reflects custom STRICT_HEALTH_MODE values", async () => {
    process.env.STRICT_HEALTH_MODE = "custom-value";
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await health(req, ctx);

    expect(result.jsonBody.mode).toBe("custom-value");
  });
});
