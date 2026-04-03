// =============================================================================
// Tests — fn-webhooks (Webhook Dispatcher Endpoints)
// =============================================================================

import { createWebhook, listWebhooks } from "../fn-webhooks";
import type { HttpRequest, InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUpsert = jest.fn().mockResolvedValue({ resource: {} });
const mockFetchAll = jest.fn().mockResolvedValue({ resources: [] });
const mockQuery = jest.fn().mockReturnValue({ fetchAll: mockFetchAll });

jest.mock("@azure/cosmos", () => ({
  CosmosClient: jest.fn().mockImplementation(() => ({
    database: () => ({
      container: () => ({
        items: {
          upsert: mockUpsert,
          query: mockQuery,
        },
      }),
    }),
  })),
}));

jest.mock("@azure/identity", () => ({
  DefaultAzureCredential: jest.fn(),
}));

// Set COSMOSDB_ENDPOINT so the lazy init doesn't throw
process.env.COSMOSDB_ENDPOINT = "https://test-cosmos.documents.azure.com:443/";

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

function createMockRequest(options: {
  method?: string;
  body?: unknown;
  queryParams?: Record<string, string>;
}): HttpRequest {
  const { method = "GET", body, queryParams = {} } = options;
  return {
    method,
    query: new Map(Object.entries(queryParams)),
    json: body !== undefined
      ? jest.fn().mockResolvedValue(body)
      : jest.fn().mockRejectedValue(new Error("No body")),
  } as unknown as HttpRequest;
}

// ---------------------------------------------------------------------------
// POST /api/webhooks — createWebhook
// ---------------------------------------------------------------------------

describe("fn-webhooks POST (createWebhook)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue({ resource: {} });
  });

  it("returns 201 with valid body", async () => {
    const req = createMockRequest({
      method: "POST",
      body: { url: "https://example.com/hook", workspaceId: "ws-1" },
    });
    const ctx = createMockContext();

    const result = await createWebhook(req, ctx);

    expect(result.status).toBe(201);
    expect(result.jsonBody).toMatchObject({
      url: "https://example.com/hook",
      workspaceId: "ws-1",
    });
    expect(result.jsonBody.id).toBeDefined();
    expect(result.jsonBody.createdAt).toBeDefined();
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when body is not valid JSON", async () => {
    const req = createMockRequest({ method: "POST" }); // no body → json() rejects
    const ctx = createMockContext();

    const result = await createWebhook(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody.error).toBe("INVALID_INPUT");
    expect(result.jsonBody.message).toContain("valid JSON");
  });

  it("returns 400 when url is missing", async () => {
    const req = createMockRequest({
      method: "POST",
      body: { workspaceId: "ws-1" },
    });
    const ctx = createMockContext();

    const result = await createWebhook(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody.error).toBe("INVALID_INPUT");
    expect(result.jsonBody.message).toContain("Validation failed");
  });

  it("returns 400 when workspaceId is missing", async () => {
    const req = createMockRequest({
      method: "POST",
      body: { url: "https://example.com/hook" },
    });
    const ctx = createMockContext();

    const result = await createWebhook(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody.error).toBe("INVALID_INPUT");
  });

  it("returns 400 when url is not a valid URL", async () => {
    const req = createMockRequest({
      method: "POST",
      body: { url: "not-a-url", workspaceId: "ws-1" },
    });
    const ctx = createMockContext();

    const result = await createWebhook(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody.error).toBe("INVALID_INPUT");
  });

  it("returns 400 when body is empty object", async () => {
    const req = createMockRequest({
      method: "POST",
      body: {},
    });
    const ctx = createMockContext();

    const result = await createWebhook(req, ctx);

    expect(result.status).toBe(400);
    expect(result.jsonBody.error).toBe("INVALID_INPUT");
  });

  it("returns 500 when Cosmos DB upsert fails", async () => {
    mockUpsert.mockRejectedValueOnce(new Error("Cosmos DB down"));
    const req = createMockRequest({
      method: "POST",
      body: { url: "https://example.com/hook", workspaceId: "ws-1" },
    });
    const ctx = createMockContext();

    const result = await createWebhook(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody.error).toBe("INTERNAL_ERROR");
  });

  it("logs webhook creation on success", async () => {
    const req = createMockRequest({
      method: "POST",
      body: { url: "https://example.com/hook", workspaceId: "ws-1" },
    });
    const ctx = createMockContext();

    await createWebhook(req, ctx);

    expect(ctx.log).toHaveBeenCalledWith("POST /api/webhooks called");
    expect(ctx.log).toHaveBeenCalledWith(
      expect.stringContaining("Webhook created:"),
    );
  });
});

// ---------------------------------------------------------------------------
// GET /api/webhooks — listWebhooks
// ---------------------------------------------------------------------------

describe("fn-webhooks GET (listWebhooks)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with empty webhooks array", async () => {
    mockFetchAll.mockResolvedValueOnce({ resources: [] });
    const req = createMockRequest({ queryParams: {} });
    const ctx = createMockContext();

    const result = await listWebhooks(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual({ webhooks: [] });
  });

  it("returns 200 with webhooks from Cosmos DB", async () => {
    const webhooks = [
      {
        id: "abc-123",
        workspaceId: "ws-1",
        url: "https://example.com/hook",
        createdAt: "2026-04-03T00:00:00.000Z",
      },
    ];
    mockFetchAll.mockResolvedValueOnce({ resources: webhooks });
    const req = createMockRequest({ queryParams: {} });
    const ctx = createMockContext();

    const result = await listWebhooks(req, ctx);

    expect(result.status).toBe(200);
    expect(result.jsonBody).toEqual({ webhooks });
  });

  it("passes workspaceId filter to Cosmos DB query", async () => {
    mockFetchAll.mockResolvedValueOnce({ resources: [] });
    const req = createMockRequest({
      queryParams: { workspaceId: "ws-42" },
    });
    const ctx = createMockContext();

    await listWebhooks(req, ctx);

    expect(mockQuery).toHaveBeenCalledWith({
      query: "SELECT * FROM c WHERE c.workspaceId = @workspaceId",
      parameters: [{ name: "@workspaceId", value: "ws-42" }],
    });
  });

  it("queries all documents when no workspaceId provided", async () => {
    mockFetchAll.mockResolvedValueOnce({ resources: [] });
    const req = createMockRequest({ queryParams: {} });
    const ctx = createMockContext();

    await listWebhooks(req, ctx);

    expect(mockQuery).toHaveBeenCalledWith({
      query: "SELECT * FROM c",
    });
  });

  it("returns 500 when Cosmos DB query fails", async () => {
    mockFetchAll.mockRejectedValueOnce(new Error("Cosmos DB down"));
    const req = createMockRequest({ queryParams: {} });
    const ctx = createMockContext();

    const result = await listWebhooks(req, ctx);

    expect(result.status).toBe(500);
    expect(result.jsonBody.error).toBe("INTERNAL_ERROR");
  });

  it("logs the request", async () => {
    mockFetchAll.mockResolvedValueOnce({ resources: [] });
    const req = createMockRequest({ queryParams: {} });
    const ctx = createMockContext();

    await listWebhooks(req, ctx);

    expect(ctx.log).toHaveBeenCalledWith("GET /api/webhooks called");
  });
});
