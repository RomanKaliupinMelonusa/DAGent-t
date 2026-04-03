// =============================================================================
// Tests — Task Board Schemas
// =============================================================================
// Round-trip parse tests with valid and invalid inputs for task schemas.
// =============================================================================

import {
  TaskStatusSchema,
  TaskSchema,
  CreateTaskSchema,
  UpdateTaskStatusSchema,
} from "../index.js";

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

  it("rejects lowercase variants", () => {
    const result = TaskStatusSchema.safeParse("todo");
    expect(result.success).toBe(false);
  });

  it("rejects null", () => {
    const result = TaskStatusSchema.safeParse(null);
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
    title: "Implement login flow",
    status: "TODO",
    createdAt: "2026-04-03T12:00:00.000Z",
    updatedAt: "2026-04-03T12:00:00.000Z",
  };

  it("parses a valid task", () => {
    const result = TaskSchema.parse(validTask);
    expect(result).toEqual(validTask);
  });

  it("accepts all valid statuses", () => {
    for (const status of ["TODO", "IN_PROGRESS", "DONE"] as const) {
      const task = { ...validTask, status };
      expect(TaskSchema.parse(task)).toEqual(task);
    }
  });

  it("accepts timestamps without milliseconds", () => {
    const task = {
      ...validTask,
      createdAt: "2026-04-03T12:00:00Z",
      updatedAt: "2026-04-03T12:00:00Z",
    };
    expect(TaskSchema.parse(task)).toEqual(task);
  });

  it("rejects missing id", () => {
    const { id: _, ...rest } = validTask;
    const result = TaskSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects invalid uuid for id", () => {
    const task = { ...validTask, id: "not-a-uuid" };
    const result = TaskSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it("rejects missing workspaceId", () => {
    const { workspaceId: _, ...rest } = validTask;
    const result = TaskSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty workspaceId", () => {
    const task = { ...validTask, workspaceId: "" };
    const result = TaskSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it("rejects missing title", () => {
    const { title: _, ...rest } = validTask;
    const result = TaskSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const task = { ...validTask, title: "" };
    const result = TaskSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it("rejects title exceeding 200 characters", () => {
    const task = { ...validTask, title: "x".repeat(201) };
    const result = TaskSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it("accepts title at exactly 200 characters", () => {
    const task = { ...validTask, title: "x".repeat(200) };
    expect(TaskSchema.parse(task)).toEqual(task);
  });

  it("rejects invalid status", () => {
    const task = { ...validTask, status: "CANCELLED" };
    const result = TaskSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO createdAt", () => {
    const task = { ...validTask, createdAt: "not-a-date" };
    const result = TaskSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it("rejects non-ISO updatedAt", () => {
    const task = { ...validTask, updatedAt: "not-a-date" };
    const result = TaskSchema.safeParse(task);
    expect(result.success).toBe(false);
  });

  it("rejects missing createdAt", () => {
    const { createdAt: _, ...rest } = validTask;
    const result = TaskSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing updatedAt", () => {
    const { updatedAt: _, ...rest } = validTask;
    const result = TaskSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = TaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("strips extra fields", () => {
    const task = { ...validTask, extra: "field" };
    const result = TaskSchema.parse(task);
    expect(result).toEqual(validTask);
  });
});

// ---------------------------------------------------------------------------
// CreateTaskSchema
// ---------------------------------------------------------------------------

describe("CreateTaskSchema", () => {
  it("parses a valid create request", () => {
    const input = { title: "New task" };
    const result = CreateTaskSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("accepts title at exactly 1 character", () => {
    const input = { title: "X" };
    expect(CreateTaskSchema.parse(input)).toEqual(input);
  });

  it("accepts title at exactly 200 characters", () => {
    const input = { title: "x".repeat(200) };
    expect(CreateTaskSchema.parse(input)).toEqual(input);
  });

  it("rejects empty title", () => {
    const result = CreateTaskSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Title is required");
    }
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

  it("rejects missing title", () => {
    const result = CreateTaskSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects null title", () => {
    const result = CreateTaskSchema.safeParse({ title: null });
    expect(result.success).toBe(false);
  });

  it("rejects numeric title", () => {
    const result = CreateTaskSchema.safeParse({ title: 42 });
    expect(result.success).toBe(false);
  });

  it("strips extra fields", () => {
    const input = { title: "New task", workspaceId: "injected", extra: true };
    const result = CreateTaskSchema.parse(input);
    expect(result).toEqual({ title: "New task" });
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
      const result = UpdateTaskStatusSchema.parse({ status });
      expect(result).toEqual({ status });
    },
  );

  it("rejects unknown status", () => {
    const result = UpdateTaskStatusSchema.safeParse({ status: "CANCELLED" });
    expect(result.success).toBe(false);
  });

  it("rejects empty status", () => {
    const result = UpdateTaskStatusSchema.safeParse({ status: "" });
    expect(result.success).toBe(false);
  });

  it("rejects missing status", () => {
    const result = UpdateTaskStatusSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects null status", () => {
    const result = UpdateTaskStatusSchema.safeParse({ status: null });
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
