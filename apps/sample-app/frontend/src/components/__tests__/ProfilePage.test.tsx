// =============================================================================
// Unit Tests — ProfilePage
// =============================================================================

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import ProfilePage from "@/app/profile/page";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/profile",
}));

const mockApiFetch = jest.fn();
jest.mock("@/lib/apiClient", () => {
  const { ApiError: RealApiError } = jest.requireActual("@/lib/apiClient");
  return {
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
    ApiError: RealApiError,
  };
});

const mockUseDemoAuth = jest.fn();
jest.mock("@/lib/demoAuthContext", () => ({
  useDemoAuth: () => mockUseDemoAuth(),
  getDemoToken: () => "tok",
}));

// Import ApiError for test assertions
import { ApiError } from "@/lib/apiClient";

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  displayName: "Demo User",
  email: "demo@example.com",
  theme: "system",
};

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockApiFetch.mockReset();
  mockPush.mockReset();
  mockReplace.mockReset();
  mockUseDemoAuth.mockReturnValue({
    isAuthenticated: true,
    displayName: "Demo",
    token: "tok",
    login: jest.fn(),
    logout: jest.fn(),
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProfilePage", () => {
  it("shows loading state", () => {
    // Never-resolving promise keeps loading forever
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

    expect(screen.getByTestId("profile-displayname")).toHaveValue("Demo User");
    expect(screen.getByTestId("profile-theme")).toHaveValue("system");
  });

  it("shows error banner when save fails with ApiError", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(mockProfile)
      .mockRejectedValueOnce(
        new ApiError("VALIDATION_ERROR", "Display name too short", 400),
      );

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("save-profile-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("profile-error")).toHaveTextContent(
        "Display name too short",
      ),
    );
  });

  it("disables button and shows Saving... while saving", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(mockProfile)
      .mockReturnValueOnce(new Promise(() => {})); // Never resolves

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("save-profile-btn"));

    const btn = screen.getByTestId("save-profile-btn");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Saving...");
  });

  it("updates form with PATCH response data", async () => {
    const user = userEvent.setup();
    const updatedProfile = {
      ...mockProfile,
      displayName: "New Name",
      theme: "dark",
    };

    mockApiFetch
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(updatedProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    const nameInput = screen.getByTestId("profile-displayname");
    await user.clear(nameInput);
    await user.type(nameInput, "New Name");

    await user.selectOptions(screen.getByTestId("profile-theme"), "dark");
    await user.click(screen.getByTestId("save-profile-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("profile-success")).toBeInTheDocument(),
    );

    expect(screen.getByTestId("profile-displayname")).toHaveValue("New Name");
    expect(screen.getByTestId("profile-theme")).toHaveValue("dark");
  });

  it("clears error banner on input change", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(mockProfile)
      .mockRejectedValueOnce(
        new ApiError("VALIDATION_ERROR", "Display name too short", 400),
      );

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("save-profile-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("profile-error")).toBeInTheDocument(),
    );

    await user.type(screen.getByTestId("profile-displayname"), "x");

    expect(screen.queryByTestId("profile-error")).not.toBeInTheDocument();
  });

  it("clears success banner on input change", async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(mockProfile)
      .mockResolvedValueOnce(mockProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    await user.click(screen.getByTestId("save-profile-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("profile-success")).toBeInTheDocument(),
    );

    await user.type(screen.getByTestId("profile-displayname"), "x");

    expect(screen.queryByTestId("profile-success")).not.toBeInTheDocument();
  });

  it("shows error when fetch fails on mount", async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError("SERVER_ERROR", "Internal server error", 500),
    );

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.getByTestId("profile-error")).toHaveTextContent(
        "Internal server error",
      ),
    );

    // Form inputs should not be rendered when profile is null
    expect(screen.queryByTestId("profile-displayname")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users to home", () => {
    mockUseDemoAuth.mockReturnValue({
      isAuthenticated: false,
      displayName: null,
      token: null,
      login: jest.fn(),
      logout: jest.fn(),
    });
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    render(<ProfilePage />);

    expect(mockReplace).toHaveBeenCalledWith("/");
  });
});
