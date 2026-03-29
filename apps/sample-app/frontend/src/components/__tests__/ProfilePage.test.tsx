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
// Reset
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

  it("renders form after profile loads", async () => {
    mockApiFetch.mockResolvedValue(mockProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    const input = screen.getByTestId("profile-displayname") as HTMLInputElement;
    expect(input.value).toBe("Demo User");

    const select = screen.getByTestId("profile-theme") as HTMLSelectElement;
    expect(select.value).toBe("system");
  });

  it("shows error banner on save failure", async () => {
    const { ApiError } = jest.requireActual("@/lib/apiClient");

    // First call: GET profile succeeds
    mockApiFetch.mockResolvedValueOnce(mockProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    // Second call: PATCH fails
    mockApiFetch.mockRejectedValueOnce(
      new ApiError("VALIDATION_ERROR", "Display name too short", 400),
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("save-profile-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("profile-error")).toHaveTextContent(
        "Display name too short",
      ),
    );
  });

  it("disables button and shows Saving... while saving", async () => {
    // GET profile succeeds
    mockApiFetch.mockResolvedValueOnce(mockProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    // PATCH: never resolves
    let resolvePatch: (v: unknown) => void;
    mockApiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePatch = resolve;
      }),
    );

    const user = userEvent.setup();
    await user.click(screen.getByTestId("save-profile-btn"));

    const btn = screen.getByTestId("save-profile-btn");
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent("Saving...");

    // Cleanup
    resolvePatch!(mockProfile);
  });

  it("shows success banner after save", async () => {
    // GET profile succeeds
    mockApiFetch.mockResolvedValueOnce(mockProfile);

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.queryByTestId("profile-loading")).not.toBeInTheDocument(),
    );

    // PATCH succeeds with updated profile
    const updatedProfile = { ...mockProfile, displayName: "New Name" };
    mockApiFetch.mockResolvedValueOnce(updatedProfile);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("save-profile-btn"));

    await waitFor(() =>
      expect(screen.getByTestId("profile-success")).toHaveTextContent(
        "Profile updated!",
      ),
    );
  });
});
