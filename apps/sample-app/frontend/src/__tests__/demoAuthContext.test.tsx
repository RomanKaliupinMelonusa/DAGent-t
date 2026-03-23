// =============================================================================
// Unit Tests — demoAuthContext (DemoAuthProvider, useDemoAuth, getDemoToken)
// =============================================================================

import { render, screen, act, waitFor } from "@testing-library/react";
import { DemoAuthProvider, useDemoAuth, getDemoToken } from "@/lib/demoAuthContext";

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Test consumer component
// ---------------------------------------------------------------------------

function TestConsumer() {
  const { isAuthenticated, displayName, login, logout } = useDemoAuth();

  return (
    <div>
      <span data-testid="is-auth">{String(isAuthenticated)}</span>
      <span data-testid="display-name">{displayName ?? "none"}</span>
      <button data-testid="do-login" onClick={() => login("demo", "demopass")} />
      <button data-testid="do-logout" onClick={logout} />
    </div>
  );
}

function renderWithProvider() {
  return render(
    <DemoAuthProvider>
      <TestConsumer />
    </DemoAuthProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DemoAuthProvider", () => {
  it("starts unauthenticated when no stored token", () => {
    renderWithProvider();

    expect(screen.getByTestId("is-auth").textContent).toBe("false");
    expect(screen.getByTestId("display-name").textContent).toBe("none");
  });

  it("hydrates from sessionStorage if token exists", () => {
    sessionStorage.setItem(
      "demo_auth",
      JSON.stringify({ token: "stored-token", displayName: "Stored User" }),
    );

    renderWithProvider();

    // After useEffect hydration
    expect(screen.getByTestId("is-auth").textContent).toBe("true");
    expect(screen.getByTestId("display-name").textContent).toBe("Stored User");
  });

  it("login calls API and stores token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "new-token", displayName: "Demo User" }),
    });

    renderWithProvider();

    await act(async () => {
      screen.getByTestId("do-login").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("is-auth").textContent).toBe("true");
      expect(screen.getByTestId("display-name").textContent).toBe("Demo User");
    });

    // Verify token persisted to sessionStorage
    const stored = JSON.parse(sessionStorage.getItem("demo_auth")!);
    expect(stored.token).toBe("new-token");
    expect(stored.displayName).toBe("Demo User");
  });

  it("logout clears state and sessionStorage", async () => {
    sessionStorage.setItem(
      "demo_auth",
      JSON.stringify({ token: "existing-token", displayName: "User" }),
    );

    renderWithProvider();

    await act(async () => {
      screen.getByTestId("do-logout").click();
    });

    expect(screen.getByTestId("is-auth").textContent).toBe("false");
    expect(sessionStorage.getItem("demo_auth")).toBeNull();
  });
});

describe("getDemoToken", () => {
  it("returns token from sessionStorage", () => {
    sessionStorage.setItem(
      "demo_auth",
      JSON.stringify({ token: "my-token", displayName: "User" }),
    );

    expect(getDemoToken()).toBe("my-token");
  });

  it("returns null when no token stored", () => {
    expect(getDemoToken()).toBeNull();
  });

  it("returns null on corrupted storage", () => {
    sessionStorage.setItem("demo_auth", "not-json{{{");

    expect(getDemoToken()).toBeNull();
  });
});
