// =============================================================================
// Unit Tests — DemoLoginForm
// =============================================================================

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DemoLoginForm from "@/components/DemoLoginForm";
import { DemoAuthProvider } from "@/lib/demoAuthContext";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
global.fetch = mockFetch;

function renderLoginForm() {
  return render(
    <DemoAuthProvider>
      <DemoLoginForm />
    </DemoAuthProvider>,
  );
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DemoLoginForm", () => {
  it("renders username and password fields", () => {
    renderLoginForm();

    expect(screen.getByTestId("demo-username")).toBeInTheDocument();
    expect(screen.getByTestId("demo-password")).toBeInTheDocument();
    expect(screen.getByTestId("demo-login-submit")).toBeInTheDocument();
  });

  it("renders the sign-in heading", () => {
    renderLoginForm();

    expect(screen.getByText("Sample App")).toBeInTheDocument();
    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
  });

  it("submits credentials and calls the login API", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: "test-token-123", displayName: "Demo User" }),
    });

    renderLoginForm();

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

  it("displays an error when login fails", async () => {
    const user = userEvent.setup();

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Invalid credentials" }),
    });

    renderLoginForm();

    await user.type(screen.getByTestId("demo-username"), "wrong");
    await user.type(screen.getByTestId("demo-password"), "wrong");
    await user.click(screen.getByTestId("demo-login-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("demo-login-error")).toBeInTheDocument();
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });
  });

  it("disables submit button while loading", async () => {
    const user = userEvent.setup();

    // Never resolves during the test — simulates slow network
    mockFetch.mockReturnValueOnce(new Promise(() => {}));

    renderLoginForm();

    await user.type(screen.getByTestId("demo-username"), "demo");
    await user.type(screen.getByTestId("demo-password"), "demopass");
    await user.click(screen.getByTestId("demo-login-submit"));

    expect(screen.getByTestId("demo-login-submit")).toBeDisabled();
    expect(screen.getByText("Signing in…")).toBeInTheDocument();
  });
});
