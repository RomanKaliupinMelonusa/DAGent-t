// =============================================================================
// Tests — fn-tasks (Kanban Task Board API)
// =============================================================================
// Unit tests for list, create, and update-status handlers.
// Mocks Cosmos DB client for isolated testing.
// =============================================================================

import type { HttpRequest, InvocationContext } from "@azure/functions";
import {
  TaskSchema,
  CreateTaskSchema,
  UpdateTaskStatusSchema,
} from "@branded/schemas";

// ---------------------------------------------------------------------------
// Cosmos DB Mock — must be set up BEFORE importing fn-tasks
// ---------------------------------------------------------------------------

const mockFetchAll = jest.fn();
const mockCreate = jest.fn();
const mockRead = jest.fn();
const mockReplace = jest.fn();

const mockItem = jest.fn().mockReturnValue({
  read: mockRead,
  replace: mockReplace,
});

const mockQuery = jest.fn().mockReturnValue({ fetchAll: mockFetchAll });

jest.mock("@azure/cosmos", () => ({
  CosmosClient: jest.fn().mockImplementation(() => ({
    database: () => ({
      container: () => ({
        items: {
          query: mockQuery,
          create: mockCreate,
        },
        item: mockItem,
      }),
    }),
  })),
  Container: jest.fn(),
}));

jest.mock("@azure/identity", () => ({
  DefaultAzureCredential: jest.fn(),
}));

// Set env vars before importing the module
process.env.COSMOSDB_ENDPOINT = "https://test-cosmos.documents.azure.com:443/";
process.env.COSMOSDB_DATABASE_NAME = "test-db";
process.env.MAX_TASKS_PER_WORKSPACE = "500";

// Now import the handlers
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
    queryParams?: Record<string, string>;
    body?: unknown;
    params?: Record<string, string>;
  } = {},
): HttpRequest {
  return {
    query: new Map(Object.entries(overrides.queryParams ?? {})),
    params: overrides.params ?? {},
    json: overrides.body !== undefined
      ? jest.fn().mockResolvedValue(overrides.body)
      : jest.fn().mockRejectedValue(new Error("No body")),
  } as unknown as HttpRequest;
}

const SAMPLE_TASK = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  workspaceId: "default",
  title: "Test task",
  status: "TODO" as const,
  createdAt: "2026-04-01T12:00:00.000Z",
  updatedAt: "2026-04-01T12:00:00.000Z",
};

// ---------------------------------------------------------------------------
// Reset mocks before each test
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  process.env.MAX_TASKS_PER_WORKSPACE = "500";
});

// ---------------------------------------------------------------------------
// GET /api/tasks — listTasks
// ---------------------------------------------------------------------------

describe("GET /api/tasks — listTasks", () => {
  it("returns 200 with an array of tasks", async () => {
    mockFetchAll.mockResolvedValueOnce({ resources: [SAMPLE_TASK] });

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(200);
    expect(Array.isArray(result.jsonBody)).toBe(true);
    expect(result.jsonBody).toHaveLength(1);
    expect(result.jsonBody[0].title).toBe("Test task");
  });

  it("returns 200 with empty array when no tasks exist", async () => {
    mockFetchAll.mockResolvedValueOnce({ resources: [] });

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual([]);
  });

  it("returns 500 on Cosmos error", async () => {
    mockFetchAll.mockRejectedValueOnce(new Error("Cosmos error"));

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody).toMatchObject({ error: "INTERNAL_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks — createTask
// ---------------------------------------------------------------------------

describe("POST /api/tasks — createTask", () => {
  it("returns 201 with created task on valid input", async () => {
    // Mock count query
    mockFetchAll.mockResolvedValueOnce({ resources: [10] });
    // Mock create
    mockCreate.mockResolvedValueOnce({
      resource: { ...SAMPLE_TASK, title: "New task" },
    });

    const req = createMockRequest({ body: { title: "New task" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(201);
    expect(result.jsonBody).toBeDefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Verify the created task has required fields
    const createdArg = mockCreate.mock.calls[0][0];
    expect(createdArg.title).toBe("New task");
    expect(createdArg.workspaceId).toBe("default");
    expect(createdArg.status).toBe("TODO");
    expect(createdArg.id).toBeDefined();
    expect(createdArg.createdAt).toBeDefined();
    expect(createdArg.updatedAt).toBeDefined();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = createMockRequest(); // no body — json() rejects
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({
      error: "INVALID_INPUT",
      message: "Invalid JSON body.",
    });
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
    const req = createMockRequest({ body: { title: "a".repeat(201) } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 429 when workspace task limit is exceeded", async () => {
    // Mock count returning at the limit
    mockFetchAll.mockResolvedValueOnce({ resources: [500] });

    const req = createMockRequest({ body: { title: "Over limit" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(429);
    expect(result.jsonBody).toMatchObject({ error: "LIMIT_EXCEEDED" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("respects custom MAX_TASKS_PER_WORKSPACE", async () => {
    process.env.MAX_TASKS_PER_WORKSPACE = "5";
    mockFetchAll.mockResolvedValueOnce({ resources: [5] });

    const req = createMockRequest({ body: { title: "Over custom limit" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(429);
    expect(result.jsonBody).toMatchObject({ error: "LIMIT_EXCEEDED" });
  });

  it("returns 500 on Cosmos error during create", async () => {
    mockFetchAll.mockResolvedValueOnce({ resources: [0] });
    mockCreate.mockRejectedValueOnce(new Error("Cosmos write error"));

    const req = createMockRequest({ body: { title: "Failing task" } });
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody).toMatchObject({ error: "INTERNAL_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/tasks/{id}/status — updateTaskStatus
// ---------------------------------------------------------------------------

describe("PATCH /api/tasks/{id}/status — updateTaskStatus", () => {
  it("returns 200 with updated task on valid status transition", async () => {
    const existingTask = { ...SAMPLE_TASK };
    mockRead.mockResolvedValueOnce({ resource: existingTask });
    mockReplace.mockResolvedValueOnce({
      resource: { ...existingTask, status: "IN_PROGRESS" },
    });

    const req = createMockRequest({
      params: { id: SAMPLE_TASK.id },
      body: { status: "IN_PROGRESS" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toMatchObject({ status: "IN_PROGRESS" });
    expect(mockItem).toHaveBeenCalledWith(SAMPLE_TASK.id, "default");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = createMockRequest({ params: { id: SAMPLE_TASK.id } }); // no body
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({
      error: "INVALID_INPUT",
      message: "Invalid JSON body.",
    });
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

  it("returns 400 when status is missing from body", async () => {
    const req = createMockRequest({
      params: { id: SAMPLE_TASK.id },
      body: {},
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });

  it("returns 404 when task does not exist (null resource)", async () => {
    mockRead.mockResolvedValueOnce({ resource: undefined });

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
    const cosmosError = Object.assign(new Error("Not found"), { code: 404 });
    mockRead.mockRejectedValueOnce(cosmosError);

    const req = createMockRequest({
      params: { id: "nonexistent-id" },
      body: { status: "DONE" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(404);
    expect(result.jsonBody).toMatchObject({ error: "NOT_FOUND" });
  });

  it("returns 500 on unexpected Cosmos error", async () => {
    mockRead.mockRejectedValueOnce(new Error("Unexpected error"));

    const req = createMockRequest({
      params: { id: SAMPLE_TASK.id },
      body: { status: "DONE" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody).toMatchObject({ error: "INTERNAL_ERROR" });
  });

  it("returns 400 when task ID is missing", async () => {
    const req = createMockRequest({
      params: {},
      body: { status: "DONE" },
    });
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
  });
});
