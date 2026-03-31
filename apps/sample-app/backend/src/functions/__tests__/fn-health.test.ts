// =============================================================================
// Tests — fn-health (System Health Check Endpoint)
// =============================================================================

import health from "../fn-health";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { HealthResponseSchema } from "@branded/schemas";

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
  it("returns 200 with status ok", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await health(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toMatchObject({
      status: "ok",
    });
  });

  it("returns a valid ISO-8601 timestamp", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await health(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody.timestamp).toBeDefined();
    expect(new Date(result.jsonBody.timestamp).toISOString()).toBe(
      result.jsonBody.timestamp,
    );
  });

  it("response matches HealthResponseSchema", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await health(req, ctx);

    const parsed = HealthResponseSchema.safeParse(result.jsonBody);
    expect(parsed.success).toBe(true);
  });

  it("logs the health check request", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    await health(req, ctx);

    expect(ctx.log).toHaveBeenCalledWith("Health check endpoint called");
  });

  it("returns status field as literal 'ok'", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await health(req, ctx);

    expect(result.jsonBody.status).toBe("ok");
  });

  it("returns a recent timestamp (within last 5 seconds)", async () => {
    const before = Date.now();
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await health(req, ctx);
    const after = Date.now();

    const ts = new Date(result.jsonBody.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
