// =============================================================================
// Unit Tests — NavBar HealthBadge
// =============================================================================
// Tests the HealthBadge component inside NavBarShell:
//   - "System Online" on successful /api/health fetch
//   - "Offline" on fetch failure
// =============================================================================

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mocks — jest.mock calls are hoisted before imports by the Jest transform
// ---------------------------------------------------------------------------

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock ThemeToggle — simple stub
jest.mock("../ThemeToggle", () => {
  return function MockThemeToggle() {
    return <button data-testid="theme-toggle">Toggle</button>;
  };
});

// Mock authConfig to avoid MSAL BrowserAuthError in jsdom (no Web Crypto API)
jest.mock("@/lib/authConfig", () => ({
  msalConfig: {},
  loginRequest: { scopes: [] },
  msalInstance: {},
}));

// Mock MSAL React — the default auth mode is "entra" (module-level const),
// so NavBarEntra renders. These mocks prevent crypto errors in jsdom.
jest.mock("@azure/msal-react", () => ({
  useMsal: () => ({ instance: { loginRedirect: jest.fn() }, accounts: [] }),
  useIsAuthenticated: () => false,
}));

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
globalThis.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Import component — auth mode defaults to "entra" but MSAL is mocked.
// HealthBadge lives inside NavBarShell, which is rendered by both variants.
// ---------------------------------------------------------------------------

import NavBar from "../NavBar";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NavBar HealthBadge", () => {
  it('renders "System Online" when /api/health returns 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
    });

    render(<NavBar />);

    const badge = screen.getByTestId("health-badge");
    expect(badge).toBeInTheDocument();

    await waitFor(() => {
      expect(badge).toHaveTextContent("System Online");
    });
  });

  it('renders "Offline" when /api/health returns non-OK status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal Server Error" }),
    });

    render(<NavBar />);

    const badge = screen.getByTestId("health-badge");
    expect(badge).toBeInTheDocument();

    await waitFor(() => {
      expect(badge).toHaveTextContent("Offline");
    });
  });

  it('renders "Offline" when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    render(<NavBar />);

    const badge = screen.getByTestId("health-badge");
    expect(badge).toBeInTheDocument();

    await waitFor(() => {
      expect(badge).toHaveTextContent("Offline");
    });
  });

  it("calls fetch with the health endpoint URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
    });

    render(<NavBar />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/health"),
        expect.objectContaining({ method: "GET" }),
      );
    });
  });

  it('shows "Checking…" in loading state initially', () => {
    // Never resolve — keep the fetch pending
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    render(<NavBar />);

    const badge = screen.getByTestId("health-badge");
    expect(badge).toHaveTextContent("Checking…");
  });
});
