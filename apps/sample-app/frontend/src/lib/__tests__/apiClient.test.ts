// =============================================================================
// Unit Tests — apiClient.ts
// =============================================================================

// ---------------------------------------------------------------------------
// Mock authConfig to prevent MSAL from loading in test environment
// ---------------------------------------------------------------------------

jest.mock("../authConfig", () => ({
  msalInstance: {
    getActiveAccount: () => null,
    acquireTokenSilent: jest.fn(),
    acquireTokenRedirect: jest.fn(),
  },
  loginRequest: { scopes: [] },
}));

// ---------------------------------------------------------------------------
// Mock sessionStorage for getDemoToken
// ---------------------------------------------------------------------------

const mockSessionStorage: Record<string, string> = {};
Object.defineProperty(globalThis, "sessionStorage", {
  value: {
    getItem: (key: string) => mockSessionStorage[key] ?? null,
    setItem: (key: string, val: string) => {
      mockSessionStorage[key] = val;
    },
    removeItem: (key: string) => {
      delete mockSessionStorage[key];
    },
  },
  writable: true,
});

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  // Set a demo token in sessionStorage
  mockSessionStorage["demo_auth"] = JSON.stringify({
    token: "test-token-123",
    displayName: "Test User",
  });
});

// ---------------------------------------------------------------------------
// Helper: load apiClient in demo mode with isolated module scope
// ---------------------------------------------------------------------------

async function loadDemoApiClient() {
  // Ensure env var is set before module evaluation
  process.env.NEXT_PUBLIC_AUTH_MODE = "demo";
  process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:7071/api";

  // Dynamic import to get fresh module with current env
  const mod = await import("../apiClient");
  return mod;
}

// Import types for test assertions (these are type-only, no runtime side effects)
import type { ApiErrorCode } from "../apiClient";
import { HelloResponseSchema } from "@branded/schemas";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("apiFetch", () => {
  it("makes authenticated request with X-Demo-Token header", async () => {
    const { apiFetch } = await loadDemoApiClient();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "Hello!", timestamp: "2026-03-24T00:00:00.000Z" }),
    });

    await apiFetch("/hello");

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:7071/api/hello",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Demo-Token": "test-token-123",
        }),
      }),
    );
  });

  it("returns parsed JSON on success", async () => {
    const { apiFetch } = await loadDemoApiClient();
    const payload = { message: "Hello!", timestamp: "2026-03-24T00:00:00.000Z" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => payload,
    });

    const result = await apiFetch("/hello");
    expect(result).toEqual(payload);
  });

  it("validates response with Zod schema when provided", async () => {
    const { apiFetch } = await loadDemoApiClient();
    const payload = { message: "Hello!", timestamp: "2026-03-24T00:00:00.000Z" };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => payload,
    });

    const result = await apiFetch("/hello", {}, HelloResponseSchema);
    expect(result).toEqual(payload);
  });

  it("throws VALIDATION_ERROR when response fails schema validation", async () => {
    const { apiFetch, ApiError } = await loadDemoApiClient();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "Hello!", timestamp: "not-a-date" }),
    });

    try {
      await apiFetch("/hello", {}, HelloResponseSchema);
      fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe("VALIDATION_ERROR");
    }
  });

  it("throws AUTH_ERROR when no demo token exists", async () => {
    const { apiFetch, ApiError } = await loadDemoApiClient();
    delete mockSessionStorage["demo_auth"];

    try {
      await apiFetch("/hello");
      fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe("AUTH_ERROR");
    }
  });

  it("throws NETWORK_ERROR on fetch failure", async () => {
    const { apiFetch, ApiError } = await loadDemoApiClient();

    mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

    try {
      await apiFetch("/hello");
      fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe("NETWORK_ERROR");
    }
  });

  it("throws AUTH_ERROR on 401 response", async () => {
    const { apiFetch, ApiError } = await loadDemoApiClient();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "UNAUTHORIZED", message: "Bad token" }),
    });

    try {
      await apiFetch("/hello");
      fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe("AUTH_ERROR");
      expect((err as InstanceType<typeof ApiError>).message).toBe("Bad token");
    }
  });

  it("throws SERVER_ERROR on 500 response", async () => {
    const { apiFetch, ApiError } = await loadDemoApiClient();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "SERVER_ERROR", message: "Internal error" }),
    });

    try {
      await apiFetch("/hello");
      fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe("SERVER_ERROR");
    }
  });

  it("throws NOT_FOUND on 404 response", async () => {
    const { apiFetch, ApiError } = await loadDemoApiClient();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "NOT_FOUND", message: "Endpoint not found" }),
    });

    try {
      await apiFetch("/hello");
      fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as InstanceType<typeof ApiError>).code).toBe("NOT_FOUND");
    }
  });
});
