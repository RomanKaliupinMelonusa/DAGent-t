// =============================================================================
// Unit Tests — apiClient (apiFetch, ApiError)
// =============================================================================

// MUST set auth mode BEFORE importing apiClient (module-level constant)
process.env.NEXT_PUBLIC_AUTH_MODE = "demo";

import { apiFetch, ApiError } from "@/lib/apiClient";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
  sessionStorage.setItem(
    "demo_auth",
    JSON.stringify({ token: "test-token-abc", displayName: "Test User" }),
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("apiFetch", () => {
  it("sends X-Demo-Token header in demo mode", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "Hello" }),
    });

    await apiFetch("/hello");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/hello"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Demo-Token": "test-token-abc",
        }),
      }),
    );
  });

  it("returns parsed JSON on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "Hello, World!", timestamp: "2026-01-01T00:00:00Z" }),
    });

    const data = await apiFetch<{ message: string; timestamp: string }>("/hello");

    expect(data.message).toBe("Hello, World!");
    expect(data.timestamp).toBe("2026-01-01T00:00:00Z");
  });

  it("throws AUTH_ERROR when no token is available", async () => {
    sessionStorage.clear();

    await expect(apiFetch("/hello")).rejects.toThrow(ApiError);
    await expect(apiFetch("/hello")).rejects.toMatchObject({
      code: "AUTH_ERROR",
    });
  });

  it("throws AUTH_ERROR on 401 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: "Unauthorized" }),
    });

    await expect(apiFetch("/hello")).rejects.toMatchObject({
      code: "AUTH_ERROR",
      status: 401,
    });
  });

  it("throws NOT_FOUND on 404 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ message: "Not found" }),
    });

    await expect(apiFetch("/missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("throws SERVER_ERROR on 500 response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: "Internal server error" }),
    });

    await expect(apiFetch("/broken")).rejects.toMatchObject({
      code: "SERVER_ERROR",
      status: 500,
    });
  });

  it("throws NETWORK_ERROR on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(apiFetch("/hello")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});

describe("ApiError", () => {
  it("has correct name and properties", () => {
    const err = new ApiError("AUTH_ERROR", "Token expired", 401);

    expect(err.name).toBe("ApiError");
    expect(err.code).toBe("AUTH_ERROR");
    expect(err.message).toBe("Token expired");
    expect(err.status).toBe(401);
    expect(err).toBeInstanceOf(Error);
  });
});
