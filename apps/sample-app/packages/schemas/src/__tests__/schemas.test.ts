// =============================================================================
// Tests — @branded/schemas
// =============================================================================
// Round-trip parse tests with valid and invalid inputs for every schema.
// =============================================================================

import {
  HelloResponseSchema,
  DemoLoginRequestSchema,
  DemoLoginResponseSchema,
  ApiErrorCodeSchema,
  ApiErrorResponseSchema,
  HealthStatusSchema,
  HealthCheckEntrySchema,
  HealthCheckResponseSchema,
} from "../index.js";

// ---------------------------------------------------------------------------
// HelloResponseSchema
// ---------------------------------------------------------------------------

describe("HelloResponseSchema", () => {
  it("parses a valid hello response", () => {
    const input = {
      message: "Hello, World!",
      timestamp: "2026-03-24T00:00:00.000Z",
    };
    const result = HelloResponseSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("accepts timestamp without milliseconds", () => {
    const input = {
      message: "Hello, World!",
      timestamp: "2026-03-24T00:00:00Z",
    };
    expect(HelloResponseSchema.parse(input)).toEqual(input);
  });

  it("rejects missing message", () => {
    const input = { timestamp: "2026-03-24T00:00:00.000Z" };
    const result = HelloResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing timestamp", () => {
    const input = { message: "Hello!" };
    const result = HelloResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO timestamp", () => {
    const input = { message: "Hello!", timestamp: "not-a-date" };
    const result = HelloResponseSchema.safeParse(input);
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
  it("parses valid credentials", () => {
    const input = { username: "demo", password: "demopass" };
    const result = DemoLoginRequestSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("rejects empty username", () => {
    const input = { username: "", password: "demopass" };
    const result = DemoLoginRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Username is required");
    }
  });

  it("rejects empty password", () => {
    const input = { username: "demo", password: "" };
    const result = DemoLoginRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Password is required");
    }
  });

  it("rejects missing username", () => {
    const input = { password: "demopass" };
    const result = DemoLoginRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const input = { username: "demo" };
    const result = DemoLoginRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = DemoLoginRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("strips extra fields", () => {
    const input = { username: "demo", password: "pass", extra: "field" };
    const result = DemoLoginRequestSchema.parse(input);
    expect(result).toEqual({ username: "demo", password: "pass" });
  });
});

// ---------------------------------------------------------------------------
// DemoLoginResponseSchema
// ---------------------------------------------------------------------------

describe("DemoLoginResponseSchema", () => {
  it("parses a valid login response", () => {
    const input = { token: "abc-123", displayName: "Demo User" };
    const result = DemoLoginResponseSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("accepts empty token (edge case: unset DEMO_TOKEN)", () => {
    const input = { token: "", displayName: "Demo User" };
    const result = DemoLoginResponseSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("rejects missing token", () => {
    const input = { displayName: "Demo User" };
    const result = DemoLoginResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing displayName", () => {
    const input = { token: "abc-123" };
    const result = DemoLoginResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = DemoLoginResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ApiErrorCodeSchema
// ---------------------------------------------------------------------------

describe("ApiErrorCodeSchema", () => {
  it.each(["INVALID_INPUT", "UNAUTHORIZED", "NOT_FOUND", "SERVER_ERROR"])(
    "accepts valid code: %s",
    (code) => {
      expect(ApiErrorCodeSchema.parse(code)).toBe(code);
    },
  );

  it("rejects unknown code", () => {
    const result = ApiErrorCodeSchema.safeParse("UNKNOWN_CODE");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = ApiErrorCodeSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ApiErrorResponseSchema
// ---------------------------------------------------------------------------

describe("ApiErrorResponseSchema", () => {
  it("parses a valid error response", () => {
    const input = {
      error: "UNAUTHORIZED",
      message: "Invalid username or password.",
    };
    const result = ApiErrorResponseSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("parses each error code variant", () => {
    for (const code of [
      "INVALID_INPUT",
      "UNAUTHORIZED",
      "NOT_FOUND",
      "SERVER_ERROR",
    ] as const) {
      const input = { error: code, message: `Test ${code}` };
      expect(ApiErrorResponseSchema.parse(input)).toEqual(input);
    }
  });

  it("rejects unknown error code", () => {
    const input = { error: "FOOBAR", message: "bad" };
    const result = ApiErrorResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing message", () => {
    const input = { error: "NOT_FOUND" };
    const result = ApiErrorResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing error", () => {
    const input = { message: "Something went wrong" };
    const result = ApiErrorResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = ApiErrorResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HealthStatusSchema
// ---------------------------------------------------------------------------

describe("HealthStatusSchema", () => {
  it.each(["healthy", "degraded", "unhealthy"])(
    "accepts valid status: %s",
    (status) => {
      expect(HealthStatusSchema.parse(status)).toBe(status);
    },
  );

  it("rejects unknown status", () => {
    const result = HealthStatusSchema.safeParse("warning");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = HealthStatusSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HealthCheckEntrySchema
// ---------------------------------------------------------------------------

describe("HealthCheckEntrySchema", () => {
  it("parses a valid entry with all fields", () => {
    const input = {
      name: "database",
      status: "healthy",
      message: "Connection pool active",
      durationMs: 12,
    };
    const result = HealthCheckEntrySchema.parse(input);
    expect(result).toEqual(input);
  });

  it("parses a minimal entry (only required fields)", () => {
    const input = { name: "self", status: "healthy" };
    const result = HealthCheckEntrySchema.parse(input);
    expect(result).toEqual(input);
  });

  it("accepts zero durationMs", () => {
    const input = { name: "cache", status: "healthy", durationMs: 0 };
    const result = HealthCheckEntrySchema.parse(input);
    expect(result.durationMs).toBe(0);
  });

  it("rejects negative durationMs", () => {
    const input = { name: "cache", status: "healthy", durationMs: -1 };
    const result = HealthCheckEntrySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const input = { name: "", status: "healthy" };
    const result = HealthCheckEntrySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing name", () => {
    const input = { status: "healthy" };
    const result = HealthCheckEntrySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing status", () => {
    const input = { name: "database" };
    const result = HealthCheckEntrySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid status in entry", () => {
    const input = { name: "database", status: "unknown" };
    const result = HealthCheckEntrySchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = HealthCheckEntrySchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HealthCheckResponseSchema
// ---------------------------------------------------------------------------

describe("HealthCheckResponseSchema", () => {
  it("parses a full health check response", () => {
    const input = {
      status: "healthy",
      timestamp: "2026-04-01T12:00:00.000Z",
      version: "0.1.0",
      checks: [
        { name: "self", status: "healthy", durationMs: 1 },
        { name: "database", status: "healthy", message: "OK", durationMs: 12 },
      ],
    };
    const result = HealthCheckResponseSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("parses a minimal response (only required fields)", () => {
    const input = {
      status: "healthy",
      timestamp: "2026-04-01T12:00:00Z",
    };
    const result = HealthCheckResponseSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("accepts degraded status", () => {
    const input = {
      status: "degraded",
      timestamp: "2026-04-01T12:00:00.000Z",
      checks: [
        { name: "cache", status: "unhealthy", message: "Connection refused" },
      ],
    };
    const result = HealthCheckResponseSchema.parse(input);
    expect(result.status).toBe("degraded");
  });

  it("accepts unhealthy status", () => {
    const input = {
      status: "unhealthy",
      timestamp: "2026-04-01T12:00:00.000Z",
    };
    const result = HealthCheckResponseSchema.parse(input);
    expect(result.status).toBe("unhealthy");
  });

  it("accepts empty checks array", () => {
    const input = {
      status: "healthy",
      timestamp: "2026-04-01T12:00:00.000Z",
      checks: [],
    };
    const result = HealthCheckResponseSchema.parse(input);
    expect(result.checks).toEqual([]);
  });

  it("rejects missing status", () => {
    const input = { timestamp: "2026-04-01T12:00:00.000Z" };
    const result = HealthCheckResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing timestamp", () => {
    const input = { status: "healthy" };
    const result = HealthCheckResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO timestamp", () => {
    const input = { status: "healthy", timestamp: "not-a-date" };
    const result = HealthCheckResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid status in response", () => {
    const input = {
      status: "broken",
      timestamp: "2026-04-01T12:00:00.000Z",
    };
    const result = HealthCheckResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects invalid entry inside checks array", () => {
    const input = {
      status: "healthy",
      timestamp: "2026-04-01T12:00:00.000Z",
      checks: [{ name: "", status: "healthy" }],
    };
    const result = HealthCheckResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = HealthCheckResponseSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
