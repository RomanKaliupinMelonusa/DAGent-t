// =============================================================================
// Tests — fn-hello (Sample Protected Endpoint)
// =============================================================================

import hello from "../fn-hello";
import { HelloResponseSchema } from "../../schemas/index";
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

function createMockRequest(queryParams: Record<string, string> = {}): HttpRequest {
  return {
    query: new Map(Object.entries(queryParams)),
  } as unknown as HttpRequest;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("fn-hello", () => {
  it("returns 200 with default greeting when no name param", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toBeDefined();
    expect(result.jsonBody.message).toBe("Hello, World!");
  });

  it("returns greeting with provided name", async () => {
    const req = createMockRequest({ name: "Alice" });
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody.message).toBe("Hello, Alice!");
  });

  it("returns a valid ISO timestamp", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    expect(result.jsonBody.timestamp).toBeDefined();
    const parsed = new Date(result.jsonBody.timestamp);
    expect(parsed.toISOString()).toBe(result.jsonBody.timestamp);
  });

  it("response conforms to HelloResponseSchema", async () => {
    const req = createMockRequest({ name: "Test" });
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    const parsed = HelloResponseSchema.safeParse(result.jsonBody);
    expect(parsed.success).toBe(true);
  });

  it("logs the request with the name parameter", async () => {
    const req = createMockRequest({ name: "Bob" });
    const ctx = createMockContext();

    await hello(req, ctx);

    expect(ctx.log).toHaveBeenCalledWith("Hello endpoint called with name=Bob");
  });

  it("handles empty string name as empty greeting", async () => {
    const req = createMockRequest({ name: "" });
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    // Empty string from query still gets used (not null/undefined)
    expect(result.status).toBe(200);
    expect(result.jsonBody.message).toBe("Hello, !");
  });

  it("handles special characters in name", async () => {
    const req = createMockRequest({ name: "<script>alert('xss')</script>" });
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    expect(result.status).toBe(200);
    // The function returns JSON, so XSS is not a risk here,
    // but we verify it doesn't crash
    expect(result.jsonBody.message).toContain("<script>");
  });
});
