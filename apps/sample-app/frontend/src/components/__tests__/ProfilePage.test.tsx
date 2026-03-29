// =============================================================================
// Unit Tests — ProfilePage
// =============================================================================

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/profile",
}));

jest.mock("@/lib/demoAuthContext", () => ({
  useDemoAuth: () => ({
    isAuthenticated: true,
    displayName: "Demo",
    token: "tok",
    login: jest.fn(),
    logout: jest.fn(),
  }),
  getDemoToken: () => "tok",
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/apiClient", () => {
  const actual = jest.requireActual("@/lib/apiClient");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

// Must import AFTER jest.mock declarations
import ProfilePage from "@/app/profile/page";
import { ApiError } from "@/lib/apiClient";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  displayName: "Demo User",
  email: "demo@example.com",
  theme: "system" as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProfilePage", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockPush.mockReset();
    mockReplace.mockReset();
  });

  it("shows loading state", () => {
    // Never resolve — keeps loading state
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    render(<ProfilePage />);

    expect(screen.getByTestId("profile-loading")).toBeInTheDocument();
  });

  it("renders profile form after loading", async () => {
    mockApiFetch.mockResolvedValue(mockProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    const nameInput = screen.getByTestId("profile-displayname");
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).toHaveValue("Demo User");

    const themeSelect = screen.getByTestId("profile-theme");
    expect(themeSelect).toBeInTheDocument();
    expect(themeSelect).toHaveValue("system");
  });

  it("shows error banner on save failure", async () => {
    const user = userEvent.setup();

    // First call (GET): resolve with profile
    mockApiFetch.mockResolvedValueOnce(mockProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    // Second call (PATCH): reject with ApiError
    mockApiFetch.mockRejectedValueOnce(
      new ApiError("VALIDATION_ERROR", "Display name too short", 400),
    );

    await user.click(screen.getByTestId("save-profile-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("profile-error")).toHaveTextContent(
        "Display name too short",
      ),
    );
  });

  it("disables save button and shows 'Saving...' during save", async () => {
    const user = userEvent.setup();

    // GET: resolve
    mockApiFetch.mockResolvedValueOnce(mockProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    // PATCH: never resolve — keep saving state
    let resolvePatch: (v: unknown) => void;
    mockApiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePatch = resolve;
      }),
    );

    await user.click(screen.getByTestId("save-profile-btn"));

    const btn = screen.getByTestId("save-profile-btn");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Saving...");

    // Cleanup
    resolvePatch!(mockProfile);
  });

  it("shows success banner after successful save", async () => {
    const user = userEvent.setup();

    // GET: resolve with profile
    mockApiFetch.mockResolvedValueOnce(mockProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    // PATCH: resolve with updated profile
    mockApiFetch.mockResolvedValueOnce({
      ...mockProfile,
      displayName: "Updated User",
      theme: "dark",
    });

    await user.click(screen.getByTestId("save-profile-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("profile-success")).toHaveTextContent(
        "Profile updated!",
      ),
    );
  });
});
