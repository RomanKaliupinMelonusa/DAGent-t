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
  WebhookSchema,
  CreateWebhookRequestSchema,
  WebhookListResponseSchema,
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
// WebhookSchema
// ---------------------------------------------------------------------------

describe("WebhookSchema", () => {
  const validWebhook = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    workspaceId: "ws-1",
    url: "https://example.com/hook",
    createdAt: "2026-04-03T00:00:00.000Z",
  };

  it("parses a valid webhook", () => {
    const result = WebhookSchema.parse(validWebhook);
    expect(result).toEqual(validWebhook);
  });

  it("accepts createdAt without milliseconds", () => {
    const input = { ...validWebhook, createdAt: "2026-04-03T00:00:00Z" };
    expect(WebhookSchema.parse(input)).toEqual(input);
  });

  it("rejects missing id", () => {
    const { id, ...rest } = validWebhook;
    expect(WebhookSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing workspaceId", () => {
    const { workspaceId, ...rest } = validWebhook;
    expect(WebhookSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing url", () => {
    const { url, ...rest } = validWebhook;
    expect(WebhookSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid url", () => {
    const input = { ...validWebhook, url: "not-a-url" };
    expect(WebhookSchema.safeParse(input).success).toBe(false);
  });

  it("rejects missing createdAt", () => {
    const { createdAt, ...rest } = validWebhook;
    expect(WebhookSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects non-ISO createdAt", () => {
    const input = { ...validWebhook, createdAt: "not-a-date" };
    expect(WebhookSchema.safeParse(input).success).toBe(false);
  });

  it("rejects empty object", () => {
    expect(WebhookSchema.safeParse({}).success).toBe(false);
  });

  it("strips extra fields", () => {
    const input = { ...validWebhook, extra: "field" };
    const result = WebhookSchema.parse(input);
    expect(result).toEqual(validWebhook);
  });
});

// ---------------------------------------------------------------------------
// CreateWebhookRequestSchema
// ---------------------------------------------------------------------------

describe("CreateWebhookRequestSchema", () => {
  const validRequest = {
    url: "https://example.com/hook",
    workspaceId: "ws-1",
  };

  it("parses a valid create request", () => {
    const result = CreateWebhookRequestSchema.parse(validRequest);
    expect(result).toEqual(validRequest);
  });

  it("rejects missing url", () => {
    const { url, ...rest } = validRequest;
    expect(CreateWebhookRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid url", () => {
    const input = { ...validRequest, url: "not-a-url" };
    expect(CreateWebhookRequestSchema.safeParse(input).success).toBe(false);
  });

  it("rejects missing workspaceId", () => {
    const { workspaceId, ...rest } = validRequest;
    expect(CreateWebhookRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects empty object", () => {
    expect(CreateWebhookRequestSchema.safeParse({}).success).toBe(false);
  });

  it("strips extra fields", () => {
    const input = { ...validRequest, extra: "field" };
    const result = CreateWebhookRequestSchema.parse(input);
    expect(result).toEqual(validRequest);
  });
});

// ---------------------------------------------------------------------------
// WebhookListResponseSchema
// ---------------------------------------------------------------------------

describe("WebhookListResponseSchema", () => {
  const validWebhook = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    workspaceId: "ws-1",
    url: "https://example.com/hook",
    createdAt: "2026-04-03T00:00:00.000Z",
  };

  it("parses a valid list response with items", () => {
    const input = { webhooks: [validWebhook] };
    const result = WebhookListResponseSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("parses a valid list response with empty array", () => {
    const input = { webhooks: [] };
    const result = WebhookListResponseSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("parses a list response with multiple webhooks", () => {
    const input = {
      webhooks: [
        validWebhook,
        { ...validWebhook, id: "another-id", url: "https://other.com/hook" },
      ],
    };
    const result = WebhookListResponseSchema.parse(input);
    expect(result.webhooks).toHaveLength(2);
  });

  it("rejects missing webhooks field", () => {
    expect(WebhookListResponseSchema.safeParse({}).success).toBe(false);
  });

  it("rejects webhooks as non-array", () => {
    expect(
      WebhookListResponseSchema.safeParse({ webhooks: "not-an-array" }).success,
    ).toBe(false);
  });

  it("rejects invalid webhook in array", () => {
    const input = { webhooks: [{ url: "not-a-url" }] };
    expect(WebhookListResponseSchema.safeParse(input).success).toBe(false);
  });

  it("rejects empty object", () => {
    expect(WebhookListResponseSchema.safeParse({}).success).toBe(false);
  });
});
