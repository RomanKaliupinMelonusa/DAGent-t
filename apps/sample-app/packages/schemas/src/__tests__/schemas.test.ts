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
  TaskStatusSchema,
  TaskSchema,
  CreateTaskSchema,
  UpdateTaskStatusSchema,
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
// TaskStatusSchema
// ---------------------------------------------------------------------------

describe("TaskStatusSchema", () => {
  it.each(["TODO", "IN_PROGRESS", "DONE"])(
    "accepts valid status: %s",
    (status) => {
      expect(TaskStatusSchema.parse(status)).toBe(status);
    },
  );

  it("rejects unknown status", () => {
    const result = TaskStatusSchema.safeParse("CANCELLED");
    expect(result.success).toBe(false);
  });

  it("rejects empty string", () => {
    const result = TaskStatusSchema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("rejects lowercase variant", () => {
    const result = TaskStatusSchema.safeParse("todo");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TaskSchema
// ---------------------------------------------------------------------------

describe("TaskSchema", () => {
  const validTask = {
    id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    workspaceId: "default",
    title: "Implement drag-and-drop",
    status: "TODO",
    createdAt: "2026-04-04T12:00:00.000Z",
    updatedAt: "2026-04-04T12:00:00.000Z",
  };

  it("parses a valid task", () => {
    const result = TaskSchema.parse(validTask);
    expect(result).toEqual(validTask);
  });

  it("accepts all valid statuses", () => {
    for (const status of ["TODO", "IN_PROGRESS", "DONE"] as const) {
      const input = { ...validTask, status };
      expect(TaskSchema.parse(input)).toEqual(input);
    }
  });

  it("accepts timestamp without milliseconds", () => {
    const input = {
      ...validTask,
      createdAt: "2026-04-04T12:00:00Z",
      updatedAt: "2026-04-04T12:00:00Z",
    };
    expect(TaskSchema.parse(input)).toEqual(input);
  });

  it("rejects missing id", () => {
    const { id, ...rest } = validTask;
    const result = TaskSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID id", () => {
    const input = { ...validTask, id: "not-a-uuid" };
    const result = TaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing workspaceId", () => {
    const { workspaceId, ...rest } = validTask;
    const result = TaskSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty workspaceId", () => {
    const input = { ...validTask, workspaceId: "" };
    const result = TaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const { title, ...rest } = validTask;
    const result = TaskSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const input = { ...validTask, title: "" };
    const result = TaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding 200 characters", () => {
    const input = { ...validTask, title: "x".repeat(201) };
    const result = TaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("accepts title at 200 characters", () => {
    const input = { ...validTask, title: "x".repeat(200) };
    expect(TaskSchema.parse(input)).toEqual(input);
  });

  it("rejects invalid status", () => {
    const input = { ...validTask, status: "CANCELLED" };
    const result = TaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO createdAt", () => {
    const input = { ...validTask, createdAt: "not-a-date" };
    const result = TaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO updatedAt", () => {
    const input = { ...validTask, updatedAt: "not-a-date" };
    const result = TaskSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = TaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreateTaskSchema
// ---------------------------------------------------------------------------

describe("CreateTaskSchema", () => {
  it("parses a valid create-task body", () => {
    const input = { title: "My new task" };
    const result = CreateTaskSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("rejects empty title", () => {
    const result = CreateTaskSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Title is required");
    }
  });

  it("rejects missing title", () => {
    const result = CreateTaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding 200 characters", () => {
    const result = CreateTaskSchema.safeParse({ title: "x".repeat(201) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Title must be 200 characters or fewer",
      );
    }
  });

  it("accepts title at 200 characters", () => {
    const input = { title: "x".repeat(200) };
    expect(CreateTaskSchema.parse(input)).toEqual(input);
  });

  it("strips extra fields", () => {
    const input = { title: "task", extra: "field" };
    const result = CreateTaskSchema.parse(input);
    expect(result).toEqual({ title: "task" });
  });

  it("rejects empty object", () => {
    const result = CreateTaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UpdateTaskStatusSchema
// ---------------------------------------------------------------------------

describe("UpdateTaskStatusSchema", () => {
  it.each(["TODO", "IN_PROGRESS", "DONE"])(
    "parses valid status update: %s",
    (status) => {
      const input = { status };
      const result = UpdateTaskStatusSchema.parse(input);
      expect(result).toEqual(input);
    },
  );

  it("rejects invalid status", () => {
    const result = UpdateTaskStatusSchema.safeParse({ status: "CANCELLED" });
    expect(result.success).toBe(false);
  });

  it("rejects missing status", () => {
    const result = UpdateTaskStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects empty string status", () => {
    const result = UpdateTaskStatusSchema.safeParse({ status: "" });
    expect(result.success).toBe(false);
  });

  it("strips extra fields", () => {
    const input = { status: "DONE", extra: "field" };
    const result = UpdateTaskStatusSchema.parse(input);
    expect(result).toEqual({ status: "DONE" });
  });

  it("rejects empty object", () => {
    const result = UpdateTaskStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
