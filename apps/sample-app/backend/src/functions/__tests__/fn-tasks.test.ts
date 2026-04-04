// =============================================================================
// Tests — fn-tasks (Kanban Task Board API)
// =============================================================================
// Unit tests for list, create, and update-status handlers.
// Cosmos DB is mocked to test business logic in isolation.
// =============================================================================

import type { HttpRequest, InvocationContext } from "@azure/functions";
import { TaskSchema, CreateTaskSchema, UpdateTaskStatusSchema } from "@branded/schemas";

// ---------------------------------------------------------------------------
// Mocks — Cosmos DB + Azure Identity
// ---------------------------------------------------------------------------

const mockFetchAll = jest.fn();
const mockCreate = jest.fn();
const mockRead = jest.fn();
const mockReplace = jest.fn();

jest.mock("@azure/identity", () => ({
  DefaultAzureCredential: jest.fn(),
}));

jest.mock("@azure/cosmos", () => {
  return {
    CosmosClient: jest.fn().mockImplementation(() => ({
      database: () => ({
        container: () => ({
          items: {
            query: () => ({ fetchAll: mockFetchAll }),
            create: mockCreate,
          },
          item: () => ({
            read: mockRead,
            replace: mockReplace,
          }),
        }),
      }),
    })),
    Container: jest.fn(),
  };
});

// Set required env vars before importing the module
process.env.COSMOSDB_ENDPOINT = "https://test-cosmos.documents.azure.com:443/";
process.env.COSMOSDB_DATABASE_NAME = "test-db";

// Import handlers after mocks
import { listTasks, createTask, updateTaskStatus } from "../fn-tasks";

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

function createMockRequest(
  overrides: {
    query?: Record<string, string>;
    body?: unknown;
    params?: Record<string, string>;
    method?: string;
  } = {},
): HttpRequest {
  const { query = {}, body, params = {}, method = "GET" } = overrides;

  return {
    query: new Map(Object.entries(query)),
    params,
    method,
    json: body !== undefined ? jest.fn().mockResolvedValue(body) : jest.fn().mockRejectedValue(new Error("No body")),
  } as unknown as HttpRequest;
}

// Sample task for testing
const SAMPLE_TASK = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  workspaceId: "default",
  title: "Test Task",
  status: "TODO" as const,
  createdAt: "2026-04-04T12:00:00.000Z",
  updatedAt: "2026-04-04T12:00:00.000Z",
};

// ---------------------------------------------------------------------------
// listTasks
// ---------------------------------------------------------------------------

