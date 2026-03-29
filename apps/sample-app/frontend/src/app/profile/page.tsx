// =============================================================================
// Profile Page — View and edit user profile
// =============================================================================
// Authenticated page for viewing/updating display name and theme preference.
// Uses apiFetch with Zod schema validation for runtime safety.
// =============================================================================

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/apiClient";
import { useDemoAuth } from "@/lib/demoAuthContext";
import { UserProfileSchema, type UserProfile } from "@branded/schemas";
import { Button, Input } from "@/components/ui/primitives";

export default function ProfilePage() {
  const { isAuthenticated } = useDemoAuth();
  const router = useRouter();

  // Auth guard — defense-in-depth alongside global DemoGate
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

  // Form fields
  const [displayName, setDisplayName] = useState("");
  const [theme, setTheme] = useState("");

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
      setDisplayName(updated.displayName);
      setTheme(updated.theme);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Clear banners on input change
  // ---------------------------------------------------------------------------

  function handleDisplayNameChange(value: string) {
    setDisplayName(value);
    setError(null);
    setSuccess(false);
  }

  function handleThemeChange(value: string) {
    setTheme(value);
    setError(null);
    setSuccess(false);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div data-testid="profile-loading" className="flex justify-center py-12">
        <span>Loading profile…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-primary">User Profile</h1>

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

      {profile && (
        <div className="rounded-lg border border-border bg-surface-card p-6 transition-colors duration-200">
          <p className="mb-4 text-sm text-text-secondary">
            Email: <span className="font-medium text-text-primary">{profile.email}</span>
          </p>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label
                htmlFor="profile-displayname"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Display Name
              </label>
              <Input
                id="profile-displayname"
                data-testid="profile-displayname"
                value={displayName}
                onChange={(e) => handleDisplayNameChange(e.target.value)}
              />
            </div>

            <div>
              <label
                htmlFor="profile-theme"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Theme
              </label>
              <select
                id="profile-theme"
                data-testid="profile-theme"
                value={theme}
                onChange={(e) => handleThemeChange(e.target.value)}
                className="w-full border border-border-input bg-surface-alt rounded-lg px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              >
                <option value="light">light</option>
                <option value="dark">dark</option>
                <option value="system">system</option>
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
      )}
    </div>
  );
}
