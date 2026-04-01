// =============================================================================
// Unit Tests — Audit Page
// =============================================================================

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mock apiFetch
// ---------------------------------------------------------------------------

const mockApiFetch = jest.fn();
jest.mock("@/lib/apiClient", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  ApiError: class ApiError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = "ApiError";
    }
  },
}));

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

import AuditPage from "../page";

beforeEach(() => {
  mockApiFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AuditPage", () => {
  it("renders table with audit log data", async () => {
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
        timestamp: "2026-04-01T12:05:00.000Z",
      },
    ];

    mockApiFetch.mockResolvedValueOnce(mockLogs);

    render(<AuditPage />);

    // Should show loading first
    expect(screen.getByTestId("audit-loading")).toBeInTheDocument();

    // Wait for data to render
    await waitFor(() => {
      expect(screen.getByTestId("audit-table")).toBeInTheDocument();
    });

    // Verify columns
    expect(screen.getByText("User ID")).toBeInTheDocument();
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Timestamp")).toBeInTheDocument();

    // Verify data rows
    const rows = screen.getAllByTestId("audit-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("demo")).toBeInTheDocument();
    expect(screen.getByText("USER_LOGIN")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("VIEW_PROFILE")).toBeInTheDocument();
  });

  it("renders error state on API failure", async () => {
    const { ApiError } = jest.requireMock("@/lib/apiClient") as {
      ApiError: new (code: string, msg: string) => Error;
    };
    mockApiFetch.mockRejectedValueOnce(
      new ApiError("SERVER_ERROR", "Cosmos DB unavailable"),
    );

    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByTestId("audit-error")).toBeInTheDocument();
    });

    expect(screen.getByText("Cosmos DB unavailable")).toBeInTheDocument();
  });

  it("renders empty state when no logs exist", async () => {
    mockApiFetch.mockResolvedValueOnce([]);

    render(<AuditPage />);

    await waitFor(() => {
      expect(screen.getByTestId("audit-empty")).toBeInTheDocument();
    });

    expect(
      screen.getByText("No audit events recorded yet."),
    ).toBeInTheDocument();
  });

  it("calls apiFetch with correct path", async () => {
    mockApiFetch.mockResolvedValueOnce([]);

    render(<AuditPage />);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/audit",
        {},
        expect.anything(),
      );
    });
  });
});