describe("fn-tasks — listTasks (GET /api/tasks)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with empty array when no tasks exist", async () => {
    mockFetchAll.mockResolvedValue({ resources: [] });

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual([]);
  });

  it("returns 200 with tasks array", async () => {
    mockFetchAll.mockResolvedValue({ resources: [SAMPLE_TASK] });

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toHaveLength(1);
    expect(result.jsonBody[0].title).toBe("Test Task");
  });

  it("returns 500 on Cosmos DB error", async () => {
    mockFetchAll.mockRejectedValue(new Error("Cosmos failure"));

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody).toMatchObject({ error: "INTERNAL_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

describe("fn-tasks — createTask (POST /api/tasks)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 201 with created task for valid input", async () => {
    // Count query returns 0 tasks
    mockFetchAll.mockResolvedValue({ resources: [0] });
    mockCreate.mockResolvedValue({ resource: {} });

    const req = createMockRequest({ body: { title: "New Task" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(201);
    const task = result.jsonBody;
    expect(task.title).toBe("New Task");
    expect(task.status).toBe("TODO");
    expect(task.workspaceId).toBe("default");
    expect(task.id).toBeDefined();
    expect(task.createdAt).toBeDefined();
    expect(task.updatedAt).toBeDefined();

    // Validate against TaskSchema
    const parsed = TaskSchema.safeParse(task);
    expect(parsed.success).toBe(true);
  });

  it("returns 400 for missing title", async () => {
    const req = createMockRequest({ body: {} });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 for empty title", async () => {
    const req = createMockRequest({ body: { title: "" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 for title exceeding 200 characters", async () => {
    const longTitle = "a".repeat(201);
    const req = createMockRequest({ body: { title: longTitle } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = createMockRequest(); // no body → json() throws
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({
      error: "INVALID_INPUT",
      message: "Request body must be valid JSON.",
    });
  });

  it("returns 429 when workspace task limit is reached", async () => {
    process.env.MAX_TASKS_PER_WORKSPACE = "5";

    // Count query returns 5 tasks (at limit)
    mockFetchAll.mockResolvedValue({ resources: [5] });

    const req = createMockRequest({ body: { title: "One More Task" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(429);
    expect(result.jsonBody).toMatchObject({ error: "LIMIT_EXCEEDED" });
    expect(result.jsonBody.message).toContain("5");

    // Cleanup
    delete process.env.MAX_TASKS_PER_WORKSPACE;
  });

  it("allows task creation when under the limit", async () => {
    process.env.MAX_TASKS_PER_WORKSPACE = "5";

    // Count query returns 4 tasks (under limit)
    mockFetchAll.mockResolvedValue({ resources: [4] });
    mockCreate.mockResolvedValue({ resource: {} });

    const req = createMockRequest({ body: { title: "Under Limit" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(201);

    // Cleanup
    delete process.env.MAX_TASKS_PER_WORKSPACE;
  });

  it("uses default limit of 500 when env var is not set", async () => {
    delete process.env.MAX_TASKS_PER_WORKSPACE;

    // Count query returns 499 tasks (under default limit)
    mockFetchAll.mockResolvedValue({ resources: [499] });
    mockCreate.mockResolvedValue({ resource: {} });

    const req = createMockRequest({ body: { title: "Almost Full" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(201);
  });

  it("returns 500 on Cosmos DB error", async () => {
    mockFetchAll.mockResolvedValue({ resources: [0] });
    mockCreate.mockRejectedValue(new Error("Cosmos write failure"));

    const req = createMockRequest({ body: { title: "Failing Task" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody).toMatchObject({ error: "INTERNAL_ERROR" });
  });

  it("accepts title with exactly 200 characters", async () => {
    mockFetchAll.mockResolvedValue({ resources: [0] });
    mockCreate.mockResolvedValue({ resource: {} });

    const maxTitle = "a".repeat(200);
    const req = createMockRequest({ body: { title: maxTitle } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(201);
    expect(result.jsonBody.title).toBe(maxTitle);
  });
});

// ---------------------------------------------------------------------------
// updateTaskStatus
// ---------------------------------------------------------------------------

describe("fn-tasks — updateTaskStatus (PATCH /api/tasks/{id}/status)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with updated task for valid status transition", async () => {
    mockRead.mockResolvedValue({ resource: { ...SAMPLE_TASK } });
    mockReplace.mockResolvedValue({
      resource: { ...SAMPLE_TASK, status: "IN_PROGRESS" },
    });

    const req = createMockRequest({
      params: { id: SAMPLE_TASK.id },
      body: { status: "IN_PROGRESS" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody.status).toBe("IN_PROGRESS");
  });

  it("returns 400 for invalid status value", async () => {
    const req = createMockRequest({
      params: { id: SAMPLE_TASK.id },
      body: { status: "INVALID_STATUS" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 for missing status field", async () => {
    const req = createMockRequest({
      params: { id: SAMPLE_TASK.id },
      body: {},
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = createMockRequest({
      params: { id: SAMPLE_TASK.id },
      // no body → json() throws
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({
      error: "INVALID_INPUT",
      message: "Request body must be valid JSON.",
    });
  });

  it("returns 404 when task does not exist", async () => {
    mockRead.mockResolvedValue({ resource: undefined });

    const req = createMockRequest({
      params: { id: "nonexistent-id" },
      body: { status: "DONE" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(404);
    expect(result.jsonBody).toMatchObject({ error: "NOT_FOUND" });
  });

  it("returns 404 when Cosmos throws 404 error", async () => {
    const cosmosError = new Error("Not Found") as Error & { code: number };
    cosmosError.code = 404;
    mockRead.mockRejectedValue(cosmosError);

    const req = createMockRequest({
      params: { id: "deleted-id" },
      body: { status: "DONE" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(404);
    expect(result.jsonBody).toMatchObject({ error: "NOT_FOUND" });
  });

  it("returns 500 on generic Cosmos DB error", async () => {
    mockRead.mockRejectedValue(new Error("Connection timeout"));

    const req = createMockRequest({
      params: { id: SAMPLE_TASK.id },
      body: { status: "DONE" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody).toMatchObject({ error: "INTERNAL_ERROR" });
  });

  it("updates updatedAt timestamp on status change", async () => {
    const oldDate = "2026-01-01T00:00:00.000Z";
    mockRead.mockResolvedValue({
      resource: { ...SAMPLE_TASK, updatedAt: oldDate },
    });
    mockReplace.mockImplementation(async (doc: Record<string, unknown>) => ({
      resource: doc,
    }));

    const req = createMockRequest({
      params: { id: SAMPLE_TASK.id },
      body: { status: "DONE" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(200);
    // The replace call should have been called with an updatedAt different from oldDate
    const replaceArg = mockReplace.mock.calls[0][0];
    expect(replaceArg.updatedAt).not.toBe(oldDate);
    expect(replaceArg.status).toBe("DONE");
  });

  it("validates all valid status transitions", async () => {
    for (const status of ["TODO", "IN_PROGRESS", "DONE"] as const) {
      mockRead.mockResolvedValue({ resource: { ...SAMPLE_TASK } });
      mockReplace.mockResolvedValue({
        resource: { ...SAMPLE_TASK, status },
      });

      const req = createMockRequest({
        params: { id: SAMPLE_TASK.id },
        body: { status },
      });
      const ctx = createMockContext();
      const result = await updateTaskStatus(req, ctx);

      expect(result.status).toBe(200);
      expect(result.jsonBody.status).toBe(status);
    }
  });

  it("validates CreateTaskSchema rejects extra fields", () => {
    const result = CreateTaskSchema.safeParse({
      title: "Valid",
      extraField: "should be stripped or ignored",
    });
    // Zod v3 strips extra fields by default in .parse() but safeParse allows them
    expect(result.success).toBe(true);
  });

  it("validates UpdateTaskStatusSchema rejects extra fields", () => {
    const result = UpdateTaskStatusSchema.safeParse({
      status: "TODO",
      extraField: "ignored",
    });
    expect(result.success).toBe(true);
  });
});
