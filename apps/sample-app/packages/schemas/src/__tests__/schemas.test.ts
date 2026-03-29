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
  ThemeSchema,
  UserProfileSchema,
  ProfileUpdateSchema,
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
// ThemeSchema
// ---------------------------------------------------------------------------

describe("ThemeSchema", () => {
  it.each(["light", "dark", "system"])(
    "accepts valid theme: %s",
    (theme) => {
      expect(ThemeSchema.parse(theme)).toBe(theme);
    },
  );

  it("rejects invalid theme value", () => {
    const result = ThemeSchema.safeParse("blue");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = ThemeSchema.safeParse("");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UserProfileSchema
// ---------------------------------------------------------------------------

describe("UserProfileSchema", () => {
  const validProfile = {
    id: "00000000-0000-0000-0000-000000000001",
    displayName: "Demo User",
    email: "demo@example.com",
    theme: "system" as const,
  };

  it("parses a valid user profile", () => {
    const result = UserProfileSchema.parse(validProfile);
    expect(result).toEqual(validProfile);
  });

  it("rejects non-uuid id", () => {
    const result = UserProfileSchema.safeParse({
      ...validProfile,
      id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects displayName shorter than 2 characters", () => {
    const result = UserProfileSchema.safeParse({
      ...validProfile,
      displayName: "A",
    });
    expect(result.success).toBe(false);
  });

  it("rejects displayName longer than 50 characters", () => {
    const result = UserProfileSchema.safeParse({
      ...validProfile,
      displayName: "A".repeat(51),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = UserProfileSchema.safeParse({
      ...validProfile,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid theme value", () => {
    const result = UserProfileSchema.safeParse({
      ...validProfile,
      theme: "blue",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = UserProfileSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProfileUpdateSchema
// ---------------------------------------------------------------------------

describe("ProfileUpdateSchema", () => {
  const validUpdate = {
    displayName: "New Name",
    theme: "dark" as const,
  };

  it("parses a valid profile update", () => {
    const result = ProfileUpdateSchema.parse(validUpdate);
    expect(result).toEqual(validUpdate);
  });

  it("rejects displayName shorter than 2 characters", () => {
    const result = ProfileUpdateSchema.safeParse({
      ...validUpdate,
      displayName: "A",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid theme", () => {
    const result = ProfileUpdateSchema.safeParse({
      ...validUpdate,
      theme: "blue",
    });
    expect(result.success).toBe(false);
  });

  it.each(["light", "dark", "system"])(
    "accepts valid theme value: %s",
    (theme) => {
      const result = ProfileUpdateSchema.safeParse({
        ...validUpdate,
        theme,
      });
      expect(result.success).toBe(true);
    },
  );
});
