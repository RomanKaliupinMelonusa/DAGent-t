// =============================================================================
// Unit Tests — DemoLoginForm
// =============================================================================

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import DemoLoginForm from "../DemoLoginForm";
import { DemoAuthProvider } from "@/lib/demoAuthContext";

// ---------------------------------------------------------------------------
// Mock sessionStorage
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
  Object.keys(mockSessionStorage).forEach((k) => delete mockSessionStorage[k]);
});

// ---------------------------------------------------------------------------
// Helper — wrap in provider
// ---------------------------------------------------------------------------

function renderWithAuth() {
  return render(
    <DemoAuthProvider>
      <DemoLoginForm />
    </DemoAuthProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DemoLoginForm", () => {
  it("renders username and password fields", () => {
    renderWithAuth();

    expect(screen.getByTestId("demo-username")).toBeInTheDocument();
    expect(screen.getByTestId("demo-password")).toBeInTheDocument();
    expect(screen.getByTestId("demo-login-submit")).toBeInTheDocument();
  });

  it("renders sign-in heading", () => {
    renderWithAuth();

    expect(screen.getByText("Sample App")).toBeInTheDocument();
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
  });

  it("shows error on failed login", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "UNAUTHORIZED", message: "Invalid username or password." }),
    });

    renderWithAuth();

    await user.type(screen.getByTestId("demo-username"), "wrong");
    await user.type(screen.getByTestId("demo-password"), "wrong");
    await user.click(screen.getByTestId("demo-login-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("demo-login-error")).toBeInTheDocument();
    });
  });

  it("calls fetch with correct login payload", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "abc-123", displayName: "Demo User" }),
    });

    renderWithAuth();

    await user.type(screen.getByTestId("demo-username"), "demo");
    await user.type(screen.getByTestId("demo-password"), "demopass");
    await user.click(screen.getByTestId("demo-login-submit"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/auth/login"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ username: "demo", password: "demopass" }),
        }),
      );
    });
  });

  it("disables submit button while loading", async () => {
    const user = userEvent.setup();

    // Never resolve — keep the request pending
    let resolvePromise: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePromise = resolve;
      }),
    );

    renderWithAuth();

    await user.type(screen.getByTestId("demo-username"), "demo");
    await user.type(screen.getByTestId("demo-password"), "demopass");
    await user.click(screen.getByTestId("demo-login-submit"));

    expect(screen.getByTestId("demo-login-submit")).toBeDisabled();

    // Cleanup
    resolvePromise!({
      ok: true,
      json: async () => ({ token: "abc", displayName: "User" }),
    });
  });
});
