// =============================================================================
// Tests — fn-audit (Audit Log Endpoints)
// =============================================================================
// Unit tests with mocked @azure/cosmos and @azure/identity.
// Covers: POST valid→201, POST invalid→400, POST Cosmos error→500,
//         GET items→200, GET empty→200, GET error→500.
// =============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { HttpRequest, InvocationContext } from "@azure/functions";
import { AuditLogSchema } from "@branded/schemas";

// ---------------------------------------------------------------------------
// Mocks — must be defined before importing the module under test
// ---------------------------------------------------------------------------

const mockCreate = jest.fn();
const mockFetchAll = jest.fn();
const mockQuery = jest.fn(() => ({ fetchAll: mockFetchAll }));

jest.mock("@azure/cosmos", () => ({
  CosmosClient: jest.fn().mockImplementation(() => ({
    database: () => ({
      container: () => ({
        items: {
          create: mockCreate,
          query: mockQuery,
        },
      }),
    }),
  })),
  // Re-export Container type (not used at runtime but keeps TS happy)
  Container: jest.fn(),
}));

jest.mock("@azure/identity", () => ({
  DefaultAzureCredential: jest.fn(),
}));

jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return {
    ...actual,
    randomUUID: () => "550e8400-e29b-41d4-a716-446655440000",
  };
});

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks
// ---------------------------------------------------------------------------

import auditHandler from "../fn-audit";

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
  method: string,
  body: unknown | null = null,
): HttpRequest {
  return {
    method,
    query: new URLSearchParams(),
    json:
      body === null
        ? jest.fn().mockRejectedValue(new Error("Invalid JSON"))
        : jest.fn().mockResolvedValue(body),
  } as unknown as HttpRequest;
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe("fn-audit", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      COSMOS_ENDPOINT: "https://cosmos-test.documents.azure.com:443/",
    };
    mockCreate.mockResolvedValue({ resource: {} });
    mockFetchAll.mockResolvedValue({ resources: [] });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // =========================================================================
  // POST /audit
  // =========================================================================

  describe("POST /audit", () => {
    it("returns 201 with audit log on valid input", async () => {
      const req = createMockRequest("POST", {
        userId: "demo",
        action: "USER_LOGIN",
      });
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(201);
      expect(result.jsonBody).toMatchObject({
        id: "550e8400-e29b-41d4-a716-446655440000",
        userId: "demo",
        action: "USER_LOGIN",
      });
      expect(result.jsonBody.timestamp).toBeDefined();

      // Validate the response against the AuditLogSchema
      expect(() => AuditLogSchema.parse(result.jsonBody)).not.toThrow();

      // Verify Cosmos DB create was called
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "550e8400-e29b-41d4-a716-446655440000",
          userId: "demo",
          action: "USER_LOGIN",
        }),
      );
    });

    it("returns 400 on invalid JSON body", async () => {
      const req = createMockRequest("POST", null);
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(400);
      expect(result.jsonBody).toEqual({
        error: "INVALID_INPUT",
        message: "Invalid JSON body.",
      });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns 400 when userId is missing", async () => {
      const req = createMockRequest("POST", { action: "USER_LOGIN" });
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(400);
      expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns 400 when action is missing", async () => {
      const req = createMockRequest("POST", { userId: "demo" });
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(400);
      expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns 400 when userId is empty", async () => {
      const req = createMockRequest("POST", {
        userId: "",
        action: "USER_LOGIN",
      });
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(400);
      expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
    });

    it("returns 400 when action is empty", async () => {
      const req = createMockRequest("POST", { userId: "demo", action: "" });
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(400);
      expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
    });

    it("returns 400 when body is empty object", async () => {
      const req = createMockRequest("POST", {});
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(400);
      expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
    });

    it("returns 400 when userId exceeds max length", async () => {
      const req = createMockRequest("POST", {
        userId: "a".repeat(257),
        action: "USER_LOGIN",
      });
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(400);
      expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
      expect(result.jsonBody.message).toContain("256 characters");
    });

    it("returns 400 when action exceeds max length", async () => {
      const req = createMockRequest("POST", {
        userId: "demo",
        action: "a".repeat(257),
      });
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(400);
      expect(result.jsonBody).toMatchObject({ error: "INVALID_INPUT" });
      expect(result.jsonBody.message).toContain("256 characters");
    });

    it("returns 500 when Cosmos DB create fails", async () => {
      mockCreate.mockRejectedValue(new Error("Cosmos DB unavailable"));
      const req = createMockRequest("POST", {
        userId: "demo",
        action: "USER_LOGIN",
      });
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(500);
      expect(result.jsonBody).toEqual({
        error: "SERVER_ERROR",
        message: "Failed to record audit event.",
      });
      expect(ctx.error).toHaveBeenCalled();
    });

    it("strips extra fields from input", async () => {
      const req = createMockRequest("POST", {
        userId: "demo",
        action: "USER_LOGIN",
        extra: "field",
        id: "should-be-ignored",
        timestamp: "should-be-ignored",
      });
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(201);
      expect(result.jsonBody.id).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result.jsonBody).not.toHaveProperty("extra");
    });
  });

  // =========================================================================
  // GET /audit
  // =========================================================================

  describe("GET /audit", () => {
    it("returns 200 with audit logs", async () => {
      const mockLogs = [
        {
          id: "550e8400-e29b-41d4-a716-446655440000",
          userId: "demo",
          action: "USER_LOGIN",
          timestamp: "2026-04-01T12:00:00.000Z",
        },
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          userId: "admin",
          action: "VIEW_PROFILE",
          timestamp: "2026-04-01T11:00:00.000Z",
        },
      ];
      mockFetchAll.mockResolvedValue({ resources: mockLogs });

      const req = createMockRequest("GET");
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(200);
      expect(result.jsonBody).toHaveLength(2);
      expect(result.jsonBody[0]).toEqual(mockLogs[0]);
      expect(result.jsonBody[1]).toEqual(mockLogs[1]);

      // Validate each record against schema
      for (const log of result.jsonBody as any[]) {
        expect(() => AuditLogSchema.parse(log)).not.toThrow();
      }

      // Verify correct query was used
      expect(mockQuery).toHaveBeenCalledWith(
        "SELECT TOP 50 * FROM c ORDER BY c.timestamp DESC",
      );
    });

    it("returns 200 with empty array when no logs exist", async () => {
      mockFetchAll.mockResolvedValue({ resources: [] });

      const req = createMockRequest("GET");
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(200);
      expect(result.jsonBody).toEqual([]);
    });

    it("returns 500 when Cosmos DB query fails", async () => {
      mockFetchAll.mockRejectedValue(new Error("Cosmos DB unavailable"));

      const req = createMockRequest("GET");
      const ctx = createMockContext();

      const result = await auditHandler(req, ctx);

      expect(result.status).toBe(500);
      expect(result.jsonBody).toEqual({
        error: "SERVER_ERROR",
        message: "Failed to retrieve audit events.",
      });
      expect(ctx.error).toHaveBeenCalled();
    });
  });
});
