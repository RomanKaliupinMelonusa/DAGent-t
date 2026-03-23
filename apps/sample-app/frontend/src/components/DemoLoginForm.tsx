// =============================================================================
// DemoLoginForm — Username/password login form for demo mode
// =============================================================================

"use client";

import { useState, type FormEvent } from "react";
import { useDemoAuth } from "@/lib/demoAuthContext";
import { Button, Input } from "@/components/ui/primitives";

export default function DemoLoginForm() {
  const { login } = useDemoAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login(username, password);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Invalid username or password.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface-card p-8 shadow-lg transition-colors duration-200">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-text-primary">Sample App</h1>
          <p className="mt-2 text-sm text-text-muted">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Username
            </label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              autoFocus
              placeholder="Enter username"
              data-testid="demo-username"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter password"
              data-testid="demo-password"
            />
          </div>

          {error && (
            <div
              className="rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger-text"
              role="alert"
              data-testid="demo-login-error"
            >
              <div className="flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0">
                  <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                </svg>
                <p>{error}</p>
              </div>
            </div>
          )}

          <Button type="submit" disabled={isLoading} className="w-full" data-testid="demo-login-submit">
            {isLoading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
