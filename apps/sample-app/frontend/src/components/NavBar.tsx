// =============================================================================
// NavBar — Navigation with dual-mode auth controls
// =============================================================================
// Renders NavBarEntra (MSAL hooks) or NavBarDemo (DemoAuthContext) based on
// NEXT_PUBLIC_AUTH_MODE. MSAL hooks can only be called inside <MsalProvider>,
// so the two variants are separate components to avoid hook-outside-provider
// errors in demo mode.
// =============================================================================

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";

const authMode = process.env.NEXT_PUBLIC_AUTH_MODE ?? "entra";

const HEALTH_URL =
  (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:7071/api") +
  "/health";

// ---------------------------------------------------------------------------
// HealthBadge — fetches /api/health (anonymous) and shows status
// ---------------------------------------------------------------------------

type HealthStatus = "loading" | "online" | "offline";

function HealthBadge() {
  const [status, setStatus] = useState<HealthStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch(HEALTH_URL, { method: "GET" });
        if (!cancelled) {
          setStatus(res.ok ? "online" : "offline");
        }
      } catch {
        if (!cancelled) {
          setStatus("offline");
        }
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "loading") {
    return (
      <span
        data-testid="health-badge"
        className="flex items-center gap-1.5 text-xs text-text-muted"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-text-muted" />
        Checking…
      </span>
    );
  }

  const isOnline = status === "online";

  return (
    <span
      data-testid="health-badge"
      className={`flex items-center gap-1.5 text-xs ${
        isOnline ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
      }`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          isOnline ? "bg-green-500" : "bg-red-500"
        }`}
      />
      {isOnline ? "System Online" : "Offline"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Shared — nav link styling helper
// ---------------------------------------------------------------------------

function navLinkClass(href: string, pathname: string) {
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return `text-sm font-medium transition-colors ${
    isActive
      ? "text-primary border-b-2 border-primary pb-0.5"
      : "text-text-muted hover:text-text-primary"
  }`;
}

// ---------------------------------------------------------------------------
// Shared — NavBar shell (logo, nav links, theme toggle)
// ---------------------------------------------------------------------------

function NavBarShell({ authSlot }: { authSlot: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-border bg-surface-card transition-colors duration-200">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold text-text-primary">
          Sample App.
        </Link>

        <div className="flex items-center gap-6">
          <nav className="flex items-center gap-6">
            <Link href="/" className={navLinkClass("/", pathname)}>
              Home
            </Link>
            <Link href="/about" className={navLinkClass("/about", pathname)}>
              About
            </Link>
          </nav>

          <HealthBadge />

          <ThemeToggle />

          <div className="flex items-center gap-3 border-l border-border pl-6">
            {authSlot}
          </div>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// NavBarEntra — MSAL hooks (only rendered inside <MsalProvider>)
// ---------------------------------------------------------------------------

function NavBarEntra() {
  const { useMsal, useIsAuthenticated } = require("@azure/msal-react") as typeof import("@azure/msal-react");
  const { loginRequest } = require("@/lib/authConfig") as typeof import("@/lib/authConfig");

  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const activeAccount = accounts[0];

  function handleLogin() {
    instance.loginRedirect(loginRequest);
  }

  function handleLogout() {
    instance.logoutRedirect({ postLogoutRedirectUri: "/" });
  }

  return (
    <NavBarShell
      authSlot={
        isAuthenticated && activeAccount ? (
          <>
            <span
              className="text-sm text-text-secondary"
              data-testid="user-display-name"
            >
              {activeAccount.name ?? activeAccount.username}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-md bg-surface-alt px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
              data-testid="sign-out-button"
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            onClick={handleLogin}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-text transition-colors hover:bg-primary-hover"
            data-testid="sign-in-button"
          >
            Sign in
          </button>
        )
      }
    />
  );
}

// ---------------------------------------------------------------------------
// NavBarDemo — DemoAuthContext (no MSAL dependency)
// ---------------------------------------------------------------------------

function NavBarDemo() {
  const { useDemoAuth } = require("@/lib/demoAuthContext") as typeof import("@/lib/demoAuthContext");
  const { isAuthenticated, displayName, logout } = useDemoAuth();

  return (
    <NavBarShell
      authSlot={
        isAuthenticated ? (
          <>
            <span
              className="text-sm text-text-secondary"
              data-testid="user-display-name"
            >
              {displayName ?? "Demo User"}
            </span>
            <button
              onClick={logout}
              className="rounded-md bg-surface-alt px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-hover"
              data-testid="sign-out-button"
            >
              Sign out
            </button>
          </>
        ) : null
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Exported NavBar — selects variant based on auth mode
// ---------------------------------------------------------------------------

export default function NavBar() {
  return authMode === "demo" ? <NavBarDemo /> : <NavBarEntra />;
}
