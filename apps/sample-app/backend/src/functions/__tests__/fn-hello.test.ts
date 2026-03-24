// =============================================================================
// Tests — fn-hello (Sample Protected Endpoint)
// =============================================================================

import hello from "../fn-hello";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { HelloResponseSchema } from "@branded/schemas";

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
  it("returns 200 with default greeting when no name provided", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toMatchObject({
      message: "Hello, World!",
    });
    // Verify timestamp is present and is a valid ISO string
    expect(result.jsonBody.timestamp).toBeDefined();
    expect(new Date(result.jsonBody.timestamp).toISOString()).toBe(
      result.jsonBody.timestamp,
    );
  });

  it("returns 200 with custom greeting when name is provided", async () => {
    const req = createMockRequest({ name: "Alice" });
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toMatchObject({
      message: "Hello, Alice!",
    });
  });

  it("response matches HelloResponseSchema", async () => {
    const req = createMockRequest({ name: "Test" });
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    // Validate the response body against the shared schema
    const parsed = HelloResponseSchema.safeParse(result.jsonBody);
    expect(parsed.success).toBe(true);
  });

  it("logs the request with name parameter", async () => {
    const req = createMockRequest({ name: "Bob" });
    const ctx = createMockContext();

    await hello(req, ctx);

    expect(ctx.log).toHaveBeenCalledWith("Hello endpoint called with name=Bob");
  });

  it("logs the request with default name", async () => {
    const req = createMockRequest();
    const ctx = createMockContext();

    await hello(req, ctx);

    expect(ctx.log).toHaveBeenCalledWith(
      "Hello endpoint called with name=World",
    );
  });

  it("returns 400 when name exceeds 100 characters", async () => {
    const longName = "a".repeat(101);
    const req = createMockRequest({ name: longName });
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toEqual({
      error: "INVALID_INPUT",
      message: "Name parameter must be 100 characters or fewer.",
    });
  });

  it("accepts name with exactly 100 characters", async () => {
    const maxName = "a".repeat(100);
    const req = createMockRequest({ name: maxName });
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody.message).toBe(`Hello, ${maxName}!`);
  });

  it("handles special characters in name", async () => {
    const req = createMockRequest({ name: "O'Brien & Co." });
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody.message).toBe("Hello, O'Brien & Co.!");
  });

  it("handles empty string name (uses default)", async () => {
    // An empty query param returns "" from URLSearchParams, but our function
    // uses ?? "World" which only triggers on null/undefined, not "".
    // Empty string is a valid (if odd) name.
    const req = createMockRequest({ name: "" });
    const ctx = createMockContext();

    const result = await hello(req, ctx);

    expect(result.status).toBe(200);
    // Empty string means the query param exists but is empty
    expect(result.jsonBody.message).toBe("Hello, !");
  });
});
