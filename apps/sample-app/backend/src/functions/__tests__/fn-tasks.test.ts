// =============================================================================
// Tests — fn-tasks (Kanban Task Board API)
// =============================================================================
// Unit tests for all three task endpoints: list, create, update-status.
// Cosmos DB is mocked to isolate business logic.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HttpRequest, InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks — Must be set up BEFORE importing the module under test
// ---------------------------------------------------------------------------

const mockFetchAll = jest.fn();
const mockCreate = jest.fn();
const mockRead = jest.fn();
const mockReplace = jest.fn();

jest.mock("@azure/identity", () => ({
  DefaultAzureCredential: jest.fn(),
}));

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
  Container: jest.fn(),
}));

// Set env vars before import
process.env.COSMOSDB_ENDPOINT = "https://test-cosmos.documents.azure.com:443/";
process.env.COSMOSDB_DATABASE_NAME = "test-db";
process.env.MAX_TASKS_PER_WORKSPACE = "500";

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

function createMockRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    query: new Map(),
    params: {},
    ...overrides,
  } as unknown as HttpRequest;
}

// ---------------------------------------------------------------------------
// GET /api/tasks — listTasks
// ---------------------------------------------------------------------------

describe("fn-tasks: GET /api/tasks (listTasks)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with task list", async () => {
    const tasks = [
      {
        id: "abc-123",
        workspaceId: "default",
        title: "Test task",
        status: "TODO",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    mockFetchAll.mockResolvedValue({ resources: tasks });

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual(tasks);
  });

  it("returns 200 with empty array when no tasks exist", async () => {
    mockFetchAll.mockResolvedValue({ resources: [] });

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual([]);
  });

  it("returns 500 on Cosmos DB error", async () => {
    mockFetchAll.mockRejectedValue(new Error("Cosmos connection failed"));

    const req = createMockRequest();
    const ctx = createMockContext();
    const result = await listTasks(req, ctx);

    expect(result.status).toBe(500);
    expect((result.jsonBody as any).error).toBe("INTERNAL_ERROR");
  });
});

// ---------------------------------------------------------------------------
// POST /api/tasks — createTask
// ---------------------------------------------------------------------------

