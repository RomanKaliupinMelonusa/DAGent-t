// =============================================================================
// Profile Page — User profile view & edit form
// =============================================================================
// Authenticated page for viewing and updating user profile details.
// Fetches profile on mount, displays form for displayName + theme updates.
// =============================================================================

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { UserProfileSchema, type UserProfile } from "@branded/schemas";
import { useDemoAuth } from "@/lib/demoAuthContext";
import { Button, Input } from "@/components/ui/primitives";

export default function ProfilePage() {
  const { isAuthenticated } = useDemoAuth();
  const router = useRouter();

  // Redirect if not authenticated (defense-in-depth alongside DemoGate)
  useEffect(() => {
    if (!isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [theme, setTheme] = useState("system");

  // ---------------------------------------------------------------------------
  // Fetch profile on mount
  // ---------------------------------------------------------------------------

  useEffect(() => {
    apiFetch<UserProfile>("/profile", {}, UserProfileSchema)
      .then((p) => {
        setProfile(p);
        setDisplayName(p.displayName);
        setTheme(p.theme);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : String(e)),
      )
      .finally(() => setIsLoading(false));
  }, []);

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSaving(true);

    try {
      const updated = await apiFetch<UserProfile>(
        "/profile",
        {
          method: "PATCH",
          body: JSON.stringify({ displayName, theme }),
        },
        UserProfileSchema,
      );
      setProfile(updated);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div data-testid="profile-loading" className="flex justify-center py-12">
        <span className="text-text-secondary">Loading profile…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">Profile</h1>

      {error && (
        <div
          data-testid="profile-error"
          className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text"
          role="alert"
        >
          {error}
        </div>
      )}

      {success && (
        <div
          data-testid="profile-success"
          className="rounded-lg border border-success-border bg-success-bg px-4 py-3 text-sm text-success-text"
        >
          Profile updated!
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface-card p-6 transition-colors duration-200">
        {profile && (
          <div className="mb-6 space-y-1 text-sm text-text-secondary">
            <p>
              <span className="font-medium text-text-primary">Email:</span>{" "}
              {profile.email}
            </p>
            <p>
              <span className="font-medium text-text-primary">ID:</span>{" "}
              {profile.id}
            </p>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Display Name
            </label>
            <Input
              id="displayName"
              data-testid="profile-displayname"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <label
              htmlFor="theme"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Theme
            </label>
            <select
              id="theme"
              data-testid="profile-theme"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              className="w-full rounded-lg border border-border-input bg-surface-alt px-3 py-2 text-sm text-text-primary transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>

          <Button
            data-testid="save-profile-btn"
            type="submit"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </form>
      </div>
    </div>
  );
}
