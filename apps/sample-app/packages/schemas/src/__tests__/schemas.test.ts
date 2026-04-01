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
  AuditLogSchema,
  AuditLogCreateSchema,
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
// AuditLogSchema
// ---------------------------------------------------------------------------

describe("AuditLogSchema", () => {
  const validAuditLog = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    userId: "demo",
    action: "USER_LOGIN",
    timestamp: "2026-04-01T12:00:00.000Z",
  };

  it("parses a valid audit log entry", () => {
    const result = AuditLogSchema.parse(validAuditLog);
    expect(result).toEqual(validAuditLog);
  });

  it("accepts timestamp without milliseconds", () => {
    const input = { ...validAuditLog, timestamp: "2026-04-01T12:00:00Z" };
    expect(AuditLogSchema.parse(input)).toEqual(input);
  });

  it("rejects missing id", () => {
    const { id, ...rest } = validAuditLog;
    const result = AuditLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid UUID for id", () => {
    const input = { ...validAuditLog, id: "not-a-uuid" };
    const result = AuditLogSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("id must be a valid UUID");
    }
  });

  it("rejects missing userId", () => {
    const { userId, ...rest } = validAuditLog;
    const result = AuditLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty userId", () => {
    const input = { ...validAuditLog, userId: "" };
    const result = AuditLogSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("userId is required");
    }
  });

  it("rejects missing action", () => {
    const { action, ...rest } = validAuditLog;
    const result = AuditLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty action", () => {
    const input = { ...validAuditLog, action: "" };
    const result = AuditLogSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("action is required");
    }
  });

  it("rejects missing timestamp", () => {
    const { timestamp, ...rest } = validAuditLog;
    const result = AuditLogSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO timestamp", () => {
    const input = { ...validAuditLog, timestamp: "not-a-date" };
    const result = AuditLogSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "timestamp must be an ISO-8601 datetime string",
      );
    }
  });

  it("rejects empty object", () => {
    const result = AuditLogSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("strips extra fields", () => {
    const input = { ...validAuditLog, extra: "field" };
    const result = AuditLogSchema.parse(input);
    expect(result).toEqual(validAuditLog);
  });
});

// ---------------------------------------------------------------------------
// AuditLogCreateSchema
// ---------------------------------------------------------------------------

describe("AuditLogCreateSchema", () => {
  const validCreate = {
    userId: "demo",
    action: "USER_LOGIN",
  };

  it("parses a valid create request", () => {
    const result = AuditLogCreateSchema.parse(validCreate);
    expect(result).toEqual(validCreate);
  });

  it("rejects missing userId", () => {
    const result = AuditLogCreateSchema.safeParse({ action: "USER_LOGIN" });
    expect(result.success).toBe(false);
  });

  it("rejects empty userId", () => {
    const result = AuditLogCreateSchema.safeParse({
      userId: "",
      action: "USER_LOGIN",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing action", () => {
    const result = AuditLogCreateSchema.safeParse({ userId: "demo" });
    expect(result.success).toBe(false);
  });

  it("rejects empty action", () => {
    const result = AuditLogCreateSchema.safeParse({
      userId: "demo",
      action: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = AuditLogCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("ignores id and timestamp (server-generated)", () => {
    const input = {
      ...validCreate,
      id: "550e8400-e29b-41d4-a716-446655440000",
      timestamp: "2026-04-01T12:00:00.000Z",
    };
    const result = AuditLogCreateSchema.parse(input);
    expect(result).toEqual(validCreate);
  });

  it("strips extra fields", () => {
    const input = { ...validCreate, extra: "field" };
    const result = AuditLogCreateSchema.parse(input);
    expect(result).toEqual(validCreate);
  });
});