describe("fn-tasks: POST /api/tasks (createTask)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 201 with created task", async () => {
    mockFetchAll.mockResolvedValue({ resources: [0] }); // count = 0
    mockCreate.mockResolvedValue({ resource: {} });

    const req = createMockRequest({
      json: jest.fn().mockResolvedValue({ title: "New task" }),
    } as any);
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(201);
    const body = result.jsonBody as any;
    expect(body.title).toBe("New task");
    expect(body.status).toBe("TODO");
    expect(body.workspaceId).toBe("default");
    expect(body.id).toBeDefined();
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = createMockRequest({
      json: jest.fn().mockRejectedValue(new Error("Invalid JSON")),
    } as any);
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect((result.jsonBody as any).error).toBe("INVALID_INPUT");
    expect((result.jsonBody as any).message).toBe("Invalid JSON body.");
  });

  it("returns 400 for empty title", async () => {
    const req = createMockRequest({
      json: jest.fn().mockResolvedValue({ title: "" }),
    } as any);
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect((result.jsonBody as any).error).toBe("INVALID_INPUT");
  });

  it("returns 400 for title exceeding 200 characters", async () => {
    const longTitle = "a".repeat(201);
    const req = createMockRequest({
      json: jest.fn().mockResolvedValue({ title: longTitle }),
    } as any);
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect((result.jsonBody as any).error).toBe("INVALID_INPUT");
  });

  it("returns 400 for missing title field", async () => {
    const req = createMockRequest({
      json: jest.fn().mockResolvedValue({}),
    } as any);
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(400);
    expect((result.jsonBody as any).error).toBe("INVALID_INPUT");
  });

  it("returns 429 when workspace task limit is reached", async () => {
    mockFetchAll.mockResolvedValue({ resources: [500] }); // count = 500 (at limit)

    const req = createMockRequest({
      json: jest.fn().mockResolvedValue({ title: "One more task" }),
    } as any);
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(429);
    expect((result.jsonBody as any).error).toBe("LIMIT_EXCEEDED");
    expect((result.jsonBody as any).message).toContain("500");
  });

  it("allows creation when under workspace task limit", async () => {
    mockFetchAll.mockResolvedValue({ resources: [499] }); // count = 499 (under limit)
    mockCreate.mockResolvedValue({ resource: {} });

    const req = createMockRequest({
      json: jest.fn().mockResolvedValue({ title: "Under limit task" }),
    } as any);
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(201);
  });

  it("returns 500 on Cosmos DB error during creation", async () => {
    mockFetchAll.mockResolvedValue({ resources: [0] });
    mockCreate.mockRejectedValue(new Error("Cosmos write failed"));

    const req = createMockRequest({
      json: jest.fn().mockResolvedValue({ title: "Failing task" }),
    } as any);
    const ctx = createMockContext();
    const result = await createTask(req, ctx);

    expect(result.status).toBe(500);
    expect((result.jsonBody as any).error).toBe("INTERNAL_ERROR");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/tasks/{id}/status — updateTaskStatus
// ---------------------------------------------------------------------------

describe("fn-tasks: PATCH /api/tasks/{id}/status (updateTaskStatus)", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 200 with updated task", async () => {
    const existing = {
      id: "task-1",
      workspaceId: "default",
      title: "Test task",
      status: "TODO",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockRead.mockResolvedValue({ resource: existing });
    mockReplace.mockResolvedValue({ resource: {} });

    const req = createMockRequest({
      params: { id: "task-1" },
      json: jest.fn().mockResolvedValue({ status: "IN_PROGRESS" }),
    } as any);
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(200);
    const body = result.jsonBody as any;
    expect(body.status).toBe("IN_PROGRESS");
    expect(body.id).toBe("task-1");
    expect(body.updatedAt).not.toBe(existing.updatedAt);
  });

  it("returns 404 when task does not exist", async () => {
    mockRead.mockResolvedValue({ resource: undefined });

    const req = createMockRequest({
      params: { id: "nonexistent" },
      json: jest.fn().mockResolvedValue({ status: "DONE" }),
    } as any);
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(404);
    expect((result.jsonBody as any).error).toBe("NOT_FOUND");
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = createMockRequest({
      params: { id: "task-1" },
      json: jest.fn().mockRejectedValue(new Error("Invalid JSON")),
    } as any);
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect((result.jsonBody as any).error).toBe("INVALID_INPUT");
    expect((result.jsonBody as any).message).toBe("Invalid JSON body.");
  });

  it("returns 400 for invalid status value", async () => {
    const req = createMockRequest({
      params: { id: "task-1" },
      json: jest.fn().mockResolvedValue({ status: "INVALID_STATUS" }),
    } as any);
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect((result.jsonBody as any).error).toBe("INVALID_INPUT");
  });

  it("returns 400 for missing status field", async () => {
    const req = createMockRequest({
      params: { id: "task-1" },
      json: jest.fn().mockResolvedValue({}),
    } as any);
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect((result.jsonBody as any).error).toBe("INVALID_INPUT");
  });

  it("returns 400 for missing task ID", async () => {
    const req = createMockRequest({
      params: {},
      json: jest.fn().mockResolvedValue({ status: "DONE" }),
    } as any);
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(400);
    expect((result.jsonBody as any).error).toBe("INVALID_INPUT");
    expect((result.jsonBody as any).message).toBe("Missing task ID.");
  });

  it("returns 404 on Cosmos 404 error during replace", async () => {
    const existing = {
      id: "task-1",
      workspaceId: "default",
      title: "Test task",
      status: "TODO",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockRead.mockResolvedValue({ resource: existing });
    mockReplace.mockRejectedValue({ code: 404 });

    const req = createMockRequest({
      params: { id: "task-1" },
      json: jest.fn().mockResolvedValue({ status: "IN_PROGRESS" }),
    } as any);
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(404);
    expect((result.jsonBody as any).error).toBe("NOT_FOUND");
  });

  it("returns 500 on non-404 Cosmos error", async () => {
    const existing = {
      id: "task-1",
      workspaceId: "default",
      title: "Test task",
      status: "TODO",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    mockRead.mockResolvedValue({ resource: existing });
    mockReplace.mockRejectedValue(new Error("Cosmos write failed"));

    const req = createMockRequest({
      params: { id: "task-1" },
      json: jest.fn().mockResolvedValue({ status: "DONE" }),
    } as any);
    const ctx = createMockContext();
    const result = await updateTaskStatus(req, ctx);

    expect(result.status).toBe(500);
    expect((result.jsonBody as any).error).toBe("INTERNAL_ERROR");
  });
});
