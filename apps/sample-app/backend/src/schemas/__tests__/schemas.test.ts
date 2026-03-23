// =============================================================================
// Schema Tests — Round-trip parse tests for all shared schemas
// =============================================================================

import {
  HelloResponseSchema,
  DemoLoginRequestSchema,
  DemoLoginResponseSchema,
  ApiErrorResponseSchema,
} from "../index";

// ---------------------------------------------------------------------------
// HelloResponseSchema
// ---------------------------------------------------------------------------

describe("HelloResponseSchema", () => {
  it("parses a valid hello response", () => {
    const valid = {
      message: "Hello, World!",
      timestamp: "2026-03-23T17:00:00.000Z",
    };
    const result = HelloResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(valid);
    }
  });

  it("rejects when message is missing", () => {
    const invalid = { timestamp: "2026-03-23T17:00:00.000Z" };
    const result = HelloResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects when timestamp is missing", () => {
    const invalid = { message: "Hello!" };
    const result = HelloResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects when timestamp is not a valid datetime", () => {
    const invalid = { message: "Hello!", timestamp: "not-a-date" };
    const result = HelloResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = HelloResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DemoLoginRequestSchema
// ---------------------------------------------------------------------------

describe("DemoLoginRequestSchema", () => {
  it("parses a valid login request", () => {
    const valid = { username: "demo", password: "demopass" };
    const result = DemoLoginRequestSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(valid);
    }
  });

  it("rejects when username is empty", () => {
    const invalid = { username: "", password: "demopass" };
    const result = DemoLoginRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects when password is empty", () => {
    const invalid = { username: "demo", password: "" };
    const result = DemoLoginRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects when username is missing", () => {
    const invalid = { password: "demopass" };
    const result = DemoLoginRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects when password is missing", () => {
    const invalid = { username: "demo" };
    const result = DemoLoginRequestSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = DemoLoginRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DemoLoginResponseSchema
// ---------------------------------------------------------------------------

describe("DemoLoginResponseSchema", () => {
  it("parses a valid login response", () => {
    const valid = { token: "abc-123-token", displayName: "Demo User" };
    const result = DemoLoginResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(valid);
    }
  });

  it("parses when token is empty string", () => {
    const valid = { token: "", displayName: "Demo User" };
    const result = DemoLoginResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects when token is missing", () => {
    const invalid = { displayName: "Demo User" };
    const result = DemoLoginResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects when displayName is missing", () => {
    const invalid = { token: "abc" };
    const result = DemoLoginResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = DemoLoginResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ApiErrorResponseSchema
// ---------------------------------------------------------------------------

describe("ApiErrorResponseSchema", () => {
  it("parses a valid error response", () => {
    const valid = { error: "UNAUTHORIZED", message: "Invalid credentials." };
    const result = ApiErrorResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(valid);
    }
  });

  it("parses all known error codes", () => {
    const codes = [
      "INVALID_INPUT",
      "UNAUTHORIZED",
      "NOT_FOUND",
      "SERVER_ERROR",
    ];
    for (const code of codes) {
      const result = ApiErrorResponseSchema.safeParse({
        error: code,
        message: `Error: ${code}`,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects when error is missing", () => {
    const invalid = { message: "Something went wrong." };
    const result = ApiErrorResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects when message is missing", () => {
    const invalid = { error: "UNAUTHORIZED" };
    const result = ApiErrorResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = ApiErrorResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
