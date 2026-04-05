// =============================================================================
// Tests — fn-tasks (Kanban Task Board API)
// =============================================================================
// Unit tests for listTasks, createTask, and updateTaskStatus handlers.
// Cosmos DB is mocked to test business logic in isolation.
// =============================================================================

import type { HttpRequest, InvocationContext } from "@azure/functions";
import { TaskSchema, CreateTaskSchema, UpdateTaskStatusSchema } from "@branded/schemas";

// ---------------------------------------------------------------------------
// Mocks — Cosmos DB
// ---------------------------------------------------------------------------

const mockFetchAll = jest.fn();
const mockCreate = jest.fn();
const mockRead = jest.fn();
const mockReplace = jest.fn();

jest.mock("@azure/cosmos", () => ({
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
  // Re-export as needed
  Container: jest.fn(),
}));

jest.mock("@azure/identity", () => ({
  DefaultAzureCredential: jest.fn(),
}));

// Set env vars before importing handlers (lazy init reads these)
process.env.COSMOSDB_ENDPOINT = "https://cosmos-test.documents.azure.com:443/";
process.env.COSMOSDB_DATABASE_NAME = "test-db";
process.env.MAX_TASKS_PER_WORKSPACE = "500";

// Import handlers AFTER mocks are set up
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
    body?: unknown;
    params?: Record<string, string>;
    queryParams?: Record<string, string>;
  } = {},
): HttpRequest {
  const { body, params = {}, queryParams = {} } = overrides;
  return {
    query: new Map(Object.entries(queryParams)),
    params,
    json: body !== undefined
      ? jest.fn().mockResolvedValue(body)
      : jest.fn().mockRejectedValue(new Error("No body")),
  } as unknown as HttpRequest;
}

// ---------------------------------------------------------------------------
// GET /api/tasks — listTasks
// ---------------------------------------------------------------------------

describe("fn-tasks — listTasks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with an array of tasks", async () => {
    const mockTasks = [
      {
        id: "task-1",
        workspaceId: "default",
        title: "Test Task",
        status: "TODO",
        createdAt: "2026-04-05T00:00:00.000Z",
        updatedAt: "2026-04-05T00:00:00.000Z",
      },
    ];
    mockFetchAll.mockResolvedValue({ resources: mockTasks });

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual(mockTasks);
  });

  it("returns 200 with empty array when no tasks exist", async () => {
    mockFetchAll.mockResolvedValue({ resources: [] });

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual([]);
  });

  it("returns 500 when Cosmos DB query fails", async () => {
    mockFetchAll.mockRejectedValue(new Error("Cosmos down"));

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody).toMatchObject({ error: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks — createTask
// ---------------------------------------------------------------------------

describe("fn-tasks — createTask", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 201 with the created task when input is valid", async () => {
    // Count query returns 0 tasks
    mockFetchAll.mockResolvedValue({ resources: [0] });
    mockCreate.mockResolvedValue({});

    const req = createMockRequest({ body: { title: "New Task" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(201);
    expect(result.jsonBody).toBeDefined();

    const parsed = TaskSchema.safeParse(result.jsonBody);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.title).toBe("New Task");
      expect(parsed.data.status).toBe("TODO");
      expect(parsed.data.workspaceId).toBe("default");
    }
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = {
      query: new Map(),
      params: {},
      json: jest.fn().mockRejectedValue(new Error("bad json")),
    } as unknown as HttpRequest;
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 when title is missing", async () => {
    const req = createMockRequest({ body: {} });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 when title is empty string", async () => {
    const req = createMockRequest({ body: { title: "" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 when title exceeds 200 characters", async () => {
    const longTitle = "a".repeat(201);
    const req = createMockRequest({ body: { title: longTitle } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 429 when workspace task limit is exceeded", async () => {
    // Count query returns 500 (at limit)
    mockFetchAll.mockResolvedValue({ resources: [500] });

    const req = createMockRequest({ body: { title: "Over Limit" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(429);
    expect(result.jsonBody).toMatchObject({ error: "RATE_LIMITED" });
  });

  it("allows creation when count is below limit", async () => {
    mockFetchAll.mockResolvedValue({ resources: [499] });
    mockCreate.mockResolvedValue({});

    const req = createMockRequest({ body: { title: "Under Limit" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(201);
  });

  it("returns 500 when Cosmos DB create fails", async () => {
    mockFetchAll.mockResolvedValue({ resources: [0] });
    mockCreate.mockRejectedValue(new Error("Cosmos write failed"));

    const req = createMockRequest({ body: { title: "Fail Task" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody).toMatchObject({ error: "SERVER_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/tasks/{id}/status — updateTaskStatus
// ---------------------------------------------------------------------------

describe("fn-tasks — updateTaskStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const existingTask = {
    id: "task-123",
    workspaceId: "default",
    title: "Existing Task",
    status: "TODO",
    createdAt: "2026-04-05T00:00:00.000Z",
    updatedAt: "2026-04-05T00:00:00.000Z",
  };

  it("returns 200 with updated task when status change is valid", async () => {
    mockRead.mockResolvedValue({ resource: { ...existingTask } });
    mockReplace.mockResolvedValue({});

    const req = createMockRequest({
      body: { status: "IN_PROGRESS" },
      params: { id: "task-123" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toMatchObject({
      id: "task-123",
      status: "IN_PROGRESS",
    });
    // updatedAt should be different from original
    expect(result.jsonBody.updatedAt).not.toBe(existingTask.updatedAt);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = {
      query: new Map(),
      params: { id: "task-123" },
      json: jest.fn().mockRejectedValue(new Error("bad json")),
    } as unknown as HttpRequest;
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 for invalid status value", async () => {
    const req = createMockRequest({
      body: { status: "INVALID_STATUS" },
      params: { id: "task-123" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 400 when status field is missing", async () => {
    const req = createMockRequest({
      body: {},
      params: { id: "task-123" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 404 when task does not exist", async () => {
    mockRead.mockResolvedValue({ resource: undefined });

    const req = createMockRequest({
      body: { status: "DONE" },
      params: { id: "nonexistent" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(404);
    expect(result.jsonBody).toMatchObject({ error: "NOT_FOUND" });
  });

  it("returns 404 when Cosmos DB throws 404 error", async () => {
    const cosmosError = new Error("Not Found");
    (cosmosError as unknown as { code: number }).code = 404;
    mockRead.mockRejectedValue(cosmosError);

    const req = createMockRequest({
      body: { status: "DONE" },
      params: { id: "missing" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(404);
    expect(result.jsonBody).toMatchObject({ error: "NOT_FOUND" });
  });

  it("returns 500 when Cosmos DB replace fails", async () => {
    mockRead.mockResolvedValue({ resource: { ...existingTask } });
    mockReplace.mockRejectedValue(new Error("Replace failed"));

    const req = createMockRequest({
      body: { status: "DONE" },
      params: { id: "task-123" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody).toMatchObject({ error: "SERVER_ERROR" });
  });

  it("allows all valid status transitions", async () => {
    for (const status of ["TODO", "IN_PROGRESS", "DONE"] as const) {
      mockRead.mockResolvedValue({ resource: { ...existingTask } });
      mockReplace.mockResolvedValue({});

      const req = createMockRequest({
        body: { status },
        params: { id: "task-123" },
      });
      const ctx = createMockContext();
      const result = await updateTaskStatus(req, ctx);

      expect(result.status).toBe(200);
      expect(result.jsonBody.status).toBe(status);
    }
  });
});
