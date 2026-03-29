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

const mockApiFetch = jest.fn();
jest.mock("@/lib/apiClient", () => {
  const actual = jest.requireActual("@/lib/apiClient");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
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

// Import after mocks
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
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockApiFetch.mockReset();
  mockReplace.mockReset();
  mockPush.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProfilePage", () => {
  it("shows loading state initially", () => {
    // Never-resolving promise to keep loading state
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<ProfilePage />);
    expect(screen.getByTestId("profile-loading")).toBeInTheDocument();
  });

  it("renders profile form after successful fetch", async () => {
    mockApiFetch.mockResolvedValue(mockProfile);
    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    const nameInput = screen.getByTestId("profile-displayname");
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).toHaveValue("Demo User");

    const themeSelect = screen.getByTestId("profile-theme");
    expect(themeSelect).toHaveValue("system");
  });

  it("shows error banner on save failure", async () => {
    const user = userEvent.setup();

    // First call: GET profile succeeds
    mockApiFetch.mockResolvedValueOnce(mockProfile);

    render(<ProfilePage />);

    // Wait for loading to finish
    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    // Second call: PATCH fails
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

  it("disables save button while saving", async () => {
    const user = userEvent.setup();

    // GET succeeds
    mockApiFetch.mockResolvedValueOnce(mockProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    // PATCH never resolves
    mockApiFetch.mockReturnValueOnce(new Promise(() => {}));

    await user.click(screen.getByTestId("save-profile-btn"));

    const btn = screen.getByTestId("save-profile-btn");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Saving...");
  });
});
